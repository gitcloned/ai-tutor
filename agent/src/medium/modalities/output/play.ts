import type { TurnEvent }    from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/**
 * play: — a video resource to embed on the canvas.
 *
 * content = URL (YouTube or other). attrs carry width/height/position.
 */
export class Play extends BaseOutputModality {
  readonly key = 'play';
  private buffer = '';

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    this.buffer += chunk;
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim();
    this.buffer = '';
    if (content) yield { type: 'play', content, attrs };
  }
}
