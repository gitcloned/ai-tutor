/** One sentence; chunks arrive independently of the presentation queue. */
export type PcmStream = {
  chunks: Uint8Array[];
  sampleRate: number;
  byteLength: number;
  done: boolean;
  error?: string;
  updatedAt: number;
};

export function pcmSamples(bytes: Uint8Array) {
  if (bytes.length % 2) throw new Error('Incomplete PCM audio sample.');
  const samples = new Float32Array(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}
