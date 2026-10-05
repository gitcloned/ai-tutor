/**
 * TurnEngine — the agent loop.
 * Inspired by openworker's engine.py: runs until the model yields (end_turn),
 * handling multi-step tool calls internally.
 *
 * Emits typed events so the transport layer (CLI, WebRTC) can consume them
 * without knowing about Gemini internals.
 */

import { requestBeforeOutput, serviceError } from './network.js';
import {stepPresentation} from './learning/stepPresentation.js';
import { GoogleGenAI } from '@google/genai';
import type { AgentContext } from './context.js';
import type { ToolRegistry } from './tools/index.js';
import type { Skill } from './skills.js';

/** Typed lifecycle events emitted by the agent (not actions, not output). */
export type AgentEvent =
  | ReturnType<typeof stepPresentation>
  | { type: 'tutor-started' }
  | { type: 'session-completed'; topicId?: string | null }
  | { type: 'tutor-ended' };

type TurnEventPayload =
  // Internal agent events
  | { type: 'session'; notebookId?: string; sessionId: string; conceptId: string; title: string }
  | { type: 'text'; content: string }
  | { type: 'text_chunk'; content: string; attrs?: Record<string, string> }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'action'; action: unknown }
  | { type: 'event'; event: AgentEvent }
  | { type: 'error'; message: string }
  // Output events — emitted by Parser when an output modality is active.
  // All share the same shape: { type, content, attrs }.
  //   type    — discriminates what content means
  //   content — the payload (base64 audio, SVG, URL, question text, equation…)
  //   attrs   — open-ended metadata from /key: value lines in the LLM block
  | { type: 'audio_chunk'; content: string; attrs: Record<string, string> }
  | { type: 'audio'; content: string; attrs: Record<string, string> }
  | { type: 'svg'; content: string; attrs: Record<string, string> }
  | { type: 'model3d'; content: string; attrs: Record<string, string> }
  | { type: 'model'; content: string; attrs: Record<string, string> }
  | { type: 'play'; content: string; attrs: Record<string, string> }
  | { type: 'ask'; content: string; attrs: Record<string, string> }
  | { type: 'question'; content: string; attrs: Record<string, string> }
  | { type: 'annotate'; content: string; attrs: Record<string, string> }
  | { type: 'metric'; name: string; value: number; unit: string };

/** Every turn event is enriched with the current session and node context. */
export type TurnEvent = TurnEventPayload & { sessionId?: string; nodeId?: string };

/** Union of all output event type strings. */
export type OutputEventType = 'audio_chunk' | 'audio' | 'svg' | 'model3d' | 'model' | 'play' | 'ask' | 'question' | 'annotate' | 'text_chunk';

/** A single output event — the shape every modality produces. */
export type OutputEvent = Extract<TurnEvent, { attrs: Record<string, string> }>
  | { type: 'text_chunk'; content: string; attrs: Record<string, string> };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';

// Suppress Gemini SDK warning triggered internally when streaming a function-call response.
// The SDK accesses .text on the aggregated response to update chat history, which fires a
// noisy warning when function calls are present. We already guard against this in our own code.
const _warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('non-text parts')) return;
  _warn(...args);
};

export const RESUME_INSTRUCTION = 'The student has returned to this lesson. Briefly remind them where they left off. If a question is awaiting their answer, invite them to answer it. Resuming is not an answer: do not mark a result or advance the plan solely because they returned. If their last message was unanswered, respond to it without inventing new student input. The previous canvas has already been restored and is visible to the student. In canvas mode, put the welcome-back reminder inside speak: so it is spoken aloud. Do not emit write:, question:, or draw commands just to repeat the pending question or existing equation. Refer to the visible work verbally; add visuals only if genuinely new help is needed.';

export class TurnEngine {
  constructor(private tools: ToolRegistry, private basePrompt: string) { }

