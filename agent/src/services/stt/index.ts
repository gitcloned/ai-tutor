import type { STTProvider } from './base.js';
import { createGroqSTT }   from './groq.js';

export type { STTProvider };
export { createGroqSTT };

/**
 * Returns an STT provider when GROQ_API_KEY is present, otherwise undefined.
 *
 * Audio input modalities call this during construction — identical pattern to
 * getTTSProvider() on the output side.
 */
export function getSTTProvider(): STTProvider | undefined {
  if (process.env.GROQ_API_KEY) return createGroqSTT();
  return undefined;
}
