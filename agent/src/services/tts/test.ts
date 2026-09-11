import type { TTSProvider } from './base.js';

/**
 * Test TTS — base64-encodes the sentence text and yields it as a single chunk.
 * mimeType is 'text/plain' so the browser test page displays it as 🎤 text
 * rather than trying to decode audio.
 */
export function createTestTTS(): TTSProvider {
  return async function* testTTS(text: string) {
    yield {
      data:     Buffer.from(text).toString('base64'),
      mimeType: 'text/plain',
    };
  };
}
