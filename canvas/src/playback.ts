import type { Block } from './protocol';
/** Presentation waits for completion, without changing the backend's event order. */
export class Playback {
  private queue: Block[] = [];
  private running = false;
  private controller = new AbortController();
  private parallelDepth = 0;
  private parallelTasks: Promise<void>[] = [];
  private turnVideos:Block[]=[];
  private turnCamera:Block|null=null;
  private narrationTail: Promise<void> | null = null;
  private previousKind: Block['kind'] | null = null;
  paused = false;
  snapshot() {
    return {running:this.running,paused:this.paused,queued:this.queue.map(b=>b.kind),
      parallelDepth:this.parallelDepth,parallelTasks:this.parallelTasks.length,
      pendingVideos:this.turnVideos.length,narrationPending:!!this.narrationTail};
  }
  constructor(
    private present:(block:Block,signal:AbortSignal)=>Promise<void>,
    private failed:(error:unknown)=>void,
    private idle:()=>void=()=>{},
    private waitBefore:(ms:number,signal:AbortSignal)=>Promise<void> = (ms, signal) => delay(ms, signal, () => this.paused),
    private hasActiveQuestion:()=>boolean = ()=>false,
  ) {}
  add(blocks:Block[]) { this.queue.push(...blocks); void this.drain(); }
  setPaused(value:boolean) { this.paused=value; if(!value) void this.drain(); }
  cancel() {
    this.queue=[];
    this.controller.abort();
    this.controller=new AbortController();
    this.parallelDepth=0;
    this.parallelTasks=[];
    this.turnVideos=[];
    this.turnCamera=null;
    this.narrationTail=null;
    this.previousKind=null;
    this.paused=false;
  }
  private async drain() {
    if(this.running || this.paused) return;
    this.running=true;
    try {
      while(this.queue.length && !this.paused) {
        const block=this.queue.shift()!;
        // A video may arrive before its introduction. Only the explicit turn
        // boundary guarantees all speech and writing for that turn have arrived.
        if(block.kind==='play'){this.turnVideos.push(block);continue;}
        if(block.kind==='question'&&block.content.trim()==='end'){
          const signal=this.controller.signal;
          // Even inside parallel blocks, close is a boundary: finish the current
          // explanation before closing, then hold all subsequent presentation.
          await Promise.all(this.parallelTasks.splice(0));
          if(signal.aborted)continue;
          const wasActive=this.hasActiveQuestion();
          await this.run(block);
          if(signal.aborted)continue;
          if(wasActive){
            try{await this.waitBefore(2000,signal);}
            catch(error){if((error as Error).name!=='AbortError')this.failed(error);}
          }
          if(!signal.aborted)this.previousKind='question';
          continue;
        }
        const action = block.action;
        if (block.kind === 'action' && action && typeof action === 'object' && 'type' in action) {
          if(action.type==='open-camera'){this.turnCamera=block;continue;}
          if(action.type==='tutor-ended'){
            const videos=this.turnVideos.splice(0),camera=this.turnCamera,signal=this.controller.signal;
            this.turnCamera=null;
            await Promise.all(this.parallelTasks.splice(0));
            this.parallelDepth=0;
            for(const video of videos){if(signal.aborted)break;await this.run(video);}
            if(camera&&!signal.aborted)await this.run(camera);
            continue;
          }
          if (action.type === 'parallel-start') { this.parallelDepth++; continue; }
          if (action.type === 'parallel-end') {
            this.parallelDepth = Math.max(0, this.parallelDepth - 1);
            if (this.parallelDepth === 0) {
              await Promise.all(this.parallelTasks.splice(0));
            }
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
    } finally { this.running=false; if(!this.queue.length&&!this.parallelTasks.length&&!this.turnVideos.length&&!this.turnCamera&&!this.narrationTail) this.idle(); }
  }
  private run(block: Block): Promise<void> {
    // Capture this connection's signal now: a queued sentence must never inherit
    // a new connection's signal after cancel().
    const signal=this.controller.signal;
    const present=async()=>{
      try {
        while(this.paused&&!signal.aborted)await new Promise(r=>setTimeout(r,16));
        if(!signal.aborted)await this.present(block,signal);
      } catch(error) { if((error as Error).name!=='AbortError') this.failed(error); }
    };
    if(block.kind!=='audio'&&block.kind!=='speech'&&block.kind!=='play')return present();
    // Parallel means narration can accompany visuals, never another narration.
    // Videos share this queue: preceding speech finishes before video opens,
    // and subsequent speech waits until the student dismisses the video.
    const task=this.narrationTail?this.narrationTail.then(present):present();
    const tail=task.finally(()=>{if(this.narrationTail===tail)this.narrationTail=null;});
    this.narrationTail=tail;
    return tail;
  }
}

function isPresentationBlock(block: Block) {
  return ['model','model3d','question','annotate','write','svg','ask','play','speech','audio'].includes(block.kind);
}

export function transitionPause(previous: Block['kind'] | null, next: Block['kind']) {
  if (next !== 'speech' && next !== 'audio') return 0;
  if (previous === 'write') return 1200;
  if (previous === 'annotate') return 1200;
  if (previous === 'svg') return 1600;
  if (previous === 'model3d' || previous === 'model') return 1200;
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
  get state(){return this.context?.state??'not-created';}
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
