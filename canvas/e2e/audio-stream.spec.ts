import {test,expect,type WebSocketRoute} from '@playwright/test';

test('PCM starts before sentence end, finishes in order, and replays on the client',async({page})=>{
  let socket:WebSocketRoute;
  await page.addInitScript(()=>{
    const stats={started:0,ended:0,active:0,maxActive:0};(window as any).streamStats=stats;
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){
      const source=create.call(this),start=source.start.bind(source);
      source.start=function(when=0){
        stats.started++;
        setTimeout(()=>{stats.active++;stats.maxActive=Math.max(stats.active,stats.maxActive);},Math.max(0,(when-source.context.currentTime)*1000));
        start(when);
      };
      source.addEventListener('ended',()=>{stats.ended++;stats.active--;});return source;
    };
  });
  await page.routeWebSocket('**/audio-stream-test',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/audio-stream-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  const pcm=(id:string,end=false)=>({type:'audio_chunk',content:end?'':Buffer.alloc(24000).toString('base64'),attrs:{mimeType:'audio/pcm',sampleRate:'24000',streamId:id,...(end?{streamEnd:'true'}:{sentence:'Let us solve this together.'})}});
  const stats=()=>page.evaluate(()=>(window as any).streamStats);
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'action',action:{type:'parallel-start'}});send(pcm('first'));
  await expect.poll(async()=>(await stats()).started).toBe(1);
  // First buffer really finishes while generation remains open.
  await expect.poll(async()=>(await stats()).ended).toBe(1);
  send(pcm('first'));send(pcm('first',true));send(pcm('second'));send(pcm('second',true));
  send({type:'action',action:{type:'parallel-end'}});send({type:'event',event:{type:'tutor-ended'}});
  await expect.poll(async()=>(await stats()).ended).toBe(3);
  await expect.poll(()=>page.evaluate(()=>(window as any).canvasPlaybackDiagnostics().playback.running)).toBe(false);
  await page.getByRole('button',{name:/Hear it again/i}).click({timeout:20000});
  await expect.poll(async()=>(await stats()).ended,{timeout:10000}).toBe(6);
});
