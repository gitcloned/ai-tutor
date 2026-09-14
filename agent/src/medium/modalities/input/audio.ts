import { BaseInputModality } from './base.js';
import { getSTTProvider }    from '../../../services/stt/index.js';
import type { STTProvider }  from '../../../services/stt/base.js';
import type { AudioBlob }    from './types.js';

/**
 * audio — transcribes student speech via STT.
 *
 * The STT provider is resolved from the environment at construction time
 * (same pattern as Speak resolving its TTS provider):
 *   GROQ_API_KEY set   → Groq Whisper
 *   GROQ_API_KEY unset → no-op (audio input silently ignored)
 */
export class AudioInputModality extends BaseInputModality {
  readonly key = 'audio';
  private readonly stt: STTProvider | undefined;

  constructor() {
    super();
    this.stt = getSTTProvider();
  }

  async process(blob: AudioBlob): Promise<string> {
    if (!this.stt) return '';
    return this.stt(blob);
  }
}
