import { BaseInputModality } from './base.js';

/** text — identity modality. Passes typed text through unchanged. */
export class TextInputModality extends BaseInputModality {
  readonly key = 'text';

  process(text: string): string {
    return text;
  }
}
