import {test,expect,type WebSocketRoute} from '@playwright/test';
test.use({reducedMotion:'reduce'});
test('flows practice questions below feedback, preserves retry numbering, awards backend points and restores the timer',async({page})=>{
 let socket:WebSocketRoute;
 await page.addInitScript(()=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'student',studentId:'child',token:'test',name:'Child'})));
 await page.route('**/me',r=>r.fulfill({json:{type:'student',studentId:'child',name:'Child'}}));
 await page.routeWebSocket('**/practice-ui',ws=>{socket=ws;});
 await page.goto('/test-session');await page.getByLabel('Tutor address').fill('ws://localhost:32004/practice-ui');await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
 await expect(page.locator('.connection')).toContainText('Connected');
 const send=(e:unknown)=>socket!.send(JSON.stringify(e));
 const data={type:'step-changed',sessionId:'practice-session',step:{id:'1',type:'practice'},practice:{index:1,total:2,earnedPoints:0,question:{id:'a',stem:'Find two pairs for y = 2x + 1.',points:3,timeSeconds:12},results:[] as any[]}};
 const announce=()=>send({type:'event',event:data});const end=()=>send({type:'event',event:{type:'tutor-ended'}});
 send({type:'event',event:{type:'tutor-started'}});announce();
 const card=page.getByRole('region',{name:'Practice question 1',includeHidden:true});
 await expect(card).toBeVisible();
 await expect(page.getByLabel('Practice points earned')).toContainText('0');
 await expect(card).not.toContainText('points earned');
 await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(0);

 await expect(page.getByRole('timer')).toHaveAttribute('title','Starts after your tutor finishes.');
 send({type:'question',content:'work',attrs:{}});send({type:'text_chunk',content:'Your working:\nx = ___\ny = ___',attrs:{}});end();
 await expect(page.getByRole('timer')).toHaveAttribute('title','Time remaining');
 const work=page.locator('.tl-shape[data-shape-type="text"]').filter({hasText:'Your working:'});
 await expect(work).toBeInViewport();await expect(card).toBeInViewport({ratio:.999});
 expect((await work.boundingBox())!.y).toBeGreaterThan((await card.boundingBox())!.y+(await card.boundingBox())!.height);
 await expect(page.locator('.practice-countdown')).toHaveClass(/urgent/,{timeout:5000});
 announce();end();await expect(page.locator('.practice-card')).toHaveCount(1);await expect(page.getByRole('timer')).not.toContainText('0:12');
 await page.waitForTimeout(1000);await page.reload();
 await expect(card).toBeVisible();await expect(page.getByRole('timer')).not.toContainText('Starts after');
 await page.getByLabel('Tutor address').fill('ws://localhost:32004/practice-ui');await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
 await expect(page.locator('.connection')).toContainText('Connected');
 await expect(page.getByRole('timer')).toContainText('Time’s up',{timeout:15000});
 data.practice={...data.practice,index:2,earnedPoints:3,question:{id:'b',stem:'Now solve y = x - 2.',points:2,timeSeconds:30},results:[{questionId:'a',outcome:'pass',awardedPoints:3}]};announce();
 await expect(page.getByRole('region',{name:'Practice question 2'})).toHaveCount(0);
 send({type:'text_chunk',content:'Good work on the first question.',attrs:{}});end();
 await expect(page.getByRole('region',{name:'Practice question 2'})).toBeInViewport();await expect(page.getByLabel('Practice points earned')).toContainText('3');await expect(card).toContainText('+3 points awarded');
 await expect(page.locator('.practice-reward')).toContainText('+3 ⭐ Well done!');
 await expect(page.getByLabel('Practice points earned')).toHaveClass(/is-awarded/);
 await expect(page.locator('.practice-reward')).toBeEmpty({timeout:5000});
 announce();end();await expect(page.locator('.practice-card')).toHaveCount(2);
 await expect(page.locator('.practice-reward')).toBeEmpty();
 const question2=page.getByRole('region',{name:'Practice question 2'});
 const questionBounds=(await question2.boundingBox())!;
 const headerBounds=(await page.getByLabel('Practice progress').boundingBox())!;
 expect(Math.abs(questionBounds.x-headerBounds.x)).toBeLessThan(5);
 expect(questionBounds.y).toBeGreaterThan(headerBounds.y+headerBounds.height);
 expect(questionBounds.y-headerBounds.y-headerBounds.height).toBeLessThan(80);
 await page.screenshot({path:'test-results/practice-flow.png'});
 send({type:'model',content:'function-graph',attrs:{equation:'y = x - 2',action:'ask'}});end();
 await expect(page.locator('.function-graph')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.function-graph')).toBeInViewport({ratio:.999});
 await expect(page.getByRole('region',{name:'Practice question 2'})).toBeInViewport({ratio:.999});
 await page.screenshot({path:'test-results/practice-ui.png'});
});

test('resume focuses the pending practice question even when saved focus is elsewhere',async({page})=>{
 let saved:any=null;
 await page.addInitScript(()=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'student',studentId:'child',token:'test',name:'Child'})));
 await page.route('**/me',r=>r.fulfill({json:{type:'student',studentId:'child',name:'Child'}}));
 await page.route('**/sessions/focus-lesson',r=>r.request().isNavigationRequest()?r.continue():r.fulfill({json:{sessionId:'focus-lesson',studentId:'child',notebookId:'focus-lesson',resumed:!!saved,wsUrl:'ws://localhost:32004/practice-focus'}}));
 await page.route('**/notebooks/focus-lesson',r=>{
  if(r.request().method()==='PUT'){const body=r.request().postDataJSON();saved={snapshot:body.snapshot,revision:(saved?.revision??0)+1};return r.fulfill({json:{revision:saved.revision}});}
  return r.fulfill({json:saved});
 });
 await page.routeWebSocket('**/practice-focus',ws=>{
  const send=(e:unknown)=>ws.send(JSON.stringify(e));
  send({type:'session',sessionId:'focus-lesson',notebookId:'focus-lesson',conceptId:'graphing',title:'Practice'});
  send({type:'event',event:{type:'tutor-started'}});
  send({type:'event',event:{type:'step-changed',sessionId:'focus-lesson',step:{id:'1',type:'practice'},practice:{index:1,total:1,earnedPoints:0,question:{id:'q',stem:'Find two pairs for y = 2x + 1.',points:3},results:[]}}});
  if(!saved)send({type:'text_chunk',content:'Older discussion far below',attrs:{position:'200,15000'}});
  send({type:'event',event:{type:'tutor-ended'}});
 });
 await page.goto('/sessions/focus-lesson');
 await expect.poll(()=>!!saved).toBe(true);
 await page.reload();
 await page.getByRole('button',{name:'Let’s start',exact:true}).click();
 await expect(page.getByRole('region',{name:'Practice question 1'})).toBeInViewport({ratio:.99});
});
