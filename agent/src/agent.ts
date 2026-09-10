import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync }  from 'fs';
import { SkillLoader }   from './skills.js';
import { TurnEngine }    from './engine.js';
import { ToolRegistry }  from './tools/index.js';
import { read_plan, get_next_step, update_step } from './tools/plan.js';
import { store_memory }  from './tools/memory.js';
import { buildContext }  from './context.js';
import type { AgentContext } from './context.js';
import type { TurnEvent }   from './engine.js';
import { lp } from './api.js';
const __dir = dirname(fileURLToPath(import.meta.url));

const basePrompt = readFileSync(join(__dir, '../prompts/base.md'), 'utf8');
const skills     = new SkillLoader(join(__dir, '../skills'));
const tools = new ToolRegistry().add(
  read_plan, get_next_step, update_step,
  store_memory,
);
const engine = new TurnEngine(tools, basePrompt);

// ── Public interface ───────────────────────────────────────────────────────────

export async function newAgent(studentId: string, conceptId: string, journeyNodeId: string) {
  const ctx = await buildContext(studentId, conceptId, journeyNodeId);

  async function *turn(): AsyncGenerator<TurnEvent> {
    const skill = skills.get(ctx.journeyNode.state);
    let agentText = '';
    for await (const event of engine.run(skill, ctx)) {
      if (event.type === 'text') {
        agentText += event.content;
        // Mark session as started on first agent text — only once
        if (ctx.session.status === 'initialised') {
          ctx.session.status = 'started';
          lp.patch(`/sessions/${ctx.session.id}`, { status: 'started' }).catch(() => {});
        }
      }
      yield event;
    }
    if (agentText) {
      ctx.session.history.push({ role: 'agent', content: agentText, timestamp: new Date().toISOString() });
    }
  }

  function appendAndRun(role: 'student', content: string): AsyncGenerator<TurnEvent> {
    ctx.session.history.push({ role, content, timestamp: new Date().toISOString() });
    return turn();
  }

  return {
    ctx,
    /** Agent opens the session — fires without waiting for student input. */
    initiate: () => {
      // Seed history with a synthetic user turn so history always starts with 'user'.
      // Gemini requires history[0].role === 'user'.
      if (ctx.session.history.length === 0) {
        ctx.session.history.push({ role: 'student', content: 'Begin the session.', timestamp: new Date().toISOString() });
      }
      return turn();
    },
    /** Student sends a message; agent responds. */
    send:     (content: string) => appendAndRun('student', content),
  };
}
