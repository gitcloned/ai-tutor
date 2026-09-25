import type { Concept, Session, JourneyNode, Memory, ConceptState, PlanStep, PlanHistoryEntry, LogEntry, Question } from './types.js';
import type { ImageBlob }   from './medium/modalities/input/types.js';
import { CS }               from './types.js';
import { whatIsNext, isTransitionState } from './learning/what-is-next.js';
import { buildConceptPlan } from './learning/stateManagement.js';
import { buildModelPrompt } from './learning/modelPrompt.js';
import { PracticeExercise } from './learning/practiceExercise.js';
import { hasQuestionsJson, loadQuestionsFromJson } from './learning/plan-builder-v2.js';
import { cms, lp }          from './api.js';

export interface AgentContext {
  session:        Session;
  concept:        Concept;
  journeyNode:    JourneyNode;
  memories:       Memory[];
  plan:           PlanStep[];   // compiled fresh each session, lives in memory only
  modelPrompt:    string;       // prompt fragment for interactive models declared in the plan
  log:            (entry: LogEntry) => void;
  outputPrompt?:  string;       // injected by session manager from medium.promptTemplate()
  currentImages?: ImageBlob[];  // set by agent.send() for the current turn; consumed by engine
  /** Present when the concept has mastery questions and state is mastering/getting_exam_ready. */
  practice?:      PracticeExercise;
}

/**
 * Build the agent context for a student + journey node.
 *
 * On entry this function acts as the single gating point for "what does this
 * student do next?":
 *
 *   • Transition states (assessing / learning / mastering / getting_exam_ready)
 *     → the student is mid-flow; resume the existing plan for that state.
 *
 *   • Checkpoint states (not_assessed / clarity / mastered / exam_ready)
 *     → a phase boundary; call whatIsNext to advance the node and start a
 *       fresh session for the new state.
 *
 *   • learn_pre_req_before
 *     → the node is paused waiting for a prereq; redirect to that prereq's node.
 */
export async function buildContext(studentId: string, conceptId: string, journeyNodeId: string): Promise<AgentContext> {
  const [concept, journeyNode, memories] = await Promise.all([
    cms.get<Concept>(`/concepts/${conceptId}`),
    lp.get<JourneyNode>(`/journey-nodes/${journeyNodeId}`),
    lp.get<Memory[]>(`/students/${studentId}/memories?conceptId=${conceptId}`),
  ]);

  // ── Paused waiting for a prereq ──────────────────────────────────────────────
  if (journeyNode.state === CS.LEARN_PRE_REQ_BEFORE && journeyNode.preReqToLearn) {
    const prereqNodes = await lp.get<JourneyNode[]>(
      `/journey-nodes?journeyId=${journeyNode.journeyId}&conceptId=${journeyNode.preReqToLearn}`,
    );
    const prereqNode = prereqNodes[0];
    if (prereqNode) {
      return buildContext(studentId, journeyNode.preReqToLearn, prereqNode.id);
    }
    // prereq node missing — fall through and start fresh for current concept
  }

  // ── Transition state — resume existing session ────────────────────────────────
  if (isTransitionState(journeyNode.state)) {
    const sessions = await lp.get<Session[]>(
      `/students/${studentId}/sessions?conceptId=${conceptId}&status=started`,
    );
    const { plan, models } = buildConceptPlan(concept, journeyNode.state);
    const modelPrompt = buildModelPrompt(models);
    const session = sessions[0] ?? await createSession(studentId, conceptId, journeyNodeId, journeyNode.state);
    if (session.planHistory.length === 0) {
      session.planHistory.push({ conceptId: concept.id, conceptTitle: concept.title, plan, startedAt: new Date().toISOString() });
    }
    const practice = await loadPractice(journeyNode.state, concept.id, session);
    return { session, concept, journeyNode, memories, plan, modelPrompt, log: () => {}, practice };
  }

  // ── Checkpoint state — advance via whatIsNext ─────────────────────────────────
  const move = whatIsNext({
    currentNode:     { conceptId: concept.id, state: journeyNode.state, goTo: journeyNode.goTo, cameFrom: journeyNode.cameFrom },
    supportedPhases: concept.supportedPhases ?? [],
    resuming:        false,
  });

  if (move.updateToCurrentNode) {
    await lp.patch(`/journey-nodes/${journeyNode.id}`, move.updateToCurrentNode);
    Object.assign(journeyNode, move.updateToCurrentNode);
  }

  // Redirect to next concept (go-to-next-concept or go-to-origin)
  if (move.nextConceptId) {
    const nextNodes = await lp.get<JourneyNode[]>(
      `/journey-nodes?journeyId=${journeyNode.journeyId}&conceptId=${move.nextConceptId}`,
    );
    const nextNode = nextNodes[0];
    if (nextNode) {
      if (move.updateToNextNode) {
        await lp.patch(`/journey-nodes/${nextNode.id}`, move.updateToNextNode);
        Object.assign(nextNode, move.updateToNextNode);
      }
      return buildContext(studentId, move.nextConceptId, nextNode.id);
    }
  }

  // advance-state: node state already updated above; create fresh session for new phase
  const { plan, models } = buildConceptPlan(concept, journeyNode.state);
  const modelPrompt = buildModelPrompt(models);
  const session = await createSession(studentId, conceptId, journeyNodeId, journeyNode.state);
  session.planHistory.push({ conceptId: concept.id, conceptTitle: concept.title, plan, startedAt: new Date().toISOString() });
  const practice = await loadPractice(journeyNode.state, concept.id, session);

  return { session, concept, journeyNode, memories, plan, modelPrompt, log: () => {}, practice };
}

/**
 * Load a PracticeExercise for the session if the state is mastering or
 * getting_exam_ready and the concept has mastery questions on the CMS.
 * Returns undefined if practice is not applicable.
 */
async function loadPractice(state: ConceptState, conceptId: string, session: Session): Promise<PracticeExercise | undefined> {
  if (state !== CS.MASTERING && state !== CS.GETTING_EXAM_READY) return undefined;
  // Prefer questions.json from content folder; fall back to CMS DB.
  let questions: Question[];
  if (hasQuestionsJson(conceptId)) {
    questions = loadQuestionsFromJson(conceptId);
  } else {
    questions = await cms.get<Question[]>(`/concepts/${conceptId}/mastery-questions`).catch(() => []);
  }
  if (!questions.length) return undefined;
  return new PracticeExercise(questions, session.questionProgress ?? [], session.id);
}

export async function createSession(
  studentId: string, conceptId: string, journeyNodeId: string, state: ConceptState,
  observationToStartWith?: string,
): Promise<Session> {
  const now = new Date().toISOString();
  return lp.post<Session>('/sessions', {
    ...(observationToStartWith ? { observationToStartWith } : {}),
    studentId, conceptId, journeyNodeId,
    status: 'initialised', conceptStateAtStart: state, conceptStateAtEnd: null,
    teachingPlan: { content: '', createdAt: now, updatedAt: now },
    planHistory: [],
    history: [], memory: [], createdAt: now, endedAt: null,
  });
}
