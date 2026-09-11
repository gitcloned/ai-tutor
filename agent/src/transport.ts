import type { TurnEvent } from './engine.js';
import type { LogEntry } from './types.js';
import type { BaseOutput } from './output/base.js';

export type { LogEntry };

export interface Transport {
  // system → transport: conversation events
  handle(event: TurnEvent): void;
  // system → transport: operational logs (fire-and-forget)
  onLog(entry: LogEntry): void;
  // transport → system
  on(event: 'message',      handler: (text: string) => void | Promise<void>): void;
  on(event: 'connected',    handler: () => void | Promise<void>): void;
  on(event: 'disconnected', handler: () => void | Promise<void>): void;
  // optional: when set (and has modalities), session manager pipes events through a Parser
  // and injects output.promptTemplate() into the LLM system instruction.
  // undefined or empty modalities = default passthrough behaviour (text_chunk / text as-is).
  output?: BaseOutput;
}
