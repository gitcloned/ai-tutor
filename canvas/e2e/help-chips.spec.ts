import {test,expect,type WebSocketRoute} from '@playwright/test';
test('idle chips replay narration locally and send help as a normal reply',async({page})=>{
  test.setTimeout(45000);
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/help-test',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/help-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'text_chunk',content:'x + 2 = 5',attrs:{}});
  send({type:'audio_chunk',content:Buffer.from('What is x?').toString('base64'),attrs:{mimeType:'text/plain'}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(page.locator('.orb')).toHaveAttribute('data-state','speaking');
  await expect(page.getByRole('complementary',{name:'Quick help'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Hear it again',exact:true})).toBeVisible({timeout:13000});
  await expect(page.getByRole('button',{name:'I understand',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Hear it again',exact:true}).click();
  await expect(page.locator('.orb')).toHaveAttribute('data-state','speaking');
  expect(messages).toHaveLength(0);
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
  await expect(page.locator('.orb')).toHaveAttribute('data-state','ready');
  await expect(page.getByRole('button',{name:'Hear it again',exact:true})).toBeVisible({timeout:11000});
  expect(messages).toHaveLength(0);
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'question',content:'Q1',attrs:{stem:'Choose x','choice-a':'3','choice-b':'5',answer:'a'}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(page.getByRole('button',{name:'I’m not sure',exact:true})).toBeVisible({timeout:12000});
  await expect(page.getByRole('button',{name:'I understand',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Hear it again',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'I’m not sure',exact:true}).click();
  await expect.poll(()=>messages).toEqual([{type:'message',text:'I’m not sure'}]);
  await expect(page.getByRole('complementary',{name:'Quick help'})).toHaveCount(0);
});

test('student interaction resets the idle timer and holding the pencil suppresses chips',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/help-idle',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/help-idle');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await page.clock.install();
  socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
  await expect(page.locator('.orb')).toHaveAttribute('data-state','ready');
  await page.clock.runFor(7900);
  const chips=page.getByRole('complementary',{name:'Quick help'});
  await expect(chips).toHaveCount(0);
  await page.mouse.move(500,350);await page.mouse.down();
  await page.clock.runFor(10000);
  await expect(chips).toHaveCount(0);
  await page.mouse.up();await page.clock.runFor(7900);
  await expect(chips).toHaveCount(0);
  await page.clock.runFor(200);
  await expect(chips).toBeVisible();
  await page.screenshot({path:'test-results/help-chips.png'});
});


test('hovering over the graph does not postpone idle help',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/help-hover',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/help-hover');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  socket!.send(JSON.stringify({type:'model',content:'function-graph',attrs:{equation:'y = x',action:'plot'}}));
  await expect(page.locator('.function-graph')).toHaveAttribute('data-ready','true');
  await page.clock.install();
  socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
  await expect(page.locator('.orb')).toHaveAttribute('data-state','ready');
  const graph=page.locator('.graph-interaction');
  const bounds=(await graph.boundingBox())!;
  for(let i=0;i<9;i++){
    await page.mouse.move(bounds.x+bounds.width*(.2+i*.05),bounds.y+bounds.height*.5);
    await page.clock.runFor(1000);
  }
  await expect(page.getByRole('complementary',{name:'Quick help'})).toBeVisible();
});

test('help rearms after each submitted response and after reconnecting',async({page})=>{
  test.setTimeout(45000);
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/help-turns',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/help-turns');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await page.clock.install();
  const chips=page.getByRole('complementary',{name:'Quick help'});
  for(let turn=0;turn<3;turn++){
    socket!.send(JSON.stringify({type:'event',event:{type:'tutor-started'}}));
    socket!.send(JSON.stringify({type:'text_chunk',content:`Step ${turn}`,attrs:{}}));
    socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
    await expect(page.locator('.orb')).toHaveAttribute('data-state','ready');
    await page.clock.runFor(8100);
    await expect(chips).toBeVisible();
    await page.getByRole('button',{name:'I’m not sure',exact:true}).click();
    await expect.poll(()=>messages.length).toBe(turn+1);
    await page.clock.runFor(1000);
    await expect(chips).toHaveCount(0);
    if(turn===0){
      await page.locator('.connection').click();await page.getByRole('button',{name:'Reconnect',exact:true}).click();
      await expect(page.locator('.connection')).toContainText('Connected');
    }
  }
});
