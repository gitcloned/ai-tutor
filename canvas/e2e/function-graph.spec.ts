import {test,expect,type WebSocketRoute} from '@playwright/test';
test.use({hasTouch:true,reducedMotion:'reduce'});

test('real replay responds to each point and reveals the completed function',async({page})=>{
  test.skip(!process.env.GRAPH_REPLAY_URL,'Set GRAPH_REPLAY_URL with the function-graph replay running.');
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill(process.env.GRAPH_REPLAY_URL!);
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  const graph=page.locator('.function-graph'),surface=graph.locator('.graph-interaction');
  await expect(graph).toHaveAttribute('data-ready','true');
  const orb=page.getByRole('button',{name:'Send new work; hold to speak',exact:true});
  for(const [x,y] of [[2,1],[3,3],[4,5]]){
    await expect(orb).toBeEnabled({timeout:20000});
    const box=(await surface.boundingBox())!,[left,top,right,bottom]=JSON.parse((await surface.getAttribute('data-bounds'))!);
    await page.mouse.click(box.x+(x-left)/(right-left)*box.width,box.y+(top-y)/(top-bottom)*box.height);
    await expect(graph.locator('[data-result="correct"]')).toHaveCount(x-1);
  }
  await expect(graph).toHaveAttribute('data-mode','plot',{timeout:20000});
  await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'These points lie on'})).toBeInViewport();
  await expect(orb).toBeEnabled();
});

test('graph assesses mouse/touch attempts, sends structured results, reveals and persists points',async({page})=>{
  let socket:WebSocketRoute;const messages:any[]=[],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket('**/function-graph-test',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/function-graph-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(e:unknown)=>socket!.send(JSON.stringify(e));
  const end=()=>send({type:'event',event:{type:'tutor-ended'}});
  const model=(attrs:Record<string,string>)=>{send({type:'model',content:'function-graph',attrs});end();};
  send({type:'event',event:{type:'tutor-started'}});
  model({equation:'y = 2*x - 3',action:'ask',targets:'2,3,4','x-range':'-5,7','y-range':'-5,7'});
  const graph=page.locator('.function-graph'),surface=graph.locator('.graph-interaction');
  await expect(graph).toHaveAttribute('data-ready','true');
  await expect(graph).toHaveAttribute('data-mode','ask');
  const orb=page.getByRole('button',{name:'Send new work; hold to speak',exact:true});
  await expect(orb).toBeEnabled();
  async function place(x:number,y:number,touch=false){
    await expect(orb).toBeEnabled();
    const box=(await surface.boundingBox())!,[left,top,right,bottom]=JSON.parse((await surface.getAttribute('data-bounds'))!);
    const px=box.x+(x-left)/(right-left)*box.width,py=box.y+(top-y)/(top-bottom)*box.height;
    if(touch)await page.touchscreen.tap(px,py);else await page.mouse.click(px,py);
  }
  await place(2,2);await expect.poll(()=>messages.length).toBe(1);
  expect(messages[0]).toMatchObject({type:'message',activity:{type:'graph-point',x:2,y:2,correct:false,complete:false,remaining:[2,3,4]}});
  await expect(graph.getByRole('status')).toContainText('Not quite');
  await expect(orb).toBeDisabled();end();
  await place(2,1,true);await expect.poll(()=>messages.length).toBe(2);
  expect(messages[1].activity).toMatchObject({x:2,y:1,correct:true,remaining:[3,4]});end();
  await place(2,1);expect(messages).toHaveLength(2);
  await place(3,3);await expect.poll(()=>messages.length).toBe(3);end();
  await place(4,5,true);await expect.poll(()=>messages.length).toBe(4);end();
  expect(messages[3].activity).toMatchObject({correct:true,complete:true,remaining:[]});
  await expect(graph).toHaveAttribute('data-complete','true');
  await expect(graph.locator('[data-result="correct"]')).toHaveCount(3);
  model({action:'plot'});
  await expect(graph).toHaveAttribute('data-mode','plot');
  await expect(graph).toHaveAttribute('data-ready','true');
  await expect(graph).toHaveAttribute('data-points','4');
  await expect(orb).toBeEnabled();
  await place(3,0);await expect(graph.locator('.graph-readout')).toHaveText('(3, 3)');
  expect(messages).toHaveLength(4);
  send({type:'text_chunk',content:'These points all lie on the same line.',attrs:{}});end();
  await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'These points'})).toBeInViewport();
  await expect(graph).toBeInViewport();
  await page.screenshot({path:'test-results/function-graph.png'});
  await page.waitForTimeout(1000);await page.reload();
  await expect(page.locator('.function-graph')).toHaveAttribute('data-points','4');
  expect(errors).toEqual([]);
});

test('invalid equations produce a recoverable error and reset/remove commands work',async({page})=>{
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/graph-commands',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/graph-commands');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const model=(attrs:Record<string,string>)=>{socket!.send(JSON.stringify({type:'model',content:'function-graph',attrs}));socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));};
  model({equation:'y = window.alert(1)',action:'plot'});
  await page.getByRole('button',{name:/Lesson warnings \(/}).click();
  await expect(page.getByRole('region',{name:'Lesson warnings'})).toContainText('Unsupported');
  await page.getByRole('button',{name:'Close warnings',exact:true}).click();
  await expect(page.locator('.function-graph')).toHaveCount(0);
  model({equation:'y = x^2',action:'ask',targets:'1,2'});
  await expect(page.locator('.function-graph')).toHaveAttribute('data-ready','true');
  const surface=page.locator('.graph-interaction');await surface.focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  await expect(page.locator('.function-graph')).toHaveAttribute('data-points','1');
  await expect(page.locator('[data-result="correct"]')).toHaveCount(1);
  model({action:'reset'});await expect(page.locator('.function-graph')).toHaveAttribute('data-points','0');
  model({action:'remove'});await expect(page.locator('.function-graph')).toHaveCount(1);
});


test('graph updated while culled restores its plot at full size on return',async({page})=>{
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/graph-culling',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/graph-culling');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(attrs:Record<string,string>)=>socket!.send(JSON.stringify({type:'model',content:'function-graph',attrs}));
  send({equation:'y = 2*x - 3',action:'plot'});
  const graph=page.locator('.function-graph');
  await expect(graph).toHaveAttribute('data-ready','true');
  send({action:'remove'});
  // Reproduce tldraw hiding an offscreen shape while a later update arrives.
  await page.addStyleTag({content:'.tl-shape[data-shape-type="function-graph"]{display:none!important}'});
  send({equation:'y = x + 1',action:'plot'});
  await expect(graph.locator('header strong')).toHaveText('y = x + 1');
  await page.evaluate(()=>{for(const el of document.querySelectorAll('style'))if(el.textContent?.includes('display:none!important'))el.remove();});
  await expect(graph).toHaveAttribute('data-ready','true');
  await expect.poll(()=>page.locator('.graph-board').evaluate(el=>{
    const svg=el.querySelector('svg')!;
    return Math.abs(Number(svg.getAttribute('width'))-el.clientWidth)+Math.abs(Number(svg.getAttribute('height'))-el.clientHeight);
  })).toBeLessThan(2);
  await expect(page.locator('.graph-line')).toBeVisible();
});
