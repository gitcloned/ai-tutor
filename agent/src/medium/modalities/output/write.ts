import type { TurnEvent }    from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/**
 * write: — text or equations displayed on the canvas.
 *
 * Streams chunks as they arrive. Attrs (position, anchor, etc.) are attached
 * to a final empty text_chunk in end() so the canvas knows the block is complete.
 */
export class Write extends BaseOutputModality {
  readonly key = 'write';

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    yield { type: 'text_chunk', content: chunk };
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    yield { type: 'text_chunk', content: '', attrs };
  }
}
