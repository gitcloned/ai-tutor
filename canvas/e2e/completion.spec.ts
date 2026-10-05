import {test,expect} from '@playwright/test';

test('completion survives missing narration and reload, and starts practice in the saved notebook',async({page})=>{
 let completed=false,saved:any=null,connections=0;const starts:any[]=[];let send:(event:unknown)=>void=()=>{};
 await page.addInitScript(()=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'student',studentId:'child',token:'test',name:'Child'})));
 await page.route('**/me',r=>r.fulfill({json:{type:'student',studentId:'child',name:'Child'}}));
 await page.route('**/sessions/lesson',r=>r.request().isNavigationRequest()?r.continue():r.fulfill({json:{sessionId:'lesson',studentId:'child',notebookId:'lesson',topicId:'topic',resumed:!!saved,completed,wsUrl:completed?'':'ws://localhost:32004/completion-test'}}));
 await page.route('**/sessions/practice',r=>r.request().isNavigationRequest()?r.continue():r.fulfill({json:{sessionId:'practice',studentId:'child',notebookId:'lesson',topicId:'topic',resumed:false,wsUrl:'ws://localhost:32004/practice-test'}}));
 await page.route('**/topics/topic/next',r=>r.fulfill({json:{status:'continue',topicId:'topic',conceptId:'graphing',state:'clarity',resumeSessionId:null}}));
 await page.route('**/sessions',r=>{starts.push(r.request().postDataJSON());return r.fulfill({json:{sessionId:'practice'}});});
 await page.route('**/notebooks/lesson',r=>{
  if(r.request().method()==='PUT'){const body=r.request().postDataJSON();saved={snapshot:body.snapshot,revision:(saved?.revision??0)+1};return r.fulfill({json:{revision:saved.revision}});}
  return r.fulfill({json:saved});
 });
 await page.routeWebSocket('**/completion-test',ws=>{
  connections++;send=e=>ws.send(JSON.stringify(e));
  send({type:'session',sessionId:'lesson',notebookId:'lesson',conceptId:'graphing',title:'Graphing'});
  send({type:'text_chunk',content:'Your final answer: (2, 4)',attrs:{}});send({type:'event',event:{type:'tutor-ended'}});
 });
 await page.routeWebSocket('**/practice-test',ws=>{
  connections++;ws.send(JSON.stringify({type:'session',sessionId:'practice',notebookId:'lesson',conceptId:'graphing',title:'Graphing practice'}));
  ws.send(JSON.stringify({type:'text_chunk',content:'Practice: find another pair.',attrs:{}}));ws.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
 });
 await page.goto('/sessions/lesson');await expect.poll(()=>!!saved).toBe(true);
 completed=true;
 // Completion is independent of successful speech playback.
 send({type:'event',event:{type:'session-completed'}});send({type:'error',message:'Narration unavailable'});send({type:'event',event:{type:'tutor-ended'}});
 await expect(page.getByText('Lesson complete.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start practice',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'Start practice',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Let’s start',exact:true})).toHaveCount(0);
 expect(connections).toBe(1);
 await page.getByRole('button',{name:'Start practice',exact:true}).click();
 await expect(page).toHaveURL(/\/sessions\/practice$/);
 await expect(page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'Practice: find another pair.'})).toBeVisible();
 expect(starts).toEqual([{studentId:'child',topicId:'topic',conceptId:'graphing',resumeSessionId:null}]);
 expect(JSON.stringify(saved.snapshot)).toContain('Your final answer: (2, 4)');
 expect(connections).toBe(2);
});
