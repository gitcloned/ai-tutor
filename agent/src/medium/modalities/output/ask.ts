import type { TurnEvent }    from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/**
 * ask: — a question posed to the student.
 *
 * Buffers and emits one ask event. Canvas pauses and awaits student response.
 */
export class Ask extends BaseOutputModality {
  readonly key = 'ask';
  private buffer = '';

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    this.buffer += chunk;
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim();
    this.buffer = '';
    if (content) yield { type: 'ask', content, attrs };
  }
}
