import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';

test('annotation lookback finds a spaced target three steps back and stays inside the question',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/annotation-lookback',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/annotation-lookback');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(type:string,content:string,attrs={})=>socket!.send(JSON.stringify({type,content,attrs}));
  send('question','Q1');send('text_chunk','y = 2*x − 3');send('text_chunk','x = 2');send('text_chunk','(2, ___)');
  send('annotate','',{mark:'circle',target:'-3'});
  await expect.poll(async()=>(await records(page)).filter(r=>r.meta?.mark==='circle').length).toBe(1);
  const saved=await records(page),first=saved.find(r=>r.meta?.questionStep===0);
  expect(saved.find(r=>r.meta?.mark==='circle').meta.stepId).toBe(first.id);
  await expect(page.locator('.toast')).toHaveCount(0);
  send('text_chunk','y = 4 - 3');send('annotate','',{mark:'underline',target:'-3'});
  await expect.poll(async()=>(await records(page)).filter(r=>r.meta?.mark==='underline').length).toBe(1);
  const updated=await records(page);
  expect(updated.find(r=>r.meta?.mark==='underline').meta.stepId).toBe(updated.find(r=>r.meta?.questionStep===3).id);
  send('question','Q2');send('text_chunk','x = 10');send('annotate','',{mark:'circle',target:'-3'});
  await expect(page.locator('.toast')).toContainText('last three steps');
});

async function records(page:Page){
  return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
    const request=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');
    request.onsuccess=()=>{const db=request.result;const read=db.transaction('records').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);
  }));
}

for(const incoming of ['x - 5(-2) = -15','( ___, -2 )\nThe second value is y.\nSubstitute y = -2.\nNow find x.'])test(`new question steps stay below the whole student answer: ${incoming.split('\n').length} lines`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/student-collision',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/student-collision');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(type:string,content:string)=>socket!.send(JSON.stringify({type,content,attrs:{}}));
  send('question','Q1');send('text_chunk','x - 5y = -15');send('text_chunk','( ___, -2 )');
  const pair=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'( ___, -2 )'});
  await expect(pair).toBeVisible();
  await expect.poll(async()=>(await records(page)).filter(r=>r.meta?.questionStep===1).length).toBe(1);
  const box=(await pair.boundingBox())!;
  await page.getByRole('button',{name:'Pencil (D)',exact:true}).click();
  // A single line fits between these strokes. It must still go below BOTH,
  // since the empty gap is part of the student's answer area.
  for(const offset of [70,190]){
    await page.mouse.move(box.x+35,box.y+box.height+offset);await page.mouse.down();
    await page.mouse.move(box.x+100,box.y+box.height+offset+20,{steps:8});await page.mouse.up();
  }
  await expect.poll(async()=>(await records(page)).filter(r=>r.type==='draw'&&r.props.isComplete).length).toBe(2);
  const before=await records(page),frame=before.find(r=>r.type==='frame'),ink=before.filter(r=>r.type==='draw');
  expect(ink.every(s=>s.parentId!==frame.id)).toBe(true);
  send('text_chunk',incoming);
  await expect.poll(async()=>(await records(page)).filter(r=>r.meta?.questionStep===2).length).toBe(1);
  const after=await records(page),next=after.find(r=>r.meta?.questionStep===2),previous=after.find(r=>r.meta?.questionStep===1);
  expect(next.x).toBe(previous.x);
  expect(next.y+frame.y).toBeGreaterThan(Math.max(...ink.map(s=>s.y))+20);
  expect(after.filter(r=>r.type==='draw')).toEqual(ink);
});

