import type { TurnEvent } from '../../../engine.js';

/**
 * A single output modality — handles one LLM key type (speak:, write:, draw:, etc.).
 *
 * Lifecycle per block:
 *   handle(chunk) — called for each content chunk while this key is active
 *   end(attrs)    — called when the next key is seen or stream ends; flush buffered state
 *
 * Implementations MUST reset internal buffers in end() so the instance is reusable
 * across multiple turns in the same session.
 */
export abstract class BaseOutputModality {
  abstract readonly key: string;
  abstract handle(chunk: string): AsyncGenerator<TurnEvent>;
  abstract end(attrs: Record<string, string>): AsyncGenerator<TurnEvent>;
}

export class OutputModalityRegistry {
  private readonly map = new Map<string, BaseOutputModality>();

  add(m: BaseOutputModality): this {
    this.map.set(m.key, m);
    return this;
  }

  get(key: string): BaseOutputModality | undefined {
    return this.map.get(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  get size(): number {
    return this.map.size;
  }
}
