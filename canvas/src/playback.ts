import type { Block } from './protocol';
/** Presentation waits for completion, without changing the backend's event order. */
export class Playback {
  private queue: Block[] = [];
  private running = false;
  private controller = new AbortController();
  private parallelDepth = 0;
  private parallelTasks: Promise<void>[] = [];
  private previousKind: Block['kind'] | null = null;
  paused = false;
  constructor(
    private present:(block:Block,signal:AbortSignal)=>Promise<void>,
    private failed:(error:unknown)=>void,
    private idle:()=>void=()=>{},
    private waitBefore:(ms:number,signal:AbortSignal)=>Promise<void> = (ms, signal) => delay(ms, signal, () => this.paused),
  ) {}
  add(blocks:Block[]) { this.queue.push(...blocks); void this.drain(); }
  setPaused(value:boolean) { this.paused=value; if(!value) void this.drain(); }
  cancel() {
    this.queue=[];
    this.controller.abort();
    this.controller=new AbortController();
    this.parallelDepth=0;
    this.parallelTasks=[];
    this.previousKind=null;
    this.paused=false;
  }
  private async drain() {
    if(this.running || this.paused) return;
    this.running=true;
    try {
      while(this.queue.length && !this.paused) {
        const block=this.queue.shift()!;
        const action = block.action;
        if (block.kind === 'action' && action && typeof action === 'object' && 'type' in action) {
          if (action.type === 'parallel-start') { this.parallelDepth++; continue; }
          if (action.type === 'parallel-end') {
            this.parallelDepth = Math.max(0, this.parallelDepth - 1);
            if (this.parallelDepth === 0) await Promise.all(this.parallelTasks.splice(0));
            continue;
          }
        }
        if (this.parallelDepth > 0) {
          this.parallelTasks.push(this.run(block));
        } else {
          const pause = transitionPause(this.previousKind, block.kind);
          if (pause) await this.waitBefore(pause, this.controller.signal);
          await this.run(block);
        }
        if (isPresentationBlock(block)) this.previousKind = block.kind;
      }
      if (this.parallelDepth === 0 && this.parallelTasks.length) await Promise.all(this.parallelTasks.splice(0));
    } finally { this.running=false; if(!this.queue.length) this.idle(); }
  }
  private async run(block: Block) {
    try { await this.present(block,this.controller.signal); } catch(error) { if((error as Error).name!=='AbortError') this.failed(error); }
  }
}

function isPresentationBlock(block: Block) {
  return ['model3d','write','svg','ask','play','speech','audio'].includes(block.kind);
}

export function transitionPause(previous: Block['kind'] | null, next: Block['kind']) {
  if (next !== 'speech' && next !== 'audio') return 0;
  if (previous === 'write') return 1200;
  if (previous === 'svg') return 1600;
  if (previous === 'model3d') return 1200;
  return 0;
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
  async play(base64:string,signal:AbortSignal,progress?:(elapsed:number,duration:number)=>void) {
    await this.unlock();
    const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
    const buffer=await this.context!.decodeAudioData(bytes.buffer);
    if(signal.aborted) return;
    await new Promise<void>((resolve,reject)=>{
      const source=this.context!.createBufferSource(); source.buffer=buffer; source.connect(this.context!.destination);
      const startTime=this.context!.currentTime;
      const timer=setInterval(()=>{if(!signal.aborted)progress?.(this.context!.currentTime-startTime,buffer.duration);},30);
      const stop=()=>{clearInterval(timer);source.onended=null;source.stop();source.disconnect();reject(new DOMException('Cancelled','AbortError'));};
      signal.addEventListener('abort',stop,{once:true});
      source.onended=()=>{clearInterval(timer);signal.removeEventListener('abort',stop);source.disconnect();if(!signal.aborted)progress?.(buffer.duration,buffer.duration);resolve();}; source.start();
    });
  }
  close() { void this.context?.close(); this.context=null; }
}
