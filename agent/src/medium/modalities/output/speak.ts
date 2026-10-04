import { randomUUID } from 'node:crypto';
import type { TurnEvent }    from '../../../engine.js';
import { getTTSProvider }     from '../../../services/tts/index.js';
import type { TTSProvider }   from '../../../services/tts/base.js';
import { BaseOutputModality } from './base.js';

export type { TTSProvider };

/**
 * speak: — narration spoken aloud via server-side TTS.
 *
 * The TTS provider is resolved from the USE_TTS_PROVIDER environment variable:
 *   inworld  — Inworld streaming TTS (INWORLD_API_KEY + INWORLD_VOICE_ID required)
 *   test     — base64-encodes text, shown as 🎤 in the browser test page
 *   unset    — no TTS, speak: blocks are silent
 */
export class Speak extends BaseOutputModality {
  readonly key = 'speak';
  private buffer = '';
  reset(): void { this.buffer = ''; }
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
    // Only PCM is safe to play incrementally. Keep complete-file semantics for
    // other providers (including the text-only development provider).
    const chunks: Buffer[] = [];
    const streamId = randomUUID();
    let mimeType = 'audio/mpeg', sampleRate = 24000, streaming = false;
    try {
      for await (const chunk of this.tts!(text)) {
        mimeType = chunk.mimeType;
        if (mimeType === 'audio/pcm') {
          sampleRate = chunk.sampleRate ?? 24000;
          yield { type: 'audio_chunk', content: chunk.data, attrs: {
            ...attrs, mimeType, sampleRate: String(sampleRate), streamId,
            ...(!streaming ? { sentence: text } : {}),
          } };
          streaming = true;
        } else chunks.push(Buffer.from(chunk.data, 'base64'));
      }
    } catch (error) {
      if (streaming) yield { type: 'audio_chunk', content: '', attrs: {
        mimeType, streamId, sampleRate: String(sampleRate), streamEnd: 'true', streamError: 'Speech was interrupted. Please try again.',
      } };
      throw error;
    }
    if (streaming) yield { type: 'audio_chunk', content: '', attrs: {
      mimeType, streamId, sampleRate: String(sampleRate), streamEnd: 'true',
    } };
    else if (chunks.length) yield { type: 'audio_chunk', content: Buffer.concat(chunks).toString('base64'), attrs: { mimeType, sentence: text, ...attrs } };
  }
}
