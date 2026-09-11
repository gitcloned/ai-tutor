export type Attrs = Record<string, string>;
export type WireEvent = { type: string; content?: string; attrs?: Attrs; message?: string; action?: unknown };
export type Block = { kind: 'write' | 'svg' | 'ask' | 'play' | 'speech' | 'audio' | 'error' | 'action'; content: string; attrs: Attrs; action?: unknown };
export class BlockAdapter {
  private pending = '';
  reset() { this.pending = ''; }
  accept(event: WireEvent): Block[] {
    const result: Block[] = [];
    const flush = (attrs: Attrs = {}) => {
      if (this.pending.trim()) result.push({ kind: 'write', content: this.pending.trim(), attrs });
      this.pending = '';
    };
    if (event.type === 'text_chunk') {
      this.pending += event.content ?? '';
      if (event.attrs !== undefined) flush(event.attrs);
      return result;
    }
    if (event.type === 'text') { flush(); return result; }
    if (['svg','ask','play','audio_chunk','error','action'].includes(event.type)) flush();
    const attrs = event.attrs ?? {};
    if (['svg','ask','play'].includes(event.type)) result.push({kind:event.type as 'svg'|'ask'|'play',content:event.content ?? '',attrs});
    if (event.type === 'audio_chunk') result.push({kind:attrs.mimeType === 'text/plain' ? 'speech' : 'audio',content:attrs.mimeType === 'text/plain' ? decodeNarration(event.content ?? '') : event.content ?? '',attrs});
    if (event.type === 'error') result.push({kind:'error',content:event.message ?? 'The tutor encountered an error.',attrs});
    if (event.type === 'action') result.push({kind:'action',content:'',attrs,action:event.action});
    return result;
  }
}
export function decodeNarration(base64: string) { return new TextDecoder().decode(Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))); }
export function position(attrs: Attrs, width: number, height: number) {
  if (!attrs.position) return null;
  const coordinates = attrs.position.split(',').map(Number);
  if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return null;
  const [x,y] = coordinates;
  return attrs.anchor === 'center' ? {x:x-width/2,y:y-height/2} : {x,y};
}
export function safeMedia(value: string): {kind:'youtube'|'video'|'link';url:string} | null {
  try {
    const url = new URL(value.trim());
    if (!['https:','http:'].includes(url.protocol)) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname) ? url.searchParams.get('v') ?? url.pathname.match(/^\/embed\/([^/]+)/)?.[1] : null;
    if (id && /^[\w-]{11}$/.test(id)) return {kind:'youtube',url:`https://www.youtube.com/watch?v=${id}`};
    return {kind:/\.(mp4|webm|ogg)$/i.test(url.pathname)?'video':'link',url:url.href};
  } catch { return null; }
}
