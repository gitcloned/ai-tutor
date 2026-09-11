import type { TTSProvider } from './base.js';

const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice:stream';

/**
 * Creates an Inworld TTS provider that streams MP3 audio chunks as they arrive.
 *
 * Reads INWORLD_API_KEY and INWORLD_VOICE_ID from the environment.
 * The API key must be in `workspace_id:secret` format (as shown in the Inworld dashboard).
 */
export function createInworldTTS(): TTSProvider {
  const apiKey  = process.env.INWORLD_API_KEY  ?? '';
  const voiceId = process.env.INWORLD_VOICE_ID ?? '';

  if (!apiKey)  throw new Error('Inworld TTS: INWORLD_API_KEY not set');
  if (!voiceId) throw new Error('Inworld TTS: INWORLD_VOICE_ID not set');

  // Inworld uses the raw API key directly as the Basic credential (no base64 encoding).
  const auth = `Basic ${apiKey}`;

  return async function* inworldTTS(text: string) {
    const res = await fetch(INWORLD_TTS_URL, {
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

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Inworld TTS HTTP ${res.status}: ${body}`);
    }

    console.log(`[inworld] HTTP ${res.status}, content-type: ${res.headers.get('content-type')}`);

    if (!res.body) { console.log('[inworld] no response body'); return; }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   pending = '';
    let   lineCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });

      const lines = pending.split('\n');
      pending = lines.pop() ?? '';

      for (const raw of lines) {
        lineCount++;
        const line = raw.trim();
        if (!line || line === 'data: [DONE]') continue;

        console.log(`[inworld] line ${lineCount}: ${line.slice(0, 120)}`);

        const json = line.startsWith('data: ') ? line.slice(6) : line;
        let parsed: unknown;
        try { parsed = JSON.parse(json); } catch (e) { console.log(`[inworld]   parse error: ${e}`); continue; }

        const chunk =
          (parsed as any)?.result?.audioContent ??
          (parsed as any)?.result?.audio_chunk  ??
          (parsed as any)?.audioContent         ??
          (parsed as any)?.audio_chunk          ??
          (parsed as any)?.data;

        console.log(`[inworld]   keys: ${Object.keys(parsed as any).join(', ')} → chunk: ${chunk ? chunk.slice(0,20)+'…' : 'none'}`);

        if (typeof chunk === 'string' && chunk.length > 0) {
          yield { data: chunk, mimeType: 'audio/mpeg' };
        }
      }
    }

    // Flush remaining buffer
    const last = pending.trim();
    if (last && last !== 'data: [DONE]') {
      console.log(`[inworld] flush: ${last.slice(0, 120)}`);
      const json = last.startsWith('data: ') ? last.slice(6) : last;
      try {
        const parsed = JSON.parse(json) as any;
        const chunk = parsed?.result?.audioContent ?? parsed?.result?.audio_chunk ?? parsed?.audioContent ?? parsed?.audio_chunk ?? parsed?.data;
        if (typeof chunk === 'string' && chunk.length > 0) {
          yield { data: chunk, mimeType: 'audio/mpeg' };
        }
      } catch {}
    }

    console.log(`[inworld] done, ${lineCount} lines processed`);
  };
}