test('strokes cross question edges and previously captured ink is not clipped',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/drawing-boundary',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/drawing-boundary');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  socket!.send(JSON.stringify({type:'question',content:'Q1',attrs:{}}));
  socket!.send(JSON.stringify({type:'text_chunk',content:'x - 5y = -15',attrs:{}}));
  const text=page.locator('.tl-shape[data-shape-type="text"]');await expect(text).toContainText('x - 5y = -15');
  const box=(await text.boundingBox())!;
  await page.getByRole('button',{name:'Pencil (D)',exact:true}).click();
  await page.mouse.move(box.x+420,box.y+20);await page.mouse.down();
  await page.mouse.move(box.x+420,box.y+250,{steps:30});await page.mouse.up();
  await expect.poll(async()=>(await records(page)).filter(r=>r.type==='draw'&&r.props.isComplete).length).toBe(1);
  const saved=await records(page),stroke=saved.find(r=>r.type==='draw'),frame=saved.find(r=>r.type==='frame');
  expect(stroke.parentId).not.toBe(frame.id);
  const drawing=page.locator('.tl-shape[data-shape-type="draw"]');
  await expect(drawing).toHaveCSS('clip-path','none');
  expect((await drawing.boundingBox())!.height).toBeGreaterThan(220);
  // Simulate an older notebook stroke already parented to the invisible frame.
  await page.route('**/legacy-drawing',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/legacy-drawing');
  await page.evaluate(({stroke,frame})=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      stroke.parentId=frame.id;stroke.x-=frame.x;stroke.y-=frame.y;
      store.keyPath?store.put(stroke):store.put(stroke,stroke.id);
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };request.onerror=()=>reject(request.error);
  }),{stroke,frame});
  await page.goto('/');await expect(drawing).toBeVisible();
  await expect(drawing).toHaveCSS('clip-path','none');
  expect((await drawing.boundingBox())!.height).toBeGreaterThan(220);
});

test('worked questions keep steps aligned, reserve note space, and save textless marks',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/questions',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/questions');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(type:string,content:string,attrs={})=>socket!.send(JSON.stringify({type,content,attrs}));
  send('question','Q01');
  socket!.send(JSON.stringify({type:'action',action:{type:'parallel-start'}}));
  send('text_chunk','Solve 2x + 3 = 7');
  send('annotate','Subtract three from both sides to keep the equation balanced while getting closer to finding x.',{mark:'arrow',target:'+ 3'});
  send('annotate','',{mark:'underline',target:'2x'});
  socket!.send(JSON.stringify({type:'action',action:{type:'parallel-end'}}));
  send('text_chunk','2x = 4');
  send('annotate','',{mark:'circle',target:'2x'});
  send('text_chunk','x = 2');
  send('question','end');
  await expect.poll(async()=>(await records(page)).filter(r=>r.meta?.questionStep===2).length).toBe(1);
  const saved=await records(page),frame=saved.find(r=>r.type==='frame');
  expect(frame.meta.questionActive).toBe(false);
  const steps=saved.filter(r=>typeof r.meta?.questionStep==='number').sort((a,b)=>a.meta.questionStep-b.meta.questionStep);
  expect(steps.every(s=>s.parentId===frame.id&&s.x===steps[0].x)).toBe(true);
  const note=saved.find(r=>r.type==='text'&&r.meta?.kind==='annotate');
  expect(note.x).toBeGreaterThan(steps[0].x+steps[0].props.w);
  expect(steps[1].y).toBeGreaterThan(steps[0].y+200);
  const marks=saved.filter(r=>r.type==='image'&&r.meta?.kind==='annotate');
  expect(marks).toHaveLength(2);
  expect(marks.every(m=>m.props.w<150&&m.parentId===frame.id)).toBe(true);
  await expect(page.locator('.tl-frame__body')).toHaveCSS('fill','rgba(0, 0, 0, 0)');
  await expect(page.locator('.tl-frame__body')).toHaveCSS('stroke','rgba(0, 0, 0, 0)');
  await page.screenshot({path:'test-results/questions.png'});
  await page.reload();
  await expect(page.locator('.tl-shape[data-shape-type="frame"]')).toHaveCount(1);
  expect((await records(page)).filter(r=>r.meta?.kind==='annotate')).toHaveLength(3);
  await expect(page.locator('.tl-shape[data-shape-type="arrow"]')).toHaveCount(0);
  // Reopen an older notebook whose saved shapes predate the wider note column.
  await page.route('**/migration-test',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/migration-test');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.getAll();
      read.onsuccess=()=>{for(const record of read.result){
        if(record.type==='frame'&&record.meta.kind==='question'){record.props.w=1032;store.keyPath?store.put(record):store.put(record,record.id);}
        if(record.type==='text'&&record.meta.kind==='annotate'){record.props.w=360;store.keyPath?store.put(record):store.put(record,record.id);}
      }};
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };request.onerror=()=>reject(request.error);
  }));
  await page.goto('/');
  await expect.poll(async()=>(await records(page)).find(r=>r.type==='text'&&r.meta?.kind==='annotate')?.props.w).toBe(460);
  await expect(page.locator('.tl-frame__body')).toHaveCSS('stroke','rgba(0, 0, 0, 0)');
});
