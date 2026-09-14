import type { BaseMedium }         from '../../base.js';
import type { AudioInputModality } from './audio.js';
import type { ImageInputModality } from './image.js';
import type { TextInputModality }  from './text.js';
import type { StudentInput, ProcessedInput } from './types.js';

/**
 * InputParser — normalises multimodal student input into a single text + images pair.
 *
 * Mirrors OutputParser on the input side:
 *   OutputParser(medium) — LLM token stream → typed output events
 *   InputParser(medium)  — StudentInput     → ProcessedInput { text, images? }
 *
 * Processing order: text → audio (STT) → images (placeholder injection).
 * All parts are joined into one text string for the agent's history.
 */
export class InputParser {
  constructor(private readonly medium: BaseMedium) {}

  async parse(input: StudentInput): Promise<ProcessedInput> {
    const { inputModalities } = this.medium;
    const parts: string[] = [];
    const images = [];

    if (input.text?.trim()) {
      const mod = inputModalities.get('text') as TextInputModality | undefined;
      parts.push(mod ? mod.process(input.text) : input.text);
    }

    if (input.audio) {
      const mod = inputModalities.get('audio') as AudioInputModality | undefined;
      if (mod) {
        const transcription = await mod.process(input.audio);
        if (transcription) parts.push(transcription);
      }
    }

    if (input.images?.length) {
      const mod = inputModalities.get('image') as ImageInputModality | undefined;
      for (const img of input.images) {
        if (mod) {
          const { placeholder, image } = mod.process(img);
          parts.push(placeholder);
          images.push(image);
        } else {
          images.push(img);
        }
      }
    }

    return {
      text: parts.filter(Boolean).join(' '),
      ...(images.length ? { images } : {}),
    };
  }
}
