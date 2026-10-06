import {afterEach, expect, it, vi} from 'vitest';
import {BlockAdapter} from '../src/protocol';
import {AudioPlayer, Playback} from '../src/playback';
import {pcmSamples} from '../src/audio-stream';
const chunk=(content='AAAAAA==', attrs={})=>({type:'audio_chunk',content,attrs:{mimeType:'audio/pcm',sampleRate:'24000',streamId:'one',...attrs}});
const tick=async()=>{await vi.advanceTimersByTimeAsync(25);};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('feeds one mutable sentence block, without queueing later chunks or end markers',()=>{
  const adapter=new BlockAdapter();
  const [block]=adapter.accept(chunk(undefined,{sentence:'Hello there.'}));
  expect(block.attrs.sentence).toBe('Hello there.');
  expect(block.audioStream?.done).toBe(false);
  expect(adapter.accept(chunk())).toEqual([]);
  expect(block.audioStream?.chunks.length).toBe(2);
  expect(adapter.accept(chunk('',{streamEnd:'true'}))).toEqual([]);
  expect(block.audioStream?.done).toBe(true);
  expect(block.audioStream?.byteLength).toBe(8);
});
it('terminates incomplete streams on disconnect and propagates provider errors',()=>{
  const adapter=new BlockAdapter();const [block]=adapter.accept(chunk());adapter.reset();
  expect(block.audioStream).toMatchObject({done:true,error:'Speech connection closed.'});
  const [next]=adapter.accept(chunk());adapter.accept(chunk('',{streamEnd:'true',streamError:'failed'}));
  expect(next.audioStream?.error).toBe('failed');
});
it('decodes signed little-endian samples exactly',()=>{
  expect([...pcmSamples(new Uint8Array([0,128,255,127,0,0]))]).toEqual([-1,32767/32768,0]);
  expect(()=>pcmSamples(new Uint8Array([1]))).toThrow('Incomplete');
});

function mockAudio(){
  vi.useFakeTimers();
  const starts:number[]=[],samples:number[][]=[];
  class Context {
    state='running';destination={};
    get currentTime(){return Date.now()/1000;}
    async resume(){this.state='running';}
    createBuffer(_channels:number,length:number,rate:number){return {duration:length/rate,copyToChannel:(values:Float32Array)=>samples.push([...values])};}
    createBufferSource(){
      const source={buffer:null as any,onended:null as null|(()=>void),connect(){},disconnect(){},timer:undefined as any,
        start(time:number){starts.push(time);this.timer=setTimeout(()=>this.onended?.(),(time-Date.now()/1000+this.buffer.duration)*1000);},
        stop(){clearTimeout(this.timer);}};
      return source;
    }
  }
  vi.stubGlobal('AudioContext',Context);return {starts,samples};
}
it('starts before EOF, appends gapless buffers, and waits for actual end before next sentence',async()=>{
  const {starts}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk(btoa('\0'.repeat(24000)),{sentence:'Hello.'}));
  const seen:string[]=[];
  const player=new Playback(async(b,signal)=>{seen.push(b.content||'stream');if(b.audioStream)await audio.playStream(b.audioStream,signal,1);},e=>{throw e;});
  player.add([block,{kind:'speech',content:'next',attrs:{}}]);await tick();
  expect(starts.length).toBe(1);expect(seen).toEqual(['stream']);
  adapter.accept(chunk(btoa('\0'.repeat(24000))));await tick();
  expect(starts[1]-starts[0]).toBeCloseTo(0.5);
  await vi.advanceTimersByTimeAsync(1500);expect(seen).toEqual(['stream']);
  adapter.accept(chunk('',{streamEnd:'true'}));await tick();expect(seen).toEqual(['stream','next']);
  // Replay reads the same completed sentence from sample zero.
  const replay=audio.playStream(block.audioStream!,new AbortController().signal,1);
  await vi.advanceTimersByTimeAsync(1200);await replay;expect(starts.length).toBe(4);
});
it('cancels scheduled audio and preserves split sample bytes across chunks',async()=>{
  const {samples}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk(btoa('\0')));
  const controller=new AbortController();const play=audio.playStream(block.audioStream!,controller.signal,1);
  const rejected=expect(play).rejects.toMatchObject({name:'AbortError'});
  await tick();expect(samples).toEqual([]);
  adapter.accept(chunk(btoa('\x80')));adapter.accept(chunk('',{streamEnd:'true'}));await tick();expect(samples).toEqual([[-1]]);
  controller.abort();await tick();await rejected;
});

