import type { TurnEvent } from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/** Interactive teaching activities, alongside the existing model3d modality. */
export class Model extends BaseOutputModality {
  readonly key = 'model';
  private buffer = '';
  async *handle(chunk: string): AsyncGenerator<TurnEvent> { this.buffer += chunk; }
  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim();
    this.buffer = '';
    if (content) yield { type: 'model', content, attrs };
  }
}
