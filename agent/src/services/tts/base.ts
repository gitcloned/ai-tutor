/**
 * TTSProvider — server-side text-to-speech interface.
 *
 * Returns an AsyncIterable so streaming providers (e.g. Inworld) can yield
 * multiple audio chunks per sentence. Simple providers just yield once.
 */
export type TTSProvider = (text: string) => AsyncIterable<{ data: string; mimeType: string }>;
