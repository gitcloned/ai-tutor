/** Raw audio blob received from the client — base64-encoded bytes + MIME type. */
export interface AudioBlob { data: string; mimeType: string; }

/** Raw image blob received from the client — base64-encoded bytes + MIME type. */
export interface ImageBlob { data: string; mimeType: string; }

/**
 * Multimodal student input — the shape sent over any transport.
 * All fields are optional; at least one must be present.
 */
export interface StudentInput {
  text?:   string;
  audio?:  AudioBlob;
  images?: ImageBlob[];
}

/** Normalised input ready for the agent: plain text + optional image list. */
export interface ProcessedInput {
  text:    string;
  images?: ImageBlob[];
}
