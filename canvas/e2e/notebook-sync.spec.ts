import {test,expect} from '@playwright/test';

test('backs up finished turns and restores on another browser before starting tutor',async({browser})=>{
 let saved:any=null;let connections=0;let writes=0;let send:(event:unknown)=>void=()=>{};
 const setup=async()=>{
  const context=await browser.newContext();const page=await context.newPage();
  await page.addInitScript(()=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'student',studentId:'child',token:'test',name:'Child'})));
  await page.route('**/me',r=>r.fulfill({json:{type:'student',studentId:'child',name:'Child'}}));
  await page.route('**/sessions/lesson',r=>r.request().isNavigationRequest()?r.continue():r.fulfill({json:{sessionId:'lesson',studentId:'child',notebookId:'lesson',resumed:!!saved,wsUrl:'ws://localhost:32004/notebook-test'}}));
  await page.route('**/notebooks/lesson',async r=>{
   if(r.request().method()==='PUT'){const body=r.request().postDataJSON();expect(body.revision).toBe(saved?.revision??0);saved={snapshot:body.snapshot,revision:body.revision+1,updatedAt:new Date().toISOString()};writes++;await r.fulfill({json:{revision:saved.revision}});}
   else await r.fulfill({json:saved});
  });
  await page.routeWebSocket('**/notebook-test',ws=>{connections++;send=event=>ws.send(JSON.stringify(event));ws.send(JSON.stringify({type:'session',sessionId:'lesson',notebookId:'lesson',conceptId:'concept',title:'My lesson'}));if(!saved){ws.send(JSON.stringify({type:'event',event:{type:'tutor-started'}}));ws.send(JSON.stringify({type:'text_chunk',content:'x = 2',attrs:{}}));ws.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));}});
  return {context,page};
 };
 const first=await setup();await first.page.goto('/sessions/lesson');
 await expect(first.page.locator('.tl-shape[data-shape-type="text"]')).toContainText('x = 2');
 await expect.poll(()=>writes).toBe(1);
 send({type:'session',sessionId:'prerequisite',notebookId:'lesson',conceptId:'prereq',title:'Prerequisite'});
 send({type:'event',event:{type:'tutor-started'}});
 send({type:'text_chunk',content:'y = 3',attrs:{}});
 send({type:'event',event:{type:'tutor-ended'}});
 await expect.poll(()=>writes).toBe(2);
 const pages=Object.values(saved.snapshot.store).filter((r:any)=>r.typeName==='page') as any[];
 expect(pages).toHaveLength(1);expect(pages[0].meta.sessionIds).toEqual(['lesson','prerequisite']);
 const second=await setup();await second.page.goto('/sessions/lesson');
 await expect(second.page.getByRole('button',{name:'Let’s start'})).toBeVisible();
 await expect(second.page.getByRole('button',{name:'Move canvas (H)',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(second.page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'x = 2'})).toHaveCount(1);
 await expect(second.page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'y = 3'})).toHaveCount(1);
 expect(connections).toBe(1);
 await second.page.getByRole('button',{name:'Let’s start'}).click();await expect.poll(()=>connections).toBe(2);
 send({type:'event',event:{type:'tutor-ended'}});
 await expect(second.page.getByRole('button',{name:'Pencil (D)',exact:true})).toHaveAttribute('aria-pressed','true');
 send({type:'question',content:'check',attrs:{stem:'Pick one','choice-a':'One','choice-b':'Two'}});
 send({type:'event',event:{type:'tutor-ended'}});
 await expect(second.page.getByRole('button',{name:'Select (V)',exact:true})).toHaveAttribute('aria-pressed','true');
 await first.context.close();await second.context.close();
});
