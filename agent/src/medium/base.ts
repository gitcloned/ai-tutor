import { OutputModalityRegistry } from './modalities/output/base.js';
import { InputModalityRegistry }  from './modalities/input/base.js';

/**
 * BaseMedium — the channel through which agent and student exchange information.
 *
 * A medium defines:
 *   outputModalities — how the agent formats its responses (speak, write, draw, …)
 *   inputModalities  — what the student can send (text, audio, image)
 *   promptTemplate() — the system instruction fragment injected into the LLM
 *
 * Concrete mediums: DefaultMedium (plain text), CanvasMedium (rich interactive canvas).
 */
export abstract class BaseMedium {
  readonly outputModalities = new OutputModalityRegistry();
  readonly inputModalities  = new InputModalityRegistry();
  abstract promptTemplate(): string;
}
