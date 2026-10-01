import {afterEach,expect,it,vi} from 'vitest';
import {createInworldTTS} from '../services/tts/inworld.js';
vi.mock('../services/tts/index.js',()=>({getTTSProvider:()=>provider}));
import {Speak} from '../medium/modalities/output/speak.js';
let provider:()=>AsyncIterable<{data:string;mimeType:string;sampleRate?:number}>;
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('forwards the first PCM chunk without waiting for synthesis and sends a sentence end',async()=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  provider=async function*(){yield{data:'AAA=',mimeType:'audio/pcm',sampleRate:24000};await gate;yield{data:'AQI=',mimeType:'audio/pcm',sampleRate:24000};};
  const iterator=new Speak().handle('Hello.');
  const first=(await iterator.next()).value as any;
  expect(first.attrs).toMatchObject({sentence:'Hello.',sampleRate:'24000'});
  release();const second=(await iterator.next()).value as any;
  expect(second.attrs.streamId).toBe(first.attrs.streamId);expect(second.attrs.sentence).toBeUndefined();
  expect((await iterator.next()).value).toMatchObject({content:'',attrs:{streamEnd:'true'}});
  expect((await iterator.next()).done).toBe(true);
});
it('closes a partial sentence on provider failure instead of leaving playback waiting',async()=>{
  provider=async function*(){yield{data:'AAA=',mimeType:'audio/pcm'};throw new Error('provider failed');};
  const iterator=new Speak().handle('Hello.');await iterator.next();
  expect((await iterator.next()).value).toMatchObject({attrs:{streamEnd:'true',streamError:expect.any(String)}});
  await expect(iterator.next()).rejects.toThrow('provider failed');
});
it('parses HTTP fragments and final NDJSON lines, requests raw PCM, and exposes stream errors',async()=>{
  vi.stubEnv('INWORLD_API_KEY','test');vi.stubEnv('INWORLD_VOICE_ID','test');
  const encoder=new TextEncoder();
  const fetch=vi.fn(async(_url:unknown,_init:RequestInit)=>new Response(new ReadableStream({start(c){
    for(const s of ['{"result":{"audio','Content":"AAA="}}\n{"result":{"audioContent":"AQI="}}\n','{"error":{"message":"failed"}}'])c.enqueue(encoder.encode(s));c.close();
  }})));
  vi.stubGlobal('fetch',fetch);
  const iterator=createInworldTTS()('Hello')[Symbol.asyncIterator]();
  expect((await iterator.next()).value).toMatchObject({data:'AAA=',mimeType:'audio/pcm',sampleRate:24000});
  expect((await iterator.next()).value?.data).toBe('AQI=');
  await expect(iterator.next()).rejects.toThrow('failed');
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).audio_config).toMatchObject({audio_encoding:'PCM',sample_rate_hertz:24000});
});
