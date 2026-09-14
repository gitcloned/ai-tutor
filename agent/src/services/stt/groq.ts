import type { STTProvider } from './base.js';

/**
 * Groq Whisper STT — transcribes audio using the Groq API.
 *
 * Requires GROQ_API_KEY in the environment.
 * Sends a multipart POST to /openai/v1/audio/transcriptions (Whisper-compatible endpoint).
 */
export function createGroqSTT(): STTProvider {
  return async (audio) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const bytes = Buffer.from(audio.data, 'base64');
    // Derive a file extension from the MIME type (e.g. audio/webm → webm)
    const ext = audio.mimeType.split('/')[1]?.split(';')[0] ?? 'webm';

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: audio.mimeType }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) throw new Error(`Groq STT HTTP ${res.status}`);
    const body = await res.json() as { text: string };
    return body.text;
  };
}
