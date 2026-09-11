import { expect, it } from 'vitest';
import { Playback } from '../src/playback';
it('does not present a diagram until the previous speech finishes', async () => {
  const seen: string[] = []; let finish!: () => void;
  const speech = new Promise<void>(resolve => {finish=resolve;});
  const player = new Playback(async block => { seen.push(block.kind); if(block.kind==='speech') await speech; },()=>{});
  player.add([{kind:'speech',content:'Hello',attrs:{}},{kind:'svg',content:'<svg/>',attrs:{}}]);
  await Promise.resolve(); expect(seen).toEqual(['speech']);
  finish(); await new Promise(r=>setTimeout(r,0)); expect(seen).toEqual(['speech','svg']);
});
it('cancellation discards queued content from an old connection', async () => {
  const seen: string[] = []; let finish!:()=>void;
  const player = new Playback(async block=>{seen.push(block.kind); if(block.kind==='speech') await new Promise<void>(r=>{finish=r});},()=>{});
  player.add([{kind:'speech',content:'hello',attrs:{}},{kind:'ask',content:'old question',attrs:{}}]);
  player.cancel(); finish(); await new Promise(r=>setTimeout(r,0)); expect(seen).toEqual(['speech']);
});
