import { newAgent }       from './agent.js';
import { lp, cms }       from './api.js';
import type { Transport } from './transport.js';
import type { TurnEvent } from './engine.js';
import { DefaultMedium }  from './medium/default.js';
import { OutputParser }   from './medium/modalities/output/parser.js';
import { InputParser }    from './medium/modalities/input/parser.js';
import { makeSessionEvent } from './session-meta.js';
import type { Session, Journey, JourneyNode, Concept } from './types.js';
import { CS } from './types.js';

type Agent = Awaited<ReturnType<typeof newAgent>>;

async function persistSession(ctx: import('./context.js').AgentContext): Promise<void> {
  if (ctx.session.status === 'initialised') return;
  await lp.patch(`/sessions/${ctx.session.id}`, {
    history:      ctx.session.history,
    rawHistory:   ctx.session.rawHistory,
    systemPrompt: ctx.session.systemPrompt,
    planHistory:  ctx.session.planHistory,
    teachingPlan: ctx.session.teachingPlan,
  }).catch(() => { });
}

interface ActiveSession {
  agent:   Agent;
  resumed: boolean;
}

export interface CreateSessionOptions {
  studentId:        string;
  conceptId:        string;
  /** Topic that initiated this session — used to resolve the correct subject journey. */
  topicId?:         string;
  /** If provided and still active, reuse the existing session without creating a new one. */
  resumeSessionId?: string;
  /** Override node state (local testing only). */
  forceState?:      string;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  /**
   * Create or resume a session for this student + concept.
   *
   * Resolves the correct subject journey via `topicId` (provided or derived from
   * the concept's CMS topic link). No fallback to journeys[0]; missing subject
   * links produce a clear error.
   */
  async create(opts: CreateSessionOptions): Promise<{ sessionId: string; resumed: boolean }> {
    const { studentId, conceptId, topicId, resumeSessionId, forceState } = opts;

    // Reuse an existing in-memory session without spawning a second agent.
    if (resumeSessionId && this.sessions.has(resumeSessionId)) {
      const existing = this.sessions.get(resumeSessionId)!;
      return { sessionId: resumeSessionId, resumed: existing.resumed };
    }

    // ── Resolve topicId and subjectId ────────────────────────────────────────
    // Fetch the concept early — needed for goTo and topic derivation.
    const concept = await cms.get<Concept>(`/concepts/${conceptId}`);

    let resolvedTopicId: string | null = topicId ?? concept.topic ?? null;

    let subjectId: string | null = null;
    if (resolvedTopicId) {
      const subjectInfo = await cms.get<{ subjectId: string }>(`/topics/${resolvedTopicId}/subject`)
        .catch((err: unknown) => { throw new Error(`Cannot resolve subject for topic '${resolvedTopicId}': ${err}`); });
      subjectId = subjectInfo.subjectId;
    }

    if (!subjectId) {
      throw new Error(
        `Cannot determine subject for concept '${conceptId}' — concept has no CMS topic link. ` +
        `Pass topicId in the request or ensure the concept's topic field is set in CMS.`,
      );
    }

    // ── Find or create subject journey ───────────────────────────────────────
    const journeys = await lp.get<Journey[]>(`/students/${studentId}/journeys`);
    let journey = journeys.find(j => j.subjectId === subjectId) ?? null;
    if (!journey) {
      journey = await lp.post<Journey>(`/students/${studentId}/journeys`, {
        objective: 'Learn subject',
        subjectId,
      });
    }

    // ── Find or create journey node ──────────────────────────────────────────
    const nodes = await lp.get<JourneyNode[]>(
      `/journey-nodes?journeyId=${journey.id}&conceptId=${conceptId}`,
    );
    let node = nodes[0];
    if (!node) {
      const goTo = concept.nextConcepts?.[0] ?? null;
      node = await lp.post<JourneyNode>('/journey-nodes', {
        journeyId:     journey.id,
        conceptId,
        order:         1,
        state:         forceState ?? CS.NOT_ASSESSED,
        masteryLevel:  null,
        goTo,
        cameFrom:      null,
        preReqToLearn: null,
        topicId:       resolvedTopicId,
      });
    } else if (forceState && node.state !== forceState) {
      // Override existing node state for testing — patch LP and update local copy
      await lp.patch(`/journey-nodes/${node.id}`, { state: forceState });
      node.state = forceState as JourneyNode['state'];
    }

    const agent   = await newAgent(studentId, conceptId, node.id, resolvedTopicId);
    const resumed = agent.ctx.session.history.length > 0;

    this.sessions.set(agent.ctx.session.id, { agent, resumed });
    return { sessionId: agent.ctx.session.id, resumed };
  }