  async *run(skill: Skill, ctx: AgentContext, options: { resumed?: boolean } = {}): AsyncGenerator<TurnEvent> {
    yield { type: 'event', event: { type: 'tutor-started' } };
    yield {type:'event',event:stepPresentation(ctx)};

    try { if(ctx.session.status!=='completed')yield* this.#run(skill, ctx, options); }
    finally {
      if(ctx.session.status==='completed')yield {type:'event',event:{type:'session-completed',topicId:ctx.session.originTopicId}};
      yield { type: 'event', event: { type: 'tutor-ended' } };
    }
  }

  async *#run(skill: Skill, ctx: AgentContext, options: { resumed?: boolean }): AsyncGenerator<TurnEvent> {
    const toolDefs = this.tools.forSkill(skill.tools).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.schema,
    }));

    // Build history: all but last message goes into chat history,
    // last message is sent via sendMessageStream.
    const history = ctx.session.history.map(m => ({
      role: m.role === 'agent' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // On resume the last message often belongs to the tutor. Never re-send it
    // as student input. Keep all roles intact and add transient resume context.
    const resumed = options.resumed === true || history.at(-1)?.role === 'model';
    const chatHistory = resumed ? history : history.slice(0, -1);
    const lastMessage = resumed ? '[Internal session event: student resumed the lesson. Follow the resume instruction.]' : history.at(-1)?.parts?.[0]?.text ?? 'Begin the session.';

    const systemInstruction = [
      this.basePrompt,
      resumed ? RESUME_INSTRUCTION : null,
      skill.prompt(ctx),
      ctx.outputPrompt || null,
      ctx.modelPrompt || null,
      stepPresentation(ctx).step?.type==='practice'?'Practice UI: the frontend displays the question once in the notebook, followed by blank working space. The fixed header shows its number, points and optional timer. Do not write the question stem again or invent points, numbering, or time limits. For a new question, introduce it briefly with speak only, then wait for the child’s independent attempt. The frontend labels the blank space below the question "Your working". Do not fill that space by repeating or paraphrasing the stem, copying its equation, defining its terms, adding examples, or supplying answer blanks. Instructions to display or write the question are already fulfilled by the displayed question. After an attempt, provide feedback and use write/annotate for help when needed. Scaffold before an attempt only if the child requests help or the plan explicitly requires a worked demonstration. The backend records outcomes and awards configured points only on pass; do not claim an award before get_next_question records it. Timer expiry does not imply an incorrect answer.':null,
      ctx.session.observationToStartWith?.trim()
        ? `Session opening observation (context about the student's work): ${JSON.stringify(ctx.session.observationToStartWith)}\nWhen starting this session, briefly acknowledge this observation, then introduce the lesson naturally. Do not invent praise or ask for confirmation. If it has already been acknowledged in the conversation, continue without repeating it.`
        : null,
    ].filter(Boolean).join('\n\n---\n\n');
    // Record the system prompt the first time a turn runs in this session.
    ctx.session.systemPrompt ??= systemInstruction;

    const chat = ai.chats.create({
      model: GEMINI_MODEL,
      history: chatHistory as any,
      config: {
        systemInstruction,
        tools: toolDefs.length > 0 ? [{ functionDeclarations: toolDefs }] as any : undefined,
      },
    });

    ctx.log({ level: 'debug', message: `history length: ${chatHistory.length} | last msg: ${lastMessage.slice(0, 60)}` });

    // Agentic loop: stream → handle tool calls → repeat until no more tool calls
    // First message may be multipart when the student attached images.
    let message: any;
    if (!resumed && ctx.currentImages?.length) {
      message = [
        { text: lastMessage },
        ...ctx.currentImages.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
      ];
      ctx.currentImages = undefined; // consumed for this turn
    } else {
      message = lastMessage;
    }

    let closing=false;
    while (true) {
      const stream = await requestBeforeOutput('Gemini', () => chat.sendMessageStream({ message, ...(closing?{config:{tools:[]}}:{}) }));

      let accText = '';
      let calls: any[] = [];

      try {
        for await (const chunk of stream) {
          const chunkCalls = chunk.functionCalls;
          if (chunkCalls && chunkCalls.length > 0) {
            // Function calls arrive complete — collect from whichever chunk carries them
            calls = chunkCalls;
          } else if (chunk.text) {
            accText += chunk.text;
            yield { type: 'text_chunk', content: chunk.text };
          }
        }

      } catch (error) { throw serviceError('Gemini response stream', error); }

      if (calls.length === 0 || closing) {
        // No tool calls — streaming is done, emit full text for history accumulation
        if (accText) yield { type: 'text', content: accText };
        break;
      }

      // Execute each tool call and collect responses
      const functionResponses: object[] = [];
      let sendOk = false;

      for (const call of calls) {
        yield { type: 'tool_call', name: call.name!, args: call.args };

        const tool = this.tools.get(call.name!);
        const result = tool
          ? await tool.run(call.args as Record<string, unknown>, ctx)
          : { error: `unknown tool: ${call.name}` };

        yield { type: 'tool_result', name: call.name!, result };
        if(call.name==='get_next_question'||call.name==='update_step')yield {type:'event',event:stepPresentation(ctx)};

        // If the tool result carries an action signal, emit it for the transport
        if ((result as any)?.action) {
          yield { type: 'action', action: (result as any).action };
          if ((result as any).action?.type === 'send-ok') sendOk = true;
        }

        functionResponses.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: result,
          },
        });
      }

      // send-ok means: hand off to the auto-triggered next turn.
      // Do not feed responses back to the LLM — any further text it generates
      // would duplicate what the next turn will say.
      if (sendOk) break;

      // Allow one closing acknowledgement, without tools or another question.
      const allDone = functionResponses.some(
        r => (r as any).functionResponse?.response?.allDone === true,
      );
      closing=allDone;
      message = closing?[...functionResponses,{text:'The session is complete. Briefly acknowledge the student’s final work and close the lesson using the required output format. Do not ask a question, introduce an exercise, or call tools. The interface will offer the next learning action.'}]:functionResponses;
    }
  }
}
