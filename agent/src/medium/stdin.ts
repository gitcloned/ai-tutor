import { BaseMedium }         from './base.js';
import { TextInputModality }  from './modalities/input/text.js';

/**
 * StdinMedium — terminal surface.
 *
 * Output modalities: none. The StdinTransport renders all agent events directly
 * to stdout in its handle() method — no LLM DSL or prompt injection needed.
 *
 * Input modalities: text only. The terminal accepts typed text; audio and image
 * input are not available on this surface.
 */
export class StdinMedium extends BaseMedium {
  constructor() {
    super();
    this.inputModalities.add(new TextInputModality());
  }

  promptTemplate(): string {
    return '';
  }
}
