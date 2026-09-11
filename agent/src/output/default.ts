import { BaseOutput } from './base.js';

/**
 * DefaultOutput — no modalities, no prompt injection.
 *
 * When a transport has no output (or uses DefaultOutput), the session manager
 * skips the parser entirely and passes TurnEvents directly to transport.handle().
 * This preserves the existing text_chunk / text streaming behavior unchanged.
 */
export class DefaultOutput extends BaseOutput {
  promptTemplate(): string {
    return '';
  }
}
