import {test,expect,type WebSocketRoute} from '@playwright/test';

test('a new pinned graph leaves earlier video and writing outside its column',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'Lesson video'}));
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/model-content',ws=>{socket=ws;});
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/model-content');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'play',content:'https://www.youtube.com/watch?v=AOxMJRtoR2A',attrs:{}});
  send({type:'event',event:{type:'tutor-ended'}});
  await page.getByRole('button',{name:"I’m done watching"}).click();
  send({type:'text_chunk',content:'Earlier explanation',attrs:{}});
  const earlier=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'Earlier explanation'});
  await expect(earlier).toBeVisible();
  send({type:'model',content:'function-graph',attrs:{equation:'y = 2*x - 3',action:'plot'}});
  const graph=page.locator('.function-graph');
  await expect(graph).toHaveAttribute('data-ready','true');
  const video=page.locator('.tl-shape[data-shape-type="embed"]');
  for(const content of [earlier,video]){
    await expect.poll(async()=>{
      const m=(await graph.boundingBox())!,c=(await content.boundingBox())!;
      return c.x-(m.x+m.width);
    }).toBeGreaterThan(10);
  }
  send({type:'text_chunk',content:'New calculation',attrs:{}});
  const later=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'New calculation'});
  await expect(later).toBeInViewport();
  await expect(graph).toBeInViewport();
  await expect.poll(async()=>{
    const m=(await graph.boundingBox())!,c=(await later.boundingBox())!;
    return c.x-(m.x+m.width);
  }).toBeGreaterThan(10);
  await page.screenshot({path:'test-results/model-content-layout.png'});
});
