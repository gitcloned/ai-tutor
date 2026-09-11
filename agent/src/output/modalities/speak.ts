import type { TurnEvent } from '../../engine.js';
import { getTTSProvider }  from '../../services/tts/index.js';
import type { TTSProvider } from '../../services/tts/base.js';
import { BaseModality }   from './base.js';

export type { TTSProvider };

/**
 * speak: — narration spoken aloud via server-side TTS.
 *
 * The TTS provider is resolved from the USE_TTS_PROVIDER environment variable:
 *   inworld  — Inworld streaming TTS (INWORLD_API_KEY + INWORLD_VOICE_ID required)
 *   test     — base64-encodes text, shown as 🎤 in the browser test page
 *   unset    — no TTS, speak: blocks are silent
 *
 * Emits audio_chunk per sentence. Streaming providers yield multiple chunks
 * per sentence so playback can start before the full sentence is encoded.
 */
export class Speak extends BaseModality {
  readonly key = 'speak';
  private buffer = '';
  private readonly tts: TTSProvider | undefined;

  constructor() {
    super();
    this.tts = getTTSProvider();
  }

  async *handle(chunk: string): AsyncGenerator<TurnEvent> {
    this.buffer += chunk;
    if (!this.tts) return;

    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch === '.' || ch === '!' || ch === '?') {
        const next = this.buffer[i + 1];
        if (next === undefined || next === ' ' || next === '\n' || next === '\r') {
          const sentence = this.buffer.slice(start, i + 1).trim();
          if (sentence) yield* this.synthesise(sentence, {});
          start = i + 1;
        }
      }
    }
    this.buffer = this.buffer.slice(start);
  }

  async *end(attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    const remainder = this.buffer.trim();
    this.buffer = '';
    if (!remainder || !this.tts) return;
    yield* this.synthesise(remainder, attrs);
  }

  private async *synthesise(text: string, attrs: Record<string, string>): AsyncGenerator<TurnEvent> {
    console.log(`[speak] synthesising: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
    const chunks: Buffer[] = [];
    let mimeType = 'audio/mpeg';
    for await (const chunk of this.tts!(text)) {
      chunks.push(Buffer.from(chunk.data, 'base64'));
      mimeType = chunk.mimeType;
      console.log(`[speak]   chunk ${chunks.length}: ${chunk.data.length} base64 chars (${mimeType})`);
    }
    if (chunks.length === 0) { console.log('[speak]   → no chunks, skipping'); return; }
    const combined = Buffer.concat(chunks);
    console.log(`[speak]   → combined ${combined.length} bytes, sending audio_chunk`);
    yield { type: 'audio_chunk', content: combined.toString('base64'), attrs: { mimeType, ...attrs } };
  }
}
