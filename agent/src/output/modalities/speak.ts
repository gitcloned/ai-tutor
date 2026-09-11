import type { TurnEvent } from '../../engine.js';
import { BaseModality } from './base.js';

export type TTSProvider = (text: string) => Promise<{ data: string; mimeType: string }>;

/**
 * speak: — narration spoken aloud via server-side TTS.
 *
 * Emits audio_chunk per sentence (low latency). content = base64 audio data.
 * attrs.mimeType carries the audio format (e.g. 'audio/mpeg').
 * Any /key: value attrs from the block are merged in on the final flush.
 *
 * No-op without a TTSProvider — inject via Canvas.create({ tts }).
 */
export class Speak extends BaseModality {
  readonly key = 'speak';
  private buffer = '';

  constructor(private readonly tts?: TTSProvider) { super(); }

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
          if (sentence) {
            const { data, mimeType } = await this.tts(sentence);
            yield { type: 'audio_chunk', content: data, attrs: { mimeType } };
          }
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
    const { data, mimeType } = await this.tts(remainder);
    yield { type: 'audio_chunk', content: data, attrs: { mimeType, ...attrs } };
  }
}
