import type { TurnEvent }    from './engine.js';
import type { LogEntry }     from './types.js';
import type { BaseMedium }   from './medium/base.js';
import type { StudentInput } from './medium/modalities/input/types.js';

export type { LogEntry, StudentInput };

export interface Transport {
  // system → transport: conversation events
  handle(event: TurnEvent): void;
  // system → transport: operational logs (fire-and-forget)
  onLog(entry: LogEntry): void;
  // transport → system
  on(event: 'message',      handler: (input: StudentInput) => void | Promise<void>): void;
  on(event: 'connected',    handler: () => void | Promise<void>): void;
  on(event: 'disconnected', handler: () => void | Promise<void>): void;
  // optional: when set (and has outputModalities), session manager pipes LLM events
  // through OutputParser and injects medium.promptTemplate() into the system instruction.
  // undefined = DefaultMedium behaviour (plain text passthrough).
  medium?: BaseMedium;
}
