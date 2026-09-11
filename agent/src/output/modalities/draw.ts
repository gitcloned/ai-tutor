import type { TurnEvent } from '../../engine.js';
import { BaseModality } from './base.js';

/**
 * draw: — an SVG diagram rendered on the canvas.
 *
 * Buffers the entire block and emits one svg OutputEvent in end().
 * content = the SVG string. attrs carry position/anchor/size metadata.
 */
export class Draw extends BaseModality {
  readonly key = 'draw';
  private buffer = '';

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    this.buffer += chunk;
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim();
    this.buffer = '';
    if (content) yield { type: 'svg', content, attrs };
  }
}
