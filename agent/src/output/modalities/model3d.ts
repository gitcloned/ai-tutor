import type { TurnEvent } from '../../engine.js';
import { BaseModality } from './base.js';

export class Model3d extends BaseModality {
  readonly key = 'model3d';
  private buffer = '';
  async *handle(chunk: string): AsyncGenerator<TurnEvent> { this.buffer += chunk; }
  async *end(attrs: Record<string,string>): AsyncGenerator<TurnEvent> {
    const content = this.buffer.trim(); this.buffer = '';
    if (content) yield {type:'model3d',content,attrs};
  }
}
