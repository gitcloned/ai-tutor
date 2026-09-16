import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import type { ImageBlob, AudioBlob } from './medium/modalities/input/types.js';

const __dir    = dirname(fileURLToPath(import.meta.url));
const IMG_DIR  = join(__dir, '../tmp/images');
const AUD_DIR  = join(__dir, '../tmp/audio');

const IMG_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

const AUD_EXT: Record<string, string> = {
  'audio/webm':       'webm',
  'audio/ogg':        'ogg',
  'audio/mp4':        'mp4',
  'audio/mpeg':       'mp3',
  'audio/wav':        'wav',
  'audio/wave':       'wav',
  'audio/x-wav':      'wav',
};

/**
 * Save image blobs to disk and return their filenames.
 * Files land in agent/tmp/images/ and are served by the LP server.
 */
export function saveImages(sessionId: string, images: ImageBlob[]): string[] {
  mkdirSync(IMG_DIR, { recursive: true });
  const ts = Date.now();
  return images.map((img, i) => {
    const ext  = IMG_EXT[img.mimeType] ?? 'jpg';
    const name = `${sessionId}-${ts}-${i}.${ext}`;
    writeFileSync(join(IMG_DIR, name), Buffer.from(img.data, 'base64'));
    return name;
  });
}

/**
 * Save an audio blob to disk and return its filename.
 * Files land in agent/tmp/audio/ and are served by the LP server.
 */
export function saveAudio(sessionId: string, audio: AudioBlob): string {
  mkdirSync(AUD_DIR, { recursive: true });
  const ext  = AUD_EXT[audio.mimeType] ?? 'webm';
  const name = `${sessionId}-${Date.now()}.${ext}`;
  writeFileSync(join(AUD_DIR, name), Buffer.from(audio.data, 'base64'));
  return name;
}
