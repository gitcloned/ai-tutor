import { BaseMedium } from './base.js';

/**
 * DefaultMedium — plain text in, plain text out.
 *
 * No output modalities: LLM text_chunk / text events pass through unchanged.
 * No input modalities:  StudentInput.text is used as-is; audio/images ignored.
 *
 * Used by the CLI (StdinTransport) and any transport that doesn't specify a medium.
 */
export class DefaultMedium extends BaseMedium {
  promptTemplate(): string {
    return '';
  }
}
