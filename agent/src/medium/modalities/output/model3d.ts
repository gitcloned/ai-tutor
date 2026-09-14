import type { TurnEvent }    from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/** model3d: — loads a 3D teaching model by ID into the canvas viewer. */
export class Model3d extends BaseOutputModality {
  readonly key = 'model3d';
  private buffer = '';

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    this.buffer += chunk;
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim();
    this.buffer = '';
    if (content) yield { type: 'model3d', content, attrs };
  }
}
