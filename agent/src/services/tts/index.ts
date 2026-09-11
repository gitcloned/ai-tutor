import type { TTSProvider } from './base.js';
import { createInworldTTS } from './inworld.js';
import { createTestTTS }    from './test.js';

export type { TTSProvider };
export { createInworldTTS, createTestTTS };

/**
 * Returns a TTS provider based on the USE_TTS_PROVIDER environment variable.
 *
 *   USE_TTS_PROVIDER=inworld  — Inworld streaming TTS (requires INWORLD_API_KEY + INWORLD_VOICE_ID)
 *   USE_TTS_PROVIDER=test     — Test TTS: base64-encodes text, mimeType text/plain (browser shows 🎤 text)
 *   unset / empty             — no TTS, speak: blocks are silent
 */
export function getTTSProvider(): TTSProvider | undefined {
  switch (process.env.USE_TTS_PROVIDER?.toLowerCase()) {
    case 'inworld': return createInworldTTS();
    case 'test':    return createTestTTS();
    default:        return undefined;
  }
}
