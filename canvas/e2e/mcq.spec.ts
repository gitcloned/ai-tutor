import {test,expect,type WebSocketRoute} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['microphone']});

test('MCQ permits speech without a choice and sends ungraded selections without correctness',async({page})=>{
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/mcq-voice',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/mcq-voice');await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'question',content:'Q2',attrs:{stem:'Which method would you try?','choice-a':'Draw a picture','choice-b':'Make a table'}});
  send({type:'event',event:{type:'tutor-ended'}});
  const orb=page.getByRole('button',{name:'Send new work; hold to speak',exact:true});await expect(orb).toBeEnabled();
  const b=(await orb.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await expect(page.locator('.orb-label')).toHaveText('Listening…');await page.waitForTimeout(300);await page.mouse.up();
  await expect.poll(()=>messages.length).toBe(1);expect(messages[0].audio.data.length).toBeGreaterThan(0);expect(messages[0].activity).toBeUndefined();
  send({type:'event',event:{type:'tutor-ended'}});await expect(orb).toBeEnabled();
  await expect(page.getByRole('button',{name:'Select (V)',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'A Draw a picture',exact:true}).click();
  await expect.poll(()=>messages.length).toBe(2);expect(messages[1].activity).toEqual({type:'choice-selected',questionId:'Q2',choice:'a',text:'Draw a picture'});
  send({type:'question',content:'end',attrs:{}});send({type:'event',event:{type:'tutor-ended'}});
  await expect(page.getByRole('button',{name:'B Make a table',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Pencil (D)',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('MCQ allows ink, sends a tapped choice with pending work, and retries after feedback',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/mcq-test',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/mcq-test');await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'question',content:'Q1',attrs:{stem:'Find y when x = 0 in y = 2x - 3.','choice-a':'-3','choice-b':'3',answer:'a'}});
  const options=page.locator('[data-mcq="Q1"]'),a=options.getByRole('button',{name:'A -3',exact:true}),b=options.getByRole('button',{name:'B 3',exact:true});
  await expect(a).toBeVisible();await expect(a).toBeDisabled();
  const stem=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'Find y when'});
  await expect.poll(async()=>{const s=(await stem.boundingBox())!,o=(await options.boundingBox())!;return o.y-(s.y+s.height);}).toBeGreaterThan(12);
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(a).toBeEnabled(); // MCQ switches to Select automatically.
  await page.getByRole('button',{name:'Pencil (D)',exact:true}).click();
  await expect(a).toBeDisabled();
  const box=(await a.boundingBox())!;
  await page.mouse.move(box.x+90,box.y+20);await page.mouse.down();await page.mouse.move(box.x+170,box.y+32,{steps:8});await page.mouse.up();
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  expect(messages).toHaveLength(0);
  await page.getByRole('button',{name:'Select (V)',exact:true}).click();
  await expect(b).toBeEnabled();await b.click();
  await expect.poll(()=>messages.length,{timeout:15000}).toBe(1);
  expect(messages[0].activity).toEqual({type:'choice-selected',questionId:'Q1',choice:'b',text:'3',correct:false});
  expect(messages[0].images).toHaveLength(1);
  await expect(options).toHaveAttribute('data-selected','b');await expect(a).toBeDisabled();
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'text_chunk',content:'Subtract 3 from zero. Try again.',attrs:{}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(a).toBeEnabled();await a.click();
  await expect.poll(()=>messages.length).toBe(2);
  expect(messages[1].activity.correct).toBe(true);expect(messages[1].images).toBeUndefined();
  await expect(options).toHaveAttribute('data-selected','a');await expect(options).toContainText('Correct');
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  await page.screenshot({path:'test-results/mcq.png'});
  await expect.poll(async()=>page.evaluate(()=>new Promise<string[]>(resolve=>{
    const r=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result.filter((s:any)=>s.type==='mcq').map((s:any)=>s.props.selected));db.close();};};
  }))).toEqual(['a']);
  await page.reload();await expect(page.locator('[data-mcq="Q1"]')).toHaveAttribute('data-selected','a');
});


test('reused worked-question ID can introduce a new MCQ before parallel writing',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/mcq-reused',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/mcq-reused');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'question',content:'Q01',attrs:{}});
  send({type:'text_chunk',content:'An earlier worked example',attrs:{}});
  await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'An earlier worked example'})).toBeVisible();
  send({type:'question',content:'Q01',attrs:{stem:'Which of these is not an algebraic expression?','choice-a':'2 + 3','choice-b':'x + y - 2','choice-c':'x + 2*x + 3','choice-d':'4 + y',answer:'a'}});
  send({type:'action',action:{type:'parallel-start'}});
  send({type:'text_chunk',content:'Pick the option that is not an algebraic expression.',attrs:{}});
  send({type:'action',action:{type:'parallel-end'}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(page.locator('[data-mcq="Q01"] .mcq-option')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'A 2 + 3',exact:true})).toBeEnabled();
});
