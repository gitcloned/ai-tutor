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
    const res = await fetch(url, init);
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
 * Creates an Inworld TTS provider that streams MP3 audio chunks as they arrive.
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
        audio_config:  { audio_encoding: 'MP3', speaking_rate: 1 },
        delivery_mode: 'BALANCED',
        model_id:      'inworld-tts-2',
        language:      'AUTO',
      }),
    });

    if (!res.body) return;

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   pending = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });

      const lines = pending.split('\n');
      pending = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line === 'data: [DONE]') continue;

        const json = line.startsWith('data: ') ? line.slice(6) : line;
        let parsed: unknown;
        try { parsed = JSON.parse(json); } catch { continue; }

        const chunk =
          (parsed as any)?.result?.audioContent ??
          (parsed as any)?.result?.audio_chunk  ??
          (parsed as any)?.audioContent         ??
          (parsed as any)?.audio_chunk          ??
          (parsed as any)?.data;

        if (typeof chunk === 'string' && chunk.length > 0) {
          yield { data: chunk, mimeType: 'audio/mpeg' };
        }
      }
    }

    // Flush remaining buffer
    const last = pending.trim();
    if (last && last !== 'data: [DONE]') {
      const json = last.startsWith('data: ') ? last.slice(6) : last;
      try {
        const parsed = JSON.parse(json) as any;
        const chunk = parsed?.result?.audioContent ?? parsed?.result?.audio_chunk ?? parsed?.audioContent ?? parsed?.audio_chunk ?? parsed?.data;
        if (typeof chunk === 'string' && chunk.length > 0) {
          yield { data: chunk, mimeType: 'audio/mpeg' };
        }
      } catch {}
    }
  };
}
