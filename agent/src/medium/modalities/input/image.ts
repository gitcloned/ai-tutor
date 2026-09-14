import { BaseInputModality } from './base.js';
import type { ImageBlob }    from './types.js';

/**
 * image — passes image data through and injects an [image] placeholder into
 * the text so the LLM history entry references the image without storing raw bytes.
 */
export class ImageInputModality extends BaseInputModality {
  readonly key = 'image';

  process(blob: ImageBlob): { placeholder: string; image: ImageBlob } {
    return { placeholder: '[image]', image: blob };
  }
}
