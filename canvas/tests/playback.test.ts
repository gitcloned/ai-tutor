import { expect, it } from 'vitest';
import { Playback, transitionPause } from '../src/playback';
it('does not present a diagram until the previous speech finishes', async () => {
  const seen: string[] = []; let finish!: () => void;
  const speech = new Promise<void>(resolve => {finish=resolve;});
  const player = new Playback(async block => { seen.push(block.kind); if(block.kind==='speech') await speech; },()=>{});
  player.add([{kind:'speech',content:'Hello',attrs:{}},{kind:'svg',content:'<svg/>',attrs:{}}]);
  await Promise.resolve(); expect(seen).toEqual(['speech']);
  finish(); await new Promise(r=>setTimeout(r,0)); expect(seen).toEqual(['speech','svg']);
});
it('keeps a new lesson title behind presentation already in progress', async () => {
  const seen: string[] = []; let finish!: () => void;
  const speech = new Promise<void>(resolve => {finish=resolve;});
  const player = new Playback(async block => {seen.push(block.kind);if(block.kind==='speech') await speech;},()=>{});
  player.add([{kind:'speech',content:'First lesson',attrs:{}},{kind:'session',content:'Next lesson',attrs:{}}]);
  await Promise.resolve();expect(seen).toEqual(['speech']);
  finish();await new Promise(resolve=>setTimeout(resolve,0));expect(seen).toEqual(['speech','session']);
});
it('cancellation discards queued content from an old connection', async () => {
  const seen: string[] = []; let finish!:()=>void;
  const player = new Playback(async block=>{seen.push(block.kind); if(block.kind==='speech') await new Promise<void>(r=>{finish=r});},()=>{});
  player.add([{kind:'speech',content:'hello',attrs:{}},{kind:'ask',content:'old question',attrs:{}}]);
  player.cancel(); finish(); await new Promise(r=>setTimeout(r,0)); expect(seen).toEqual(['speech']);
});
it('runs speech and visuals concurrently inside explicit parallel markers', async () => {
  const seen: string[] = [];
  let finishSpeech!: () => void;
  const speech = new Promise<void>(resolve => { finishSpeech = resolve; });
  const player = new Playback(async block => {
    seen.push(block.kind + ':' + block.content);
    if (block.kind === 'speech') await speech;
  }, () => {});
  player.add([
    {kind:'action',content:'',attrs:{},action:{type:'parallel-start'}},
    {kind:'speech',content:'narrate',attrs:{}},
    {kind:'svg',content:'diagram',attrs:{}},
    {kind:'action',content:'',attrs:{},action:{type:'parallel-end'}},
  ]);
  await new Promise(r => setTimeout(r, 0));
  expect(seen).toEqual(['speech:narrate','svg:diagram']);
  finishSpeech();
  await new Promise(r => setTimeout(r, 0));
  expect(seen).toHaveLength(2);
});

it('adds a natural pause before speech that follows writing or a diagram', () => {
  expect(transitionPause('write', 'speech')).toBe(1200);
  expect(transitionPause('svg', 'speech')).toBe(1600);
  expect(transitionPause('speech', 'write')).toBe(0);
});

it('waits before sequential speech but respects explicit parallel presentation', async () => {
  const seen: string[] = [];
  const waits: number[] = [];
  const player = new Playback(
    async block => { seen.push(block.kind); },
    () => {},
    () => {},
    async ms => { waits.push(ms); },
  );

  player.add([
    {kind:'write',content:'2x = 4',attrs:{}},
    {kind:'speech',content:'Now divide by two.',attrs:{}},
    {kind:'action',content:'',attrs:{},action:{type:'parallel-start'}},
    {kind:'svg',content:'diagram',attrs:{}},
    {kind:'speech',content:'This is the diagram.',attrs:{}},
    {kind:'action',content:'',attrs:{},action:{type:'parallel-end'}},
  ]);

  await new Promise(resolve => setTimeout(resolve, 0));
  expect(seen).toEqual(['write','speech','svg','speech']);
  expect(waits).toEqual([1200]);
});

it('defers camera until turn-end and narration finish, then releases the turn',async()=>{
  const seen:string[]=[];let finish!:()=>void;let idle=false;
  const player=new Playback(async b=>{seen.push(b.kind);if(b.kind==='speech')await new Promise<void>(r=>{finish=r;});},()=>{},()=>{idle=true;});
  player.add([
    {kind:'action',content:'',attrs:{},action:{type:'open-camera'}},
    {kind:'action',content:'',attrs:{},action:{type:'parallel-start'}},
    {kind:'speech',content:'Take a photo',attrs:{}},
    {kind:'write',content:'Your worksheet',attrs:{}},
    {kind:'action',content:'',attrs:{},action:{type:'tutor-ended'}},
  ]);
  await new Promise(r=>setTimeout(r,0));expect(seen).toEqual(['speech','write']);expect(idle).toBe(false);
  finish();await new Promise(r=>setTimeout(r,0));expect(seen).toEqual(['speech','write','action']);expect(idle).toBe(true);
});
it('cancels a deferred camera request',async()=>{
  const seen:string[]=[];const player=new Playback(async b=>{seen.push(b.kind);},()=>{});
  player.add([{kind:'action',content:'',attrs:{},action:{type:'open-camera'}}]);player.cancel();
  player.add([{kind:'action',content:'',attrs:{},action:{type:'tutor-ended'}}]);
  await new Promise(r=>setTimeout(r,0));expect(seen).toEqual([]);
});
