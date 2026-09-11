import type { TurnEvent } from '../../engine.js';

/**
 * A single canvas output modality — handles one key type (speak, write, draw, etc.).
 * Receives streaming content chunks and emits typed canvas events.
 *
 * Lifecycle per block:
 *   handle(chunk) — called for each content chunk while this key is active
 *   end()         — called when the next key is encountered or stream ends; flush any buffered state
 *
 * Implementations MUST reset internal buffers in end() so the instance is reusable
 * across multiple turns in the same session.
 */
export abstract class BaseModality {
  abstract readonly key: string;
  abstract handle(chunk: string): AsyncGenerator<TurnEvent>;
  /** Called when the block ends (next key or stream end). Receives all `/key: value` attrs collected for this block. */
  abstract end(attrs: Record<string, string>): AsyncGenerator<TurnEvent>;
}
