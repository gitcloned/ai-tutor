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
  adapter.accept(chunk(btoa('\x80')));await tick();expect(samples).toEqual([[-1]]);
  controller.abort();await tick();await rejected;
});

it('does not leave playback hanging when a turn ends without the sentence end marker',()=>{
  const adapter=new BlockAdapter();const [block]=adapter.accept(chunk());
  adapter.accept({type:'event',event:{type:'tutor-ended'}});
  expect(block.audioStream).toMatchObject({done:true,error:expect.any(String)});
});
