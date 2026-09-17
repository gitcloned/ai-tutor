/** Raw audio blob received from the client — base64-encoded bytes + MIME type. */
export interface AudioBlob { data: string; mimeType: string; }

/** Raw image blob received from the client — base64-encoded bytes + MIME type. */
export interface ImageBlob { data: string; mimeType: string; }

/**
 * Multimodal student input — the shape sent over any transport.
 * All fields are optional; at least one must be present.
 */
export interface StudentInput {
  activity?: GraphPointInput;
  text?:   string;
  audio?:  AudioBlob;
  images?: ImageBlob[];
}

export interface GraphPointInput {
  type: 'graph-point'; activityId: string; model: 'function-graph'; equation: string;
  x: number; y: number; correct: boolean; complete: boolean; remaining: number[];
}

/** Normalised input ready for the agent: plain text + optional image/audio blobs. */
export interface ProcessedInput {
  text:       string;
  images?:    ImageBlob[];
  audioBlob?: AudioBlob;   // original audio blob, preserved for storage
}
