import type { TurnEvent } from './engine.js';

export interface Transport {
  send(event: TurnEvent): void;
  on(event: 'message',      handler: (text: string) => void | Promise<void>): void;
  on(event: 'connected',    handler: () => void | Promise<void>): void;
  on(event: 'disconnected', handler: () => void | Promise<void>): void;
}
