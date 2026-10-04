import {test,expect,type WebSocketRoute} from '@playwright/test';
test('refreshes the session ticket after server restart without clearing the canvas',async({page})=>{
 let ticket='before';let socket:WebSocketRoute;let connections=0;let lookups=0;let saved:any=null;
 await page.addInitScript(()=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'student',studentId:'child',token:'test',name:'Child'})));
 await page.route('**/me',r=>r.fulfill({json:{type:'student',studentId:'child',name:'Child'}}));
 await page.route('**/sessions/reconnect-lesson',r=>{if(r.request().isNavigationRequest())return r.continue();lookups++;return r.fulfill({json:{sessionId:'reconnect-lesson',studentId:'child',notebookId:'reconnect-lesson',wsUrl:'ws://localhost:32004/reconnect-test?ticket='+ticket}});});
 await page.route('**/notebooks/reconnect-lesson',r=>{if(r.request().method()==='PUT'){const body=r.request().postDataJSON();saved={snapshot:body.snapshot,revision:body.revision+1};return r.fulfill({json:{revision:saved.revision}});}return r.fulfill({body:JSON.stringify(saved),contentType:'application/json'});});
 await page.routeWebSocket('**/reconnect-test?*',ws=>{
  if(!ws.url().endsWith('ticket='+ticket)){ws.close({code:1008,reason:'Expired ticket'});return;}
  socket=ws;connections++;ws.send(JSON.stringify({type:'session',sessionId:'reconnect-lesson',notebookId:'reconnect-lesson',title:'Algebra',conceptId:'algebra'}));
  if(connections===1){ws.send(JSON.stringify({type:'text_chunk',content:'x = 2',attrs:{}}));ws.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));}
 });
 await page.goto('/sessions/reconnect-lesson');
 await expect(page.locator('.tl-shape[data-shape-type="text"]')).toContainText('x = 2');
 const beforeLookups=lookups;ticket='after';socket!.close({code:1001,reason:'Server restarting'});
 await page.getByRole('button',{name:'Reconnect to tutor',exact:true}).click();
 await expect.poll(()=>connections).toBe(2);expect(lookups).toBeGreaterThan(beforeLookups);
 await expect(page.locator('dialog.lesson-issue')).not.toBeVisible();
 await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
 await expect(page.locator('.tl-shape[data-shape-type="text"]')).toContainText('x = 2');
});
