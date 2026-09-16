import { dirname, join } from 'path';
import type { ProcessedInput } from './medium/modalities/input/types.js';
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
import { saveImages, saveAudio } from './image-store.js';
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

  // Ensure rawHistory array exists (for sessions created before this field was added).
  if (!ctx.session.rawHistory) ctx.session.rawHistory = [];

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
      } else if (event.type === 'tool_call') {
        ctx.session.rawHistory.push({ role: 'tool_call', name: event.name, content: event.args, timestamp: new Date().toISOString() });
      } else if (event.type === 'tool_result') {
        ctx.session.rawHistory.push({ role: 'tool_result', name: event.name, content: event.result, timestamp: new Date().toISOString() });
      }
      yield event;
    }
    if (agentText) {
      const ts = new Date().toISOString();
      ctx.session.history.push({ role: 'agent', content: agentText, timestamp: ts });
      ctx.session.rawHistory.push({ role: 'agent', content: agentText, timestamp: ts });
    }
  }

  function appendAndRun(role: 'student', input: ProcessedInput): AsyncGenerator<TurnEvent> {
    const ts = new Date().toISOString();
    // Save images/audio to disk and embed markers in the content.
    let content = input.text;
    if (input.images?.length) {
      const filenames = saveImages(ctx.session.id, input.images);
      const markers = filenames.map(f => `[image:${f}]`).join(' ');
      content = content ? `${content}\n${markers}` : markers;
    }
    if (input.audioBlob) {
      const filename = saveAudio(ctx.session.id, input.audioBlob);
      const marker = `[audio:${filename}]`;
      content = content ? `${content}\n${marker}` : marker;
    }
    ctx.session.history.push({ role, content, timestamp: ts });
    ctx.session.rawHistory.push({ role, content, timestamp: ts });
    // Pass images to the engine for this turn via context; engine consumes and clears them.
    ctx.currentImages = input.images;
    return turn();
  }

  return {
    ctx,
    /** Agent opens the session — fires without waiting for student input. */
    initiate: () => {
      // Seed history with a synthetic user turn so history always starts with 'user'.
      // Gemini requires history[0].role === 'user'.
      if (ctx.session.history.length === 0) {
        const ts = new Date().toISOString();
        ctx.session.history.push({ role: 'student', content: 'Begin the session.', timestamp: ts });
        ctx.session.rawHistory.push({ role: 'student', content: 'Begin the session.', timestamp: ts });
      }
      return turn();
    },
    /** Student sends a message; agent responds. */
    send: (input: ProcessedInput) => appendAndRun('student', input),
  };
}
