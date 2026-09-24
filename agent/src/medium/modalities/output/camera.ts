import type { TurnEvent }    from '../../../engine.js';
import { BaseOutputModality } from './base.js';

/**
 * camera: — signals the canvas to open the camera for the student.
 *
 * Usage in LLM output:
 *   camera: open
 *
 * Emits an action event that the canvas handles by opening the camera UI.
 * Content after the key is ignored — the action fires on end().
 */
export class Camera extends BaseOutputModality {
  readonly key = 'camera';

  async *handle(_chunk: string): AsyncGenerator<TurnEvent> {
    // no buffering needed
  }

  async *end(_attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    yield { type: 'action', action: { type: 'open-camera' } };
  }
}