it('does not leave playback hanging when a turn ends without the sentence end marker',()=>{
  const adapter=new BlockAdapter();const [block]=adapter.accept(chunk());
  adapter.accept({type:'event',event:{type:'tutor-ended'}});
  expect(block.audioStream).toMatchObject({done:true,error:expect.any(String)});
});

it('buffers 300 ms of actual audio before starting, without waiting for EOF',async()=>{
  const {starts}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk(btoa('\0'.repeat(4800)))); // 100 ms
  const controller=new AbortController();
  const play=audio.playStream(block.audioStream!,controller.signal,1);
  const cancelled=expect(play).rejects.toMatchObject({name:'AbortError'});
  await vi.advanceTimersByTimeAsync(200);expect(starts).toEqual([]);
  adapter.accept(chunk(btoa('\0'.repeat(9600)))); // now 300 ms
  await tick();expect(starts).toHaveLength(2);
  expect(starts[1]-starts[0]).toBeCloseTo(0.1);
  expect(block.audioStream?.done).toBe(false);
  controller.abort();await tick();await cancelled;
});

it('plays a completed short sentence without waiting for the buffer threshold',async()=>{
  const {starts}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk(btoa('\0'.repeat(4800))));
  adapter.accept(chunk('',{streamEnd:'true'}));
  const play=audio.playStream(block.audioStream!,new AbortController().signal,1);
  await tick();expect(starts).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(300);await play;
});

it('cancels while waiting for the initial buffer without scheduling any audio',async()=>{
  const {starts}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk());const controller=new AbortController();
  const play=audio.playStream(block.audioStream!,controller.signal,1);
  const cancelled=expect(play).rejects.toMatchObject({name:'AbortError'});
  await tick();controller.abort();await tick();await cancelled;expect(starts).toEqual([]);
});

it('records a late chunk as a playback gap without speeding up the samples',async()=>{
  const {starts}=mockAudio();const adapter=new BlockAdapter(),audio=new AudioPlayer();
  const [block]=adapter.accept(chunk(btoa('\0'.repeat(14400))));
  const play=audio.playStream(block.audioStream!,new AbortController().signal,1);
  await vi.advanceTimersByTimeAsync(800);
  adapter.accept(chunk(btoa('\0'.repeat(4800))));adapter.accept(chunk('',{streamEnd:'true'}));
  await vi.advanceTimersByTimeAsync(400);await play;
  const [metrics]=audio.snapshot().streams;
  expect(metrics).toMatchObject({status:'completed',initialBufferedMs:300,underruns:1});
  expect(metrics.gapMs).toBeGreaterThan(400);
  expect(starts[1]-starts[0]).toBeGreaterThan(0.7);
});

it('offers recovery when Safari resume stays pending, then plays the queued audio after a tap',async()=>{
  const {starts}=mockAudio();
  let blockedContext:any;
  const Base=globalThis.AudioContext;
  class BlockedContext extends Base {
    state='suspended' as AudioContextState;
    constructor(){super();blockedContext=this;}
    resume(){return new Promise<void>(()=>{});}
  }
  vi.stubGlobal('AudioContext',BlockedContext);
  const player=new AudioPlayer();player.onBlocked=vi.fn();
  const stream={chunks:[new Uint8Array(4800)],byteLength:4800,sampleRate:24000,done:true};
  let finished=false;
  const pending=player.playStream(stream as any,new AbortController().signal,0).then(()=>{finished=true;});
  await vi.advanceTimersByTimeAsync(825);
  expect(player.onBlocked).toHaveBeenCalledTimes(1);expect(finished).toBe(false);expect(starts).toHaveLength(0);
  blockedContext.state='running';
  await vi.advanceTimersByTimeAsync(300);await pending;
  expect(finished).toBe(true);expect(starts).toHaveLength(1);
});

it('cancels pending Safari audio permission without blocking the playback queue',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext',class {state='suspended';resume(){return new Promise<void>(()=>{});}});
  const player=new AudioPlayer(),controller=new AbortController();player.onBlocked=vi.fn();
  const pending=player.playStream({chunks:[],byteLength:0,sampleRate:24000,done:true} as any,controller.signal,0);
  const check=expect(pending).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await vi.advanceTimersByTimeAsync(25);await check;
  expect(player.onBlocked).not.toHaveBeenCalled();
});
