import type { BaseModality } from './modalities/base.js';

/**
 * Registry of modalities keyed by their key name.
 * Supports fluent .add() chaining.
 */
export class ModalityRegistry {
  private map = new Map<string, BaseModality>();

  add(m: BaseModality): this {
    this.map.set(m.key, m);
    return this;
  }

  get(key: string): BaseModality | undefined {
    return this.map.get(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * Base class for all output formats.
 *
 * An output defines:
 *   - which modalities (keys) it supports
 *   - the prompt fragment injected into the LLM system instruction
 *     so the model knows how to format its response
 */
export abstract class BaseOutput {
  readonly modalities = new ModalityRegistry();
  abstract promptTemplate(): string;
}
