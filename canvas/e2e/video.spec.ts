import {test,expect,type WebSocketRoute} from '@playwright/test';

test('session parser releases a final video after a question and teaching introduction',async({page})=>{
  process.env.USE_TTS_PROVIDER='test';
  const parserPath='../../agent/dist/medium/modalities/output/parser.js';
  const mediumPath='../../agent/dist/medium/canvas.js';
  const {OutputParser}=await import(parserPath);
  const {CanvasMedium}=await import(mediumPath);
  const parser=new OutputParser(CanvasMedium.create());
  let socket:WebSocketRoute;
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'Video provider'}));
  await page.routeWebSocket('**/session-video',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/session-video');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=async(event:unknown)=>{
    for await(const output of parser.parse(event)){
      if(output.type==='audio_chunk') {output.content=silence(1).toString('base64');output.attrs.mimeType='audio/wav';}
      socket!.send(JSON.stringify(output));
    }
  };
  for(const response of [
    'question: Q02\nwrite: y = 2x - 3',
    "parallel:start\nwrite: Video: Two-variable linear equations intro\nspeak: Let me share a quick video with you to help introduce two-variable linear equations. Let me know when you've finished watching it!\nparallel:end\nplay: https://www.youtube.com/watch?v=AOxMJRtoR2A",
  ]){
    await send({type:'event',event:{type:'tutor-started'}});
    for(let i=0;i<response.length;i+=13)await send({type:'text_chunk',content:response.slice(i,i+13)});
    await send({type:'text',content:response});
    await send({type:'event',event:{type:'tutor-ended'}});
  }
  await expect(page.getByRole('dialog',{name:'Watch together'})).toBeVisible({timeout:20000});
  expect(errors).toEqual([]);
});

function silence(seconds:number){
  const size=8000*2*seconds,wav=Buffer.alloc(44+size);
  wav.write('RIFF');wav.writeUInt32LE(36+size,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(size,40);return wav;
}

test('video waits for narration, autoplays, then pauses and sends one completion message',async({page})=>{
  const messages:any[]=[];let socket:WebSocketRoute;
  await page.addInitScript(()=>{
    const stats={speechEnded:0,videoPlaying:0,videoPause:0};(window as any).mediaStats=stats;
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){const source=create.call(this);source.addEventListener('ended',()=>stats.speechEnded++);return source;};
    document.addEventListener('playing',e=>{if(e.target instanceof HTMLVideoElement)stats.videoPlaying++;},true);
    const pause=HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause=function(){if(this instanceof HTMLVideoElement)stats.videoPause++;return pause.call(this);};
  });
  await page.route('**/lesson.mp4',route=>route.fulfill({contentType:'audio/wav',body:silence(30)}));
  await page.routeWebSocket('**/video-test',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/video-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(e:unknown)=>socket!.send(JSON.stringify(e));
  send({type:'play',content:'http://localhost:32000/lesson.mp4',attrs:{}});
  send({type:'action',action:{type:'parallel-start'}});
  send({type:'text_chunk',content:'Video introduction',attrs:{}});
  send({type:'audio_chunk',content:silence(2).toString('base64'),attrs:{mimeType:'audio/wav',sentence:'Watch this example.'}});
  send({type:'action',action:{type:'parallel-end'}});
  const modal=page.getByRole('dialog',{name:'Watch together'});
  await expect(page.locator('.orb-label')).toHaveText('Explaining…');await expect(modal).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).mediaStats.speechEnded)).toBe(1);
  await expect(modal).toHaveCount(0);
  send({type:'text_chunk',content:'Let me know when you are done.',attrs:{}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(modal).toBeVisible();
  await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'Let me know when you are done.'})).toHaveCount(1);
  const viewport=page.viewportSize()!,bounds=(await modal.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(viewport.width-2);expect(bounds.height).toBeGreaterThanOrEqual(viewport.height-2);
  expect(await page.evaluate(()=>(window as any).mediaStats.speechEnded)).toBe(1);
  await expect.poll(()=>modal.locator('video').evaluate((v:HTMLVideoElement)=>!v.paused&&v.currentTime>0)).toBe(true);
  await page.screenshot({path:'test-results/video-lesson.png'});
  await modal.getByRole('button',{name:'I’m done watching'}).click();
  await expect(modal).toHaveCount(0);
  expect(messages).toEqual([{type:'message',text:'I am done watching'}]);
  expect(await page.evaluate(()=>(window as any).mediaStats.videoPause)).toBeGreaterThan(0);
  await expect(page.locator('.tl-shape[data-shape-type="video"]')).toHaveCount(1);
  send({type:'event',event:{type:'tutor-ended'}});
  const rewatch=page.getByRole('button',{name:'Watch video again',exact:true});
  await expect(rewatch).toBeEnabled();await rewatch.click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button',{name:'Back to canvas',exact:true}).click();
  await expect(modal).toHaveCount(0);
  expect(messages).toEqual([{type:'message',text:'I am done watching'}]);

  const orb=page.getByRole('button',{name:'Send new work; hold to speak',exact:true});await expect(orb).toBeDisabled();
  send({type:'text_chunk',content:'What did you notice?',attrs:{}});await expect(orb).toBeEnabled();
});

test('YouTube opens with autoplay enabled and disconnect closes the overlay',async({page})=>{
  let socket:WebSocketRoute;
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Video provider</p>'}));
  await page.routeWebSocket('**/youtube-test',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/youtube-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();await expect(page.locator('.connection')).toContainText('Connected');
  socket!.send(JSON.stringify({type:'play',content:'https://www.youtube.com/watch?v=CWFyxn0qDEU',attrs:{}}));
  socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
  const modal=page.getByRole('dialog',{name:'Watch together'});await expect(modal).toBeVisible();
  await expect(modal.locator('iframe')).toHaveAttribute('src',/autoplay=1/);
  await page.setViewportSize({width:390,height:844});
  await expect(modal.getByRole('button',{name:'I’m done watching'})).toBeInViewport();
  socket!.close();await expect(modal).toHaveCount(0);
});
