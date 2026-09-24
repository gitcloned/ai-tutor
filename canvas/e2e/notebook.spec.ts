import {test,expect,type WebSocketRoute} from '@playwright/test';

test('initial session selects a saved canvas; later sessions remain on the same page',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/session-pages',ws=>{socket=ws;});
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/session-pages');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  const session=(id:string,title:string)=>send({type:'session',sessionId:id,conceptId:id,title});
  const reconnect=async()=>{
    await page.locator('.connection').click();
    await page.getByRole('button',{name:'Reconnect',exact:true}).click();
    await expect(page.locator('.connection')).toContainText('Connected');
  };
  const text=page.locator('.tl-shape[data-shape-type="text"]');
  session('first','First lesson');send({type:'text_chunk',content:'Previous work',attrs:{}});
  await expect(text).toContainText('Previous work');
  await reconnect();
  // Opening a socket alone must not discard the visible page.
  await expect(text).toContainText('Previous work');
  session('second','Second lesson');
  await expect(text).toHaveCount(0);
  send({type:'text_chunk',content:'New work',attrs:{}});
  await expect(text).toContainText('New work');
  session('third','Next topic');
  await expect(page.locator('.lesson-breadcrumb')).toContainText('Next topic');
  await expect(text).toContainText('New work');
  await reconnect();session('first','First lesson');
  await expect(text).toContainText('Previous work');
  await reconnect();session('third','Next topic');
  await expect(text).toContainText('New work');
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await expect(page.locator('.notebook-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Close notebook'}).click();
  // Wait for notebook persistence before reloading, then resume via the alias.
  await expect.poll(()=>page.evaluate(()=>new Promise<boolean>(resolve=>{
    const request=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');
    request.onsuccess=()=>{const db=request.result,query=db.transaction('records').objectStore('records').getAll();query.onsuccess=()=>{resolve(query.result.some((r:any)=>r.typeName==='page'&&r.meta.sessionIds?.includes('third')));db.close();};};
  }))).toBe(true);
  await page.reload();
  await page.locator('.connection').click();
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  session('second','Second lesson');
  await expect(text).toContainText('New work');
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await expect(page.locator('.notebook-row')).toHaveCount(2);
});

function silence(seconds:number) {
  const size=8000*2*seconds, wav=Buffer.alloc(44+size);
  wav.write('RIFF');wav.writeUInt32LE(36+size,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(size,40);
  return wav.toString('base64');
}

test('parallel narration never overlaps real audio sources and visuals still render',async({page})=>{
  await page.addInitScript(()=>{
    const stats={active:0,max:0,started:0,ended:0};
    (window as any).audioStats=stats;
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){
      const source=create.call(this),start=source.start.bind(source);
      source.start=(...args:Parameters<typeof start>)=>{stats.active++;stats.started++;stats.max=Math.max(stats.max,stats.active);start(...args);};
      source.addEventListener('ended',()=>{stats.active--;stats.ended++;});
      return source;
    };
  });
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/audio-order',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/audio-order');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'action',action:{type:'parallel-start'}});
  send({type:'audio_chunk',content:silence(2),attrs:{mimeType:'audio/wav',sentence:'Take a look at this equation.'}});
  send({type:'text_chunk',content:'x + 2 = 5',attrs:{}});
  send({type:'audio_chunk',content:silence(1),attrs:{mimeType:'audio/wav',sentence:'Can you find the missing value?'}});
  send({type:'action',action:{type:'parallel-end'}});
  send({type:'ask',content:'Your answer?',attrs:{}});
  await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'x + 2 = 5'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).audioStats.started)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).audioStats.ended)).toBe(2);
  expect(await page.evaluate(()=>(window as any).audioStats.max)).toBe(1);
  await expect(page.locator('.caption p')).toHaveText('Your answer?');
});

test('connection hides welcome, audio types captions, deleted notebook page can be undone',async({page})=>{
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/test-tutor',ws=>{socket=ws;});
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/test-tutor');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await expect(page.locator('.welcome')).toHaveCount(0);
  socket!.send(JSON.stringify({type:'session',title:'Notebook test',sessionId:'test'}));
  const sentence='A cuboid has length, width, and height. Count the cubes inside.';
  socket!.send(JSON.stringify({type:'audio_chunk',content:silence(3),attrs:{mimeType:'audio/wav',sentence}}));
  const caption=page.locator('.caption p');
  await expect.poll(async()=>{const s=await caption.textContent();return !!s&&sentence.startsWith(s)&&s.length>3&&s.length<sentence.length;}).toBe(true);
  await expect(caption).toHaveText(sentence,{timeout:7000});
  socket!.send(JSON.stringify({type:'text_chunk',content:'Volume = length × width × height',attrs:{}}));
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await expect(page.getByRole('button',{name:'Delete Notebook test',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Close notebook'}).click();
  await page.locator('.connection').click();
  await page.getByRole('button',{name:'Disconnect and keep my notebook'}).click();
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await page.getByRole('button',{name:'Delete Notebook test',exact:true}).click();
  await expect(page.locator('.page-list')).not.toContainText('Notebook test');
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Close notebook'}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.lesson-breadcrumb')).toContainText('Notebook test');
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
});

test('a full notebook deletes its oldest half and creates the new session page',async({page})=>{
  test.setTimeout(90000);
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/many-pages',ws=>{socket=ws;});
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/many-pages');
  for(let i=0;i<41;i++){
    await page.getByRole('button',{name:i?'Reconnect':'Connect to tutor',exact:true}).click();
    await expect(page.locator('.connection')).toContainText('Connected');
    socket!.send(JSON.stringify({type:'session',sessionId:`many-${i}`,conceptId:'topic',title:`Lesson ${i}`}));
    await expect(page.locator('.lesson-breadcrumb')).toContainText(`Lesson ${i}`);
    if(i<40)await page.locator('.connection').click();
  }
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await expect(page.locator('.notebook-row')).toHaveCount(21);
  await expect(page.locator('.notebook-open').filter({hasText:/^.*Lesson 0$/})).toHaveCount(0);
  await expect(page.locator('.notebook-open').filter({hasText:'Lesson 40'})).toHaveCount(1);
  await page.getByRole('button',{name:'Close notebook'}).click();
  await page.getByRole('button',{name:'Lesson warnings (1)',exact:true}).click();
  await expect(page.getByRole('region',{name:'Lesson warnings'})).toContainText('Removed 20 oldest pages');
});
