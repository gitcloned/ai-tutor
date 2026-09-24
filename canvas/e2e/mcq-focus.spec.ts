import {test,expect,type WebSocketRoute} from '@playwright/test';
test.use({hasTouch:true,viewport:{width:1024,height:768}});
test('tablet fits complete MCQ away from toolbar and refits after rotation',async({page})=>{
  let socket:WebSocketRoute;
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.routeWebSocket('**/mcq-fit',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/mcq-fit');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  socket!.send(JSON.stringify({type:'question',content:'fit',attrs:{stem:'How many pairs (x, y) altogether are solutions to the equation -3x - y = 6?','choice-a':'one','choice-b':'two','choice-c':'ten','choice-d':'infinite'}}));
  socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
  const stem=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'How many pairs'});
  const options=page.locator('[data-mcq="fit"]');
  await expect(options).toBeVisible();
  async function fits(){
    await expect.poll(async()=>{
      const s=await stem.boundingBox(),o=await options.boundingBox(),t=await page.locator('.toolbar').boundingBox(),footer=await page.locator('.tutor-space').boundingBox();
      return !!s&&!!o&&!!t&&!!footer&&s.y>=20&&o.y+o.height<=footer.y-20&&s.x>=t.x+t.width+20;
    }).toBe(true);
  }
  await fits();await page.setViewportSize({width:768,height:1024});await fits();
});
