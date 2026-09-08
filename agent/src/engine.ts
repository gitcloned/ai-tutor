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

export type TurnEvent =
  | { type: 'text';        content: string }
  | { type: 'tool_call';   name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'error';       message: string };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export class TurnEngine {
  constructor(private tools: ToolRegistry, private basePrompt: string) {}

  async *run(skill: Skill, ctx: AgentContext): AsyncGenerator<TurnEvent> {
    const toolDefs = this.tools.forSkill(skill.tools).map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  t.schema,
    }));

    // Build history: all but last message goes into chat history,
    // last message is sent via sendMessage.
    // If history is empty (agent initiates), seed with 'Begin the session.'
    const history = ctx.session.history.map(m => ({
      role:  m.role === 'agent' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chatHistory = history.slice(0, -1);
    const lastMessage = history.at(-1)?.parts?.[0]?.text ?? 'Begin the session.';

    const chat = ai.chats.create({
      model:   'gemini-3.6-flash',
      history: chatHistory as any,
      config:  {
        systemInstruction: `${this.basePrompt}\n\n---\n\n${skill.prompt(ctx)}`,
        tools: toolDefs.length > 0 ? [{ functionDeclarations: toolDefs }] as any : undefined,
      },
    });

    // Agentic loop: send → handle tool calls → repeat until no more tool calls
    console.error('[engine] history length:', chatHistory.length, '| last msg:', lastMessage.slice(0, 60));
    let response = await chat.sendMessage({ message: lastMessage });

    while (true) {
      if (response.text) yield { type: 'text', content: response.text };

      const calls = response.functionCalls;
      if (!calls || calls.length === 0) break;

      // Execute each tool call and collect responses
      const functionResponses: object[] = [];

      for (const call of calls) {
        yield { type: 'tool_call', name: call.name!, args: call.args };

        const tool   = this.tools.get(call.name!);
        const result = tool
          ? await tool.run(call.args as Record<string, unknown>, ctx)
          : { error: `unknown tool: ${call.name}` };

        yield { type: 'tool_result', name: call.name!, result };

        functionResponses.push({
          functionResponse: {
            id:       call.id,
            name:     call.name,
            response: result,
          },
        });
      }

      response = await chat.sendMessage({ message: functionResponses as any });
    }
  }
}
