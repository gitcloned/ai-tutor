/**
 * Multimodal student input — unit tests (vitest).
 *
 * Covers the input processing pipeline:
 *   StudentInput (text | audio | image) → processed text + images → agent.send()
 *
 * Tests the real implementations:
 *   - createGroqSTT  (src/services/stt/groq.ts)  — mocks globalThis.fetch
 *   - InputParser    (src/medium/modalities/input/parser.ts) + CanvasMedium
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGroqSTT }      from '../services/stt/groq.js';
import { InputParser }        from '../medium/modalities/input/parser.js';
import { CanvasMedium }       from '../medium/canvas.js';
import { AudioInputModality } from '../medium/modalities/input/audio.js';
import type { AudioBlob, ImageBlob } from '../medium/modalities/input/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const base64 = (s: string) => Buffer.from(s).toString('base64');

const audioInput: AudioBlob = { data: base64('fake-audio-bytes'), mimeType: 'audio/webm' };
const imageInput: ImageBlob = { data: base64('fake-image-bytes'), mimeType: 'image/jpeg' };

// Set a dummy key for all tests — individual tests override when testing the missing-key path.
beforeEach(() => { process.env.GROQ_API_KEY = 'test-key'; });
afterEach(() => { delete process.env.GROQ_API_KEY; vi.restoreAllMocks(); });

// ── STT service (Groq Whisper) ─────────────────────────────────────────────────

describe('Groq STT service', () => {
  it('returns the transcribed text when Groq responds successfully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ text: 'I think x equals 2' }),
    } as Response);
    const transcribe = createGroqSTT();
    expect(await transcribe(audioInput)).toBe('I think x equals 2');
  });

  it('throws a clear error when Groq returns a non-200 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => null,
    } as Response);
    const transcribe = createGroqSTT();
    await expect(transcribe(audioInput)).rejects.toThrow('Groq STT HTTP 401');
  });

  it('sends a multipart POST with Bearer auth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ text: 'hello' }),
    } as Response);
    globalThis.fetch = mockFetch;
    const transcribe = createGroqSTT();
    await transcribe(audioInput);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('groq.com');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws when GROQ_API_KEY is not set', async () => {
    delete process.env.GROQ_API_KEY;
    const transcribe = createGroqSTT();
    await expect(transcribe(audioInput)).rejects.toThrow('GROQ_API_KEY');
  });
});

// ── InputParser (real CanvasMedium) ───────────────────────────────────────────

describe('InputParser', () => {
  let parser: InputParser;

  beforeEach(() => {
    parser = new InputParser(CanvasMedium.create());
  });

  describe('when the student sends only text', () => {
    it('passes the text through unchanged with no images', async () => {
      const result = await parser.parse({ text: 'What is x?' });
      expect(result.text).toBe('What is x?');
      expect(result.images).toBeUndefined();
    });
  });

  describe('when the student sends only audio', () => {
    it('transcribes the audio and uses the transcription as the text', async () => {
      vi.spyOn(AudioInputModality.prototype, 'process').mockResolvedValue('x equals two');
      const result = await parser.parse({ audio: audioInput });
      expect(result.text).toBe('x equals two');
    });
  });

  describe('when the student sends text and audio together', () => {
    it('appends the transcription to the typed text', async () => {
      vi.spyOn(AudioInputModality.prototype, 'process').mockResolvedValue('and also here');
      const result = await parser.parse({ text: 'Look at this', audio: audioInput });
      expect(result.text).toBe('Look at this and also here');
    });
  });

  describe('when the student sends an image', () => {
    it('passes the image through and adds a placeholder in the text', async () => {
      const result = await parser.parse({ text: 'Is my working correct?', images: [imageInput] });
      expect(result.images).toHaveLength(1);
      expect(result.images![0]).toEqual(imageInput);
      expect(result.text).toContain('[image]');
      expect(result.text).toContain('Is my working correct?');
    });

    it('does not store the raw image data in the history text', async () => {
      const result = await parser.parse({ images: [imageInput] });
      expect(result.text).not.toContain(imageInput.data);
    });
  });

  describe('when the student sends audio, image, and text together', () => {
    it('combines all three into a single coherent input', async () => {
      vi.spyOn(AudioInputModality.prototype, 'process').mockResolvedValue('I am confused here');
      const result = await parser.parse({ text: 'See my diagram', audio: audioInput, images: [imageInput] });
      expect(result.text).toContain('See my diagram');
      expect(result.text).toContain('I am confused here');
      expect(result.text).toContain('[image]');
      expect(result.images).toHaveLength(1);
    });
  });
});
