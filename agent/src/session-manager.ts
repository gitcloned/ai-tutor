import { newAgent }       from './agent.js';
import { lp, cms }       from './api.js';
import type { Transport } from './transport.js';
import type { TurnEvent } from './engine.js';
import { DefaultMedium }  from './medium/default.js';
import { OutputParser }   from './medium/modalities/output/parser.js';
import { InputParser }    from './medium/modalities/input/parser.js';
import { makeSessionEvent } from './session-meta.js';
import type { Session, Journey, JourneyNode, Concept } from './types.js';

type Agent = Awaited<ReturnType<typeof newAgent>>;

async function persistSession(ctx: import('./context.js').AgentContext): Promise<void> {
  if (ctx.session.status === 'initialised') return;
  await lp.patch(`/sessions/${ctx.session.id}`, {
    history:      ctx.session.history,
    planHistory:  ctx.session.planHistory,
    teachingPlan: ctx.session.teachingPlan,
  }).catch(() => { });
}

interface ActiveSession {
  agent:   Agent;
  resumed: boolean;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  /**
   * Create or resume a session for this student + concept.
   */
  async create(studentId: string, conceptId: string): Promise<{ sessionId: string; resumed: boolean }> {
    const journeys = await lp.get<Journey[]>(`/students/${studentId}/journeys`);
    let journey = journeys[0];
    if (!journey) {
      journey = await lp.post<Journey>(`/students/${studentId}/journeys`, {
        objective: 'Learn mathematics',
      });
    }

    const nodes = await lp.get<JourneyNode[]>(
      `/journey-nodes?journeyId=${journey.id}&conceptId=${conceptId}`,
    );
    let node = nodes[0];
    if (!node) {
      const concept = await cms.get<Concept>(`/concepts/${conceptId}`);
      const goTo = concept.nextConcepts?.[0] ?? null;

      node = await lp.post<JourneyNode>('/journey-nodes', {
        journeyId:    journey.id,
        conceptId,
        order:        1,
        state:        'not_assessed',
        masteryLevel: null,
        goTo,
        cameFrom:     null,
        preReqToLearn: null,
      });
    }

    const agent   = await newAgent(studentId, conceptId, node.id);
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

    const pipe = async (event: TurnEvent): Promise<void> => {
      for await (const result of outputParser.parse(event)) {
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
      await lp.patch<Session>(`/sessions/${ctx.session.id}`, {
        status:       'completed',
        history:      ctx.session.history,
        planHistory:  ctx.session.planHistory,
        teachingPlan: ctx.session.teachingPlan,
        endedAt:      new Date().toISOString(),
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