  /**
   * Wire an agent to a transport.
   * The agent speaks first on 'connected'.
   * On 'disconnected', the session is persisted and removed.
   */
  async join(sessionId: string, transport: Transport): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active) throw new Error(`Session ${sessionId} not active`);

    const { agent } = active;

    agent.ctx.log = entry => transport.onLog(entry);

    const medium = transport.medium ?? new DefaultMedium();
    if (medium.outputModalities.size > 0) {
      agent.ctx.outputPrompt = medium.promptTemplate();
    }

    const outputParser = new OutputParser(medium);
    const inputParser  = new InputParser(medium);

    const OUTPUT_TYPES = new Set(['audio', 'audio_chunk', 'text_chunk', 'svg', 'model', 'model3d', 'play', 'ask', 'question', 'annotate']);
    let turnStart: number | null = null;
    let ttfrEmitted = false;

    const pipe = async (event: TurnEvent): Promise<void> => {
      if (event.type === 'event' && event.event.type === 'tutor-started') {
        turnStart = Date.now();
        ttfrEmitted = false;
      }

      const enriched: TurnEvent = { ...event, sessionId: agent.ctx.session.id, nodeId: agent.ctx.journeyNode.id };
      for await (const result of outputParser.parse(enriched)) {
        if (turnStart && !ttfrEmitted && OUTPUT_TYPES.has(result.type)) {
          ttfrEmitted = true;
          const metric: TurnEvent = { type: 'metric', name: 'ttfr', value: Date.now() - turnStart, unit: 'ms', sessionId: agent.ctx.session.id, nodeId: agent.ctx.journeyNode.id };
          agent.ctx.session.rawHistory.push({ role: 'metric', name: 'ttfr', content: { value: metric.value, unit: metric.unit }, timestamp: new Date().toISOString() });
          transport.handle(metric);
        }
        transport.handle(result);
      }
    };

    transport.on('disconnected', () => {
      transport.onLog({ level: 'info', message: `session disconnected: ${sessionId}` });
      this.end(sessionId).catch(console.error);
    });

    transport.on('message', async (input) => {
      try {
        const processed = await inputParser.parse(input);
        for await (const event of agent.send(processed)) {
          await pipe(event);
        }
        persistSession(agent.ctx).catch(() => { });
      } catch (err) {
        transport.handle({ type: 'error', message: String(err) });
      }
    });

    transport.on('connected', async () => {
      transport.onLog({ level: 'info', message: `session connected: ${sessionId}` });
      try {
        transport.handle(makeSessionEvent(agent.ctx));
        for await (const event of agent.initiate()) {
          await pipe(event);
        }
        persistSession(agent.ctx).catch(() => { });
      } catch (err) {
        transport.handle({ type: 'error', message: String(err) });
      }
    });
  }

  async end(sessionId: string): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active) return;

    const { ctx } = active.agent;

    if (ctx.session.status !== 'initialised') {
      // Preserve 'completed' set by the agent (e.g. returnToOrigin on prereq finish).
      // On disconnect save unfinished sessions as 'started' so resume can find them.
      const statusToSave = ctx.session.status === 'completed' ? 'completed' : 'started';
      await lp.patch<Session>(`/sessions/${ctx.session.id}`, {
        status:       statusToSave,
        history:      ctx.session.history,
        rawHistory:   ctx.session.rawHistory,
        systemPrompt: ctx.session.systemPrompt,
        planHistory:  ctx.session.planHistory,
        teachingPlan: ctx.session.teachingPlan,
        ...(statusToSave === 'completed' ? { endedAt: new Date().toISOString() } : {}),
      });
    }

    this.sessions.delete(sessionId);
  }

  getAgent(sessionId: string): Agent | undefined {
    return this.sessions.get(sessionId)?.agent;
  }

  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }
}
