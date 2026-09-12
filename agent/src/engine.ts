/**
 * TurnEngine — the agent loop.
 * Inspired by openworker's engine.py: runs until the model yields (end_turn),
 * handling multi-step tool calls internally.
 *
 * Emits typed events so the transport layer (CLI, WebRTC) can consume them
 * without knowing about Gemini internals.
 */

import { GoogleGenAI } from '@google/genai';
import type { AgentContext } from './context.js';
import type { ToolRegistry } from './tools/index.js';
import type { Skill } from './skills.js';

/** Typed lifecycle events emitted by the agent (not actions, not output). */
export type AgentEvent =
  | { type: 'tutor-started' }
  | { type: 'tutor-ended' };

export type TurnEvent =
  // Internal agent events
  | { type: 'session';      sessionId: string; conceptId: string; title: string }
  | { type: 'text';         content: string }
  | { type: 'text_chunk';   content: string; attrs?: Record<string, string> }
  | { type: 'tool_call';    name: string; args: unknown }
  | { type: 'tool_result';  name: string; result: unknown }
  | { type: 'action';       action: unknown }
  | { type: 'event';        event: AgentEvent }
  | { type: 'error';        message: string }
  // Output events — emitted by Parser when an output modality is active.
  // All share the same shape: { type, content, attrs }.
  //   type    — discriminates what content means
  //   content — the payload (base64 audio, SVG, URL, question text, equation…)
  //   attrs   — open-ended metadata from /key: value lines in the LLM block
  | { type: 'audio_chunk'; content: string; attrs: Record<string, string> }
  | { type: 'audio';       content: string; attrs: Record<string, string> }
  | { type: 'svg';         content: string; attrs: Record<string, string> }
  | { type: 'play';        content: string; attrs: Record<string, string> }
  | { type: 'ask';         content: string; attrs: Record<string, string> }
  | { type: 'annotate';    content: string; attrs: Record<string, string> };

/** Union of all output event type strings. */
export type OutputEventType = 'audio_chunk' | 'audio' | 'svg' | 'play' | 'ask' | 'annotate' | 'text_chunk';

/** A single output event — the shape every modality produces. */
export type OutputEvent = Extract<TurnEvent, { attrs: Record<string, string> }>
  | { type: 'text_chunk'; content: string; attrs: Record<string, string> };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// Suppress Gemini SDK warning triggered internally when streaming a function-call response.
// The SDK accesses .text on the aggregated response to update chat history, which fires a
// noisy warning when function calls are present. We already guard against this in our own code.
const _warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('non-text parts')) return;
  _warn(...args);
};

export class TurnEngine {
  constructor(private tools: ToolRegistry, private basePrompt: string) { }

  async *run(skill: Skill, ctx: AgentContext): AsyncGenerator<TurnEvent> {
    yield { type: 'event', event: { type: 'tutor-started' } };

    yield* this.#run(skill, ctx);

    yield { type: 'event', event: { type: 'tutor-ended' } };
  }

  async *#run(skill: Skill, ctx: AgentContext): AsyncGenerator<TurnEvent> {
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

    const chatHistory = history.slice(0, -1);
    const lastMessage = history.at(-1)?.parts?.[0]?.text ?? 'Begin the session.';

    const chat = ai.chats.create({
      model: 'gemini-3.6-flash',
      history: chatHistory as any,
      config: {
        systemInstruction: `${this.basePrompt}\n\n---\n\n${skill.prompt(ctx)}${ctx.outputPrompt ? `\n\n---\n\n${ctx.outputPrompt}` : ''}`,
        tools: toolDefs.length > 0 ? [{ functionDeclarations: toolDefs }] as any : undefined,
      },
    });

    ctx.log({ level: 'debug', message: `history length: ${chatHistory.length} | last msg: ${lastMessage.slice(0, 60)}` });

    // Agentic loop: stream → handle tool calls → repeat until no more tool calls
    let message: any = lastMessage;

    while (true) {
      const stream = await chat.sendMessageStream({ message });

      let accText = '';
      let calls: any[] = [];

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

      if (calls.length === 0) {
        // No tool calls — streaming is done, emit full text for history accumulation
        if (accText) yield { type: 'text', content: accText };
        break;
      }

      // Execute each tool call and collect responses
      const functionResponses: object[] = [];

      for (const call of calls) {
        yield { type: 'tool_call', name: call.name!, args: call.args };

        const tool = this.tools.get(call.name!);
        const result = tool
          ? await tool.run(call.args as Record<string, unknown>, ctx)
          : { error: `unknown tool: ${call.name}` };

        yield { type: 'tool_result', name: call.name!, result };

        // If the tool result carries an action signal, emit it for the transport
        if ((result as any)?.action) {
          yield { type: 'action', action: (result as any).action };
        }

        functionResponses.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: result,
          },
        });
      }

      message = functionResponses;
    }
  }
}
