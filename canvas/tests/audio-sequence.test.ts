import {expect,it} from 'vitest';
import {Playback} from '../src/playback';
import type {Block} from '../src/protocol';
const tick=()=>new Promise(r=>setTimeout(r,0));
const block=(kind:Block['kind'],content:string):Block=>({kind,content,attrs:{}});
const boundary=(type:string):Block=>({kind:'action',content:'',attrs:{},action:{type}});

it('opens a parallel video after all speech, then waits for dismissal before continuing',async()=>{
  const seen:string[]=[],finish:Record<string,()=>void>={};
  const player=new Playback(async b=>{seen.push(b.content);if(['audio','play'].includes(b.kind))await new Promise<void>(r=>{finish[b.content]=r;});},()=>{},()=>{},async()=>{});
  player.add([boundary('parallel-start'),block('play','video'),block('audio','intro'),block('svg','diagram'),block('audio','more intro'),boundary('parallel-end'),block('speech','last intro'),boundary('tutor-ended'),block('speech','next turn')]);
  await tick();expect(seen).toEqual(['intro','diagram']);
  finish.intro();await tick();expect(seen).toEqual(['intro','diagram','more intro']);
  finish['more intro']();await tick();expect(seen.slice(-2)).toEqual(['last intro','video']);expect(seen).not.toContain('next turn');
  finish.video();await tick();expect(seen.at(-1)).toBe('next turn');
});

it('waits for speech outside parallel groups before opening video',async()=>{
  const seen:string[]=[];let finish!:()=>void;
  const player=new Playback(async b=>{seen.push(b.content);if(b.kind==='audio')await new Promise<void>(r=>{finish=r;});},()=>{});
  player.add([block('audio','intro'),block('play','video'),boundary('tutor-ended')]);await tick();expect(seen).toEqual(['intro']);
  finish();await tick();expect(seen).toEqual(['intro','video']);
});

it('defers an early video across streamed gaps and later parallel groups until turn end',async()=>{
  const seen:string[]=[];let finish!:()=>void;
  const player=new Playback(async b=>{seen.push(b.content);if(b.kind==='audio')await new Promise<void>(r=>{finish=r;});},()=>{},()=>{},async()=>{});
  player.add([block('play','video')]);await tick();expect(seen).toEqual([]);
  player.add([boundary('parallel-start'),block('write','title'),block('audio','intro'),boundary('parallel-end')]);await tick();expect(seen).toEqual(['title','intro']);
  finish();await tick();expect(seen).not.toContain('video');
  player.add([block('write','final note'),boundary('tutor-ended')]);await tick();expect(seen).toEqual(['title','intro','final note','video']);
});

it('discards a deferred video when the connection is cancelled',async()=>{
  const seen:string[]=[];const player=new Playback(async b=>{seen.push(b.content);},()=>{});
  player.add([block('play','old video')]);await tick();player.cancel();
  player.add([block('write','new lesson'),boundary('tutor-ended')]);await tick();expect(seen).toEqual(['new lesson']);
});

it('serializes audio and simulated speech inside parallel groups while visuals proceed',async()=>{
  const seen:string[]=[],finish:Record<string,()=>void>={};
  const player=new Playback(async b=>{seen.push(b.content);if(b.kind==='audio'||b.kind==='speech')await new Promise<void>(r=>{finish[b.content]=r;});},()=>{});
  player.add([boundary('parallel-start'),block('audio','first'),block('svg','diagram'),block('audio','second'),block('speech','third'),boundary('parallel-end'),block('ask','question')]);
  await tick();expect(seen).toEqual(['first','diagram']);
  finish.first();await tick();expect(seen).toEqual(['first','diagram','second']);
  finish.second();await tick();expect(seen).toEqual(['first','diagram','second','third']);
  finish.third();await tick();expect(seen.at(-1)).toBe('question');
});

it('keeps serialization across separately arriving chunks and parallel boundaries',async()=>{
  const seen:string[]=[],finish:Record<string,()=>void>={};
  const player=new Playback(async b=>{seen.push(b.content);await new Promise<void>(r=>{finish[b.content]=r;});},()=>{});
  player.add([boundary('parallel-start'),block('audio','first')]);await tick();
  player.add([block('audio','second'),boundary('parallel-end'),block('audio','outside')]);await tick();expect(seen).toEqual(['first']);
  finish.first();await tick();expect(seen).toEqual(['first','second']);
  finish.second();await tick();expect(seen).toEqual(['first','second','outside']);finish.outside();await tick();
});

it('discards queued narration on cancel and lets a new connection speak',async()=>{
  const seen:string[]=[];let finish!:()=>void;
  const player=new Playback(async b=>{seen.push(b.content);if(b.content==='old')await new Promise<void>(r=>{finish=r;});},()=>{});
  player.add([boundary('parallel-start'),block('audio','old'),block('audio','discard'),boundary('parallel-end')]);await tick();
  player.cancel();player.add([block('audio','new')]);finish();await tick();await tick();expect(seen).toEqual(['old','new']);
});

it('waits for resume before starting another queued audio block',async()=>{
  const seen:string[]=[];let finish!:()=>void;
  const player=new Playback(async b=>{seen.push(b.content);if(b.content==='first')await new Promise<void>(r=>{finish=r;});},()=>{});
  player.add([boundary('parallel-start'),block('audio','first'),block('audio','second'),boundary('parallel-end')]);await tick();
  player.setPaused(true);finish();await tick();expect(seen).toEqual(['first']);
  player.setPaused(false);await new Promise(r=>setTimeout(r,40));expect(seen).toEqual(['first','second']);
});
