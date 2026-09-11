import type { Block } from './protocol';
/** Presentation waits for completion, without changing the backend's event order. */
export class Playback {
  private queue: Block[] = [];
  private running = false;
  private controller = new AbortController();
  paused = false;
  constructor(private present:(block:Block,signal:AbortSignal)=>Promise<void>,private failed:(error:unknown)=>void,private idle:()=>void=()=>{}) {}
  add(blocks:Block[]) { this.queue.push(...blocks); void this.drain(); }
  setPaused(value:boolean) { this.paused=value; if(!value) void this.drain(); }
  cancel() { this.queue=[]; this.controller.abort(); this.controller=new AbortController(); this.paused=false; }
  private async drain() {
    if(this.running || this.paused) return;
    this.running=true;
    try {
      while(this.queue.length && !this.paused) {
        const block=this.queue.shift()!;
        try { await this.present(block,this.controller.signal); } catch(error) { if((error as Error).name!=='AbortError') this.failed(error); }
      }
    } finally { this.running=false; if(!this.queue.length) this.idle(); }
  }
}
export async function delay(ms:number,signal:AbortSignal,paused:()=>boolean=()=>false) {
  let elapsed=0; let last=performance.now();
  while(elapsed<ms) {
    if(signal.aborted) throw new DOMException('Cancelled','AbortError');
    await new Promise(r=>setTimeout(r,16));
    const now=performance.now(); if(!paused()) elapsed+=now-last; last=now;
  }
}
export class AudioPlayer {
  private context:AudioContext|null=null;
  unlock() { this.context??=new AudioContext(); return this.context.resume(); }
  pause(value:boolean) { if(this.context) void (value?this.context.suspend():this.context.resume()); }
  async play(base64:string,signal:AbortSignal) {
    await this.unlock();
    const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
    const buffer=await this.context!.decodeAudioData(bytes.buffer);
    if(signal.aborted) return;
    await new Promise<void>((resolve,reject)=>{
      const source=this.context!.createBufferSource(); source.buffer=buffer; source.connect(this.context!.destination);
      const stop=()=>{source.stop();reject(new DOMException('Cancelled','AbortError'));};
      signal.addEventListener('abort',stop,{once:true});
      source.onended=()=>{signal.removeEventListener('abort',stop);resolve();}; source.start();
    });
  }
  close() { void this.context?.close(); this.context=null; }
}
