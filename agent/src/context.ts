import type { Concept, Session, JourneyNode, Memory, ConceptState, PlanStep, LogEntry } from './types.js';
import { buildPlan } from './plan-builder.js';
import { cms, lp } from './api.js';

export interface AgentContext {
  session:     Session;
  concept:     Concept;
  journeyNode: JourneyNode;
  memories:    Memory[];
  plan:        PlanStep[];   // compiled fresh each session, lives in memory only
  log:         (entry: LogEntry) => void;
}

export async function buildContext(studentId: string, conceptId: string, journeyNodeId: string): Promise<AgentContext> {
  const [concept, journeyNode, sessions, memories] = await Promise.all([
    cms.get<Concept>(`/concepts/${conceptId}`),
    lp.get<JourneyNode>(`/journey-nodes/${journeyNodeId}`),
    lp.get<Session[]>(`/students/${studentId}/sessions?conceptId=${conceptId}&status=started`),
    lp.get<Memory[]>(`/students/${studentId}/memories?conceptId=${conceptId}`),
  ]);

  const session = sessions[0] ?? await createSession(studentId, conceptId, journeyNodeId, journeyNode.state);
  const plan    = buildPlan(concept, journeyNode.state);

  return { session, concept, journeyNode, memories, plan, log: () => {} };
}

async function createSession(studentId: string, conceptId: string, journeyNodeId: string, state: ConceptState): Promise<Session> {
  const now = new Date().toISOString();
  return lp.post<Session>('/sessions', {
    studentId, conceptId, journeyNodeId,
    status: 'initialised', conceptStateAtStart: state, conceptStateAtEnd: null,
    teachingPlan: { content: '', createdAt: now, updatedAt: now },
    history: [], memory: [], createdAt: now, endedAt: null,
  });
}
