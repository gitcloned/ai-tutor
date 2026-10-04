import {requestBeforeOutput,serviceError} from '../../network.js';
import type { TTSProvider } from './base.js';

const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice:stream';

/** Status codes worth retrying — transient server/load issues. */
const RETRYABLE = new Set([429, 503, 502, 504]);

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await requestBeforeOutput('Inworld TTS',()=>fetch(url, {...init,signal:AbortSignal.timeout(30000)}));
    if (res.ok) return res;

    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
      const body = await res.text().catch(() => '');
      throw new Error(`Inworld TTS HTTP ${res.status}: ${body}`);
    }

    // Exponential backoff with jitter: base * 2^attempt + random(0, 500ms)
    const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
    await sleep(delay);
  }
  throw new Error('Inworld TTS: exhausted retries');
}

/**
 * Creates an Inworld TTS provider that streams raw PCM16 audio chunks as they arrive.
 *
 * Reads INWORLD_API_KEY and INWORLD_VOICE_ID from the environment.
 * The API key must be in `workspace_id:secret` format (as shown in the Inworld dashboard).
 *
 * Automatically retries on 429/503/502/504 with exponential backoff + jitter.
 */
export function createInworldTTS(): TTSProvider {
  const apiKey  = process.env.INWORLD_API_KEY  ?? '';
  const voiceId = process.env.INWORLD_VOICE_ID ?? '';

  if (!apiKey)  throw new Error('Inworld TTS: INWORLD_API_KEY not set');
  if (!voiceId) throw new Error('Inworld TTS: INWORLD_VOICE_ID not set');

  // Inworld uses the raw API key directly as the Basic credential (no base64 encoding).
  const auth = `Basic ${apiKey}`;

  return async function* inworldTTS(text: string) {
    const res = await fetchWithRetry(INWORLD_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id:      voiceId,
        audio_config:  { audio_encoding: 'PCM', sample_rate_hertz: 24000, speaking_rate: 1 },
        delivery_mode: 'BALANCED',
        model_id:      'inworld-tts-2',
        language:      'AUTO',
      }),
    });

    if (!res.body) return;

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   pending = '';

    const parseChunk = (raw: string) => {
      const line = raw.trim();
      if (!line || line === 'data: [DONE]') return;
      const json = line.startsWith('data: ') ? line.slice(6) : line;
      const parsed = JSON.parse(json);
      if (parsed?.error) throw new Error(`Inworld TTS: ${parsed.error.message ?? 'stream failed'}`);
      const data = parsed?.result?.audioContent ?? parsed?.result?.audio_chunk ?? parsed?.audioContent ?? parsed?.audio_chunk ?? parsed?.data;
      if (typeof data === 'string' && data.length) return {data, mimeType: 'audio/pcm', sampleRate: 24000};
    };
    try {
      while (true) {
        const { value, done } = await reader.read().catch(error=>{throw serviceError('Inworld audio stream',error);});
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          const chunk = parseChunk(line);
          if (chunk) yield chunk;
        }
      }
      const last = parseChunk(pending + decoder.decode());
      if (last) yield last;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
}
