/**
 * STTProvider — server-side speech-to-text interface.
 *
 * Accepts a raw audio blob (base64-encoded bytes + MIME type) and returns the
 * transcribed text. Implementations are free to use any STT backend.
 */
export type STTProvider = (audio: { data: string; mimeType: string }) => Promise<string>;
