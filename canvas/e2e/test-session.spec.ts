import {test,expect} from '@playwright/test';
test('joins a CLI socket directly even when a managed lesson was previously open',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('prodigy-journey-preview-identity',JSON.stringify({type:'student',studentId:'preview-student',name:'Aarav'}));
  sessionStorage.setItem('prodigy-journey-lesson',JSON.stringify({sessionId:'old-managed',studentId:'preview-student',wsUrl:'ws://localhost:32004/managed'}));
 });
 let connected=false;
 await page.routeWebSocket('**/cli-test',ws=>{connected=true;ws.send(JSON.stringify({type:'session',sessionId:'cli',title:'CLI lesson',conceptId:'test'}));ws.send(JSON.stringify({type:'text_chunk',content:'Hello from CLI',attrs:{}}));ws.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));});
 await page.goto('/home?preview=1');await page.getByRole('link',{name:'Join test session'}).click();
 await expect(page).toHaveURL(/test-session/);
 await page.getByLabel('Tutor address').fill('ws://localhost:32004/cli-test');
 await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
 await expect.poll(()=>connected).toBe(true);
 await expect(page.locator('.tl-shape[data-shape-type="text"]')).toContainText('Hello from CLI');
 await expect(page.locator('.connection')).toContainText('Connected');
});
