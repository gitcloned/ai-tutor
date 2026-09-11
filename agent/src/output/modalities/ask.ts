import type { TurnEvent } from '../../engine.js';
import { BaseModality } from './base.js';

/**
 * ask: — a question posed to the student.
 *
 * content = the question text. Canvas pauses and awaits student response.
 */
export class Ask extends BaseModality {
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
