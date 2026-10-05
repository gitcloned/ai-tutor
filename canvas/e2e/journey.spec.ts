import {test,expect,type Page} from '@playwright/test';
async function studentLogin(page:Page,code='K7M9R2'){
  await page.getByLabel('Student access code',{exact:true}).fill(code);
  await page.getByRole('button',{name:'Let’s get started'}).click();
}
async function adultLogin(page:Page,role:'parent'|'teacher'){
  await page.getByRole('button',{name:'Parent or teacher',exact:true}).click();
  await page.getByRole('button',{name:'Try adult setup'}).click();
  await page.getByRole('button',{name:new RegExp(`I’m a ${role}`)}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
}
test('student signs in, joins a class once, browses topics, and switches out',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/home?preview=1');
  await expect(page.getByLabel('Student access code',{exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/journey-login.png',fullPage:true});
  await studentLogin(page,'ZZZZZZ');await expect(page.getByRole('alert')).toContainText("That code didn't work");
  await studentLogin(page);await expect(page.getByRole('heading',{name:'Hi, Aarav.'})).toBeVisible();
  await page.getByRole('button',{name:'Join a class',exact:true}).click();
  await page.getByLabel('Class code',{exact:true}).fill('B3MN8P');await page.getByRole('button',{name:'Join class',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Topics from'})).toHaveCount(0);
  await page.getByRole('button',{name:'Join a class',exact:true}).click();await page.getByLabel('Class code',{exact:true}).fill('B3MN8P');await page.getByRole('button',{name:'Join class',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('already in');
  await expect(page.getByRole('combobox',{name:'Topics from'})).toHaveCount(0);
  await page.screenshot({path:'artifacts/journey-student.png',fullPage:true});
  await expect(page.getByRole('tab',{name:'Mathematics'})).toBeVisible();
  await page.getByRole('button',{name:'Let’s start'}).first().click();await expect(page.getByRole('status')).toContainText('This is a preview');
  await page.getByRole('button',{name:'Switch student'}).click();await expect(page.getByLabel('Student access code',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('teacher creates a class, adds and enrolls a student, then the student can sign in',async({page})=>{
  await page.goto('/home?preview=1');await adultLogin(page,'teacher');
  await page.getByRole('button',{name:'Create a class',exact:true}).click();await page.getByLabel('Class name').fill('Saturday Maths');await page.getByRole('button',{name:'Create class',exact:true}).click();
  await expect(page.locator('.j-access-slip strong')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/);await page.getByRole('button',{name:'I’ve saved it'}).click();
  await page.getByRole('button',{name:/Saturday Maths/}).click();await page.getByRole('button',{name:'Add student',exact:true}).first().click();
  await page.getByLabel('Student’s name').fill('Anaya');await page.getByRole('button',{name:'Create student profile'}).click();
  const code=(await page.locator('.j-access-slip strong').innerText()).trim();await page.getByRole('button',{name:'I’ve saved it'}).click();
  await expect(page.locator('.j-student-row')).toContainText('Anaya');
  await page.screenshot({path:'artifacts/journey-teacher.png',fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await studentLogin(page,code);
  await expect(page.getByRole('heading',{name:'Hi, Anaya.'})).toBeVisible();await expect(page.getByRole('combobox',{name:'Topics from'})).toHaveCount(0);
});
test('parent creates a child, resets their code, and can return to their dashboard',async({page})=>{
  await page.goto('/home?preview=1');await adultLogin(page,'parent');
  await page.getByRole('button',{name:'Add a child',exact:true}).click();await page.getByLabel('What should we call your child?').fill('Ira');await page.getByRole('button',{name:'Choose topics',exact:true}).click();await page.getByRole('button',{name:'Create child profile'}).click();
  const oldCode=await page.locator('.j-access-slip strong').innerText();await page.getByRole('button',{name:'I’ve saved it'}).click();
  const child=page.locator('.j-child-card').filter({hasText:'Ira'});
  await expect(child.getByRole('button',{name:'Reset access code'})).toHaveCount(0);await child.getByRole('button',{name:'View access code'}).click();await page.getByRole('dialog').getByRole('button',{name:'Reset access code'}).click();await page.getByRole('button',{name:'Create new code'}).click();
  const newCode=await page.locator('.j-access-slip strong').innerText();expect(newCode).not.toBe(oldCode);await page.getByRole('button',{name:'I’ve saved it'}).click();
  await child.getByRole('button',{name:'Open learning space'}).click();await expect(page.getByRole('heading',{name:'Hi, Ira.'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Hi, Ira.'})).toBeVisible();
  await page.getByRole('button',{name:'Back to your dashboard'}).click();await expect(page.getByRole('button',{name:'Add a child',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await studentLogin(page,oldCode);await expect(page.getByRole('alert')).toBeVisible();await studentLogin(page,newCode);await expect(page.getByRole('heading',{name:'Hi, Ira.'})).toBeVisible();
});
test('small touch screen supports class invitations and has no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/home?preview=1&join=B3MN8P');await studentLogin(page);
  await expect(page.getByLabel('Class code',{exact:true})).toHaveValue('B3MN8P');await page.getByRole('button',{name:'Join class',exact:true}).click();
  await page.screenshot({path:'artifacts/journey-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('live mode shows service errors rather than demo accounts',async({page})=>{
  await page.route('**/auth/student',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Service is starting. Try again shortly.'})}));
  await page.goto('/home');await studentLogin(page);await expect(page.getByRole('alert')).toContainText('Service is starting');await expect(page.getByLabel('Student access code',{exact:true})).toHaveValue('K7M9R2');
});
test('session creation opens the returned WebSocket and canvas back returns home',async({page})=>{
  await page.route('**/notebooks/session-test',route=>route.fulfill({body:'null',contentType:'application/json'}));
  const calls:any[]=[];
  await page.route('**/auth/student',route=>route.fulfill({json:{studentId:'s-test',name:'Test child',grade:'Grade 7',token:'test-token'}}));
  await page.route('**/classrooms?*',route=>route.fulfill({json:[]}));
  await page.route('**/students/s-test/home',route=>route.fulfill({json:{subjects:[{subjectId:'math',title:'Mathematics',topics:[{topicId:'equations',title:'Algebra',status:'in_progress'}]}],continueWith:{status:'continue',topicId:'equations',conceptId:'algebra',conceptTitle:'Solving equations',state:'learning',resumeSessionId:'session-test'}}}));
  await page.route('**/topics/equations/next',route=>route.fulfill({json:{status:'continue',topicId:'equations',conceptId:'algebra',conceptTitle:'Solving equations',state:'learning',resumeSessionId:'session-test'}}));
  await page.route('**/sessions',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:{sessionId:'session-test',resumed:false,concept:{id:'algebra',title:'Algebra'},wsUrl:'ws://localhost:32004/journey-test?sessionId=session-test'}});});
  await page.route('**/me',route=>route.fulfill({json:{type:'student',studentId:'s-test',name:'Test child',grade:'Grade 7'}}));
  await page.route(/http:\/\/(localhost|127\.0\.0\.1):32004\/sessions\/session-test$/,route=>route.fulfill({json:{studentId:'s-test',sessionId:'session-test',wsUrl:'ws://localhost:32004/journey-test?sessionId=session-test'}}));
  let connected=false;let failTurn=()=>{};const replies:any[]=[];
  await page.routeWebSocket('**/journey-test?sessionId=session-test',ws=>{connected=true;ws.onMessage(data=>replies.push(JSON.parse(String(data))));failTurn=()=>{ws.send(JSON.stringify({type:'event',event:{type:'tutor-started'}}));ws.send(JSON.stringify({type:'error',message:'Your tutor could not finish responding. Try again.'}));};ws.send(JSON.stringify({type:'session',sessionId:'session-test',title:'Algebra',conceptId:'algebra'}));});
  await page.goto('/home');await studentLogin(page);await page.locator('.j-continue').getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page).toHaveURL(/\/sessions\/session-test/);await expect.poll(()=>connected).toBe(true);
  failTurn();await expect(page.getByRole('button',{name:'Lesson warnings (1)'})).toBeVisible();await expect(page.locator('dialog.lesson-issue')).not.toBeVisible();await page.getByRole('button',{name:'Lesson warnings (1)'}).click();await expect(page.getByRole('button',{name:'Try tutor again'})).toBeVisible();await page.getByRole('button',{name:'Try tutor again'}).click();await expect.poll(()=>replies.filter(r=>r.type==='message').length).toBe(1);expect(replies.find(r=>r.type==='message').text).toContain('last response was interrupted');
  expect(calls).toEqual([{studentId:'s-test',conceptId:'algebra',topicId:'equations',resumeSessionId:'session-test'}]);
  await page.getByRole('button',{name:'Go back',exact:true}).click();await expect(page.getByRole('heading',{name:'Hi, Test.'})).toBeVisible();await expect(page.locator('.j-continue').getByRole('button',{name:'Continue',exact:true})).toBeVisible();
});

test('desktop journey fits the viewport and keeps the lesson list scrollable',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await page.goto('/home?preview=1');
  await expect(page.getByLabel('Student access code',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  await studentLogin(page);await expect(page.locator('.j-topic-row').first()).toBeVisible();
  const action=await page.locator('.j-topic-row').first().getByRole('button').boundingBox();
  expect(action!.y+action!.height).toBeLessThan(720);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  await page.screenshot({path:'artifacts/journey-compact.png',fullPage:true});
});

test('anonymous routes redirect to login; profiles and bulk entry have distinct routes',async({page})=>{
  await page.goto('/');await expect(page).toHaveURL(/\/login/);
  await page.goto('/sessions/someone-elses-session');await expect(page).toHaveURL(/\/login/);
  await page.goto('/login?preview=1');await page.getByRole('button',{name:'Parent or teacher',exact:true}).click();await page.getByRole('button',{name:'Try adult setup'}).click();
  await page.getByRole('button',{name:/I’m a teacher/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page).toHaveURL(/\/home/);
  await page.getByRole('button',{name:/Grade 7 Maths/}).click();await expect(page).toHaveURL(/\/classes\/preview-class/);
  await page.getByRole('button',{name:'Add student',exact:true}).first().click();
  const grade=await page.getByRole('combobox',{name:'Grade',exact:true}).boundingBox(),age=await page.getByLabel('Age (optional)').boundingBox();expect(Math.abs(grade!.y-age!.y)).toBeLessThan(2);
  await page.getByLabel('Student names',{exact:true}).fill('Leela Shah\nKabir Rao');await page.getByRole('button',{name:'Add students',exact:true}).click();
  await expect(page.locator('.j-bulk tbody tr')).toHaveCount(2);await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.locator('.j-student-row')).toHaveCount(3);
  await page.locator('.j-student-row').first().getByRole('button',{name:'View code',exact:true}).click();await expect(page.locator('.j-access-slip strong')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/);
});

test('six code boxes support typing, correction and a pasted code',async({page})=>{
  await page.goto('/login?preview=1');
  const input=page.getByLabel('Student access code',{exact:true});await input.click();await input.pressSequentially('k7m9r2');
  await expect(input).toHaveValue('K7M9R2');await expect(page.locator('.j-code-boxes>span')).toHaveText(['K','7','M','9','R','2']);
  await input.press('Backspace');await expect(input).toHaveValue('K7M9R');await input.pressSequentially('2');
  await input.evaluate(el=>{const data=new DataTransfer();data.setData('text',' b3m n8p ');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(input).toHaveValue('B3MN8P');
  await page.screenshot({path:'artifacts/journey-code-boxes.png',fullPage:true});
});

test('topic statuses come from LP and stale completion never creates a session',async({page})=>{
  let starts=0;
  await page.route('**/auth/student',r=>r.fulfill({json:{studentId:'s-topics',name:'Ira',grade:'Grade 7',token:'test'}}));
  await page.route('**/classrooms?*',r=>r.fulfill({json:[]}));
  await page.route('**/students/s-topics/home',r=>r.fulfill({json:{subjects:[{subjectId:'math',title:'Mathematics',topics:[{topicId:'new',title:'Equations',strandTitle:'Algebra',unitTitle:'x2f8bb11595b61c86:linear-equations-graphs',status:'not_started'},{topicId:'done',title:'Numbers',status:'completed'},{topicId:'missing',title:'Graphs',status:'unavailable',reason:'Still being prepared'}]},{subjectId:'science',title:'Science',topics:[]}],continueWith:null}}));
  await page.route('**/topics/new/next',r=>r.fulfill({json:{status:'completed'}}));
  await page.route('**/sessions',r=>{starts++;return r.fulfill({status:500,json:{error:'Should not start'}});});
  await page.goto('/login');await studentLogin(page);
  await expect(page.locator('.j-continue').getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
  await expect(page.getByText('x2f8bb11595b61c86:linear-equations-graphs',{exact:false})).toHaveCount(0);
  await expect(page.locator('.j-topic-row').filter({hasText:'Numbers'})).toContainText('Complete');
  await expect(page.locator('.j-topic-row').filter({hasText:'Graphs'}).getByRole('button')).toBeDisabled();
  await page.locator('.j-topic-row').filter({hasText:'Equations'}).getByRole('button').click();
  await expect(page.getByRole('status')).toContainText('completed this topic');expect(starts).toBe(0);
  await page.getByRole('tab',{name:'Science'}).click();await expect(page.getByText('No topics assigned for this subject yet.')).toBeVisible();
});

test('parent selection creates a personal learning space; teacher edits preserve selected topics',async({page})=>{
  await page.goto('/login?preview=1');await adultLogin(page,'parent');
  await page.getByRole('button',{name:'Add a child',exact:true}).click();await page.getByLabel('What should we call your child?').fill('Mira');await expect(page.getByRole('tab',{name:'Mathematics'})).toHaveCount(0);await page.getByRole('button',{name:'Choose topics',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:/Two-variable linear equations/})).toBeChecked();
  await page.getByRole('checkbox',{name:/Graphing solutions/}).uncheck();await page.getByRole('tab',{name:'Science',exact:true}).click();await page.getByRole('checkbox',{name:'Show topics from all grades'}).check();await page.getByRole('checkbox',{name:'How plants grow'}).check();
  await page.getByRole('button',{name:'Create child profile'}).click();await page.getByRole('button',{name:'I’ve saved it'}).click();
  await page.locator('.j-child-card').filter({hasText:'Mira'}).getByRole('button',{name:'Open learning space'}).click();
  await expect(page.getByRole('tab',{name:'Science'})).toBeVisible();await page.getByRole('tab',{name:'Science'}).click();await expect(page.getByRole('heading',{name:'How plants grow'})).toBeVisible();
  await page.getByRole('button',{name:'Back to your dashboard'}).click();await page.getByRole('button',{name:'Change roles'}).click();await page.getByRole('button',{name:/I’m a teacher/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('button',{name:/Mira’s learning/})).toHaveCount(0);
  await page.getByRole('button',{name:/Grade 7 Maths/}).click();await page.getByRole('button',{name:'Choose topics'}).click();
  await expect(page.getByRole('checkbox',{name:/Graphing solutions/})).toBeChecked();await page.getByRole('checkbox',{name:/Graphing solutions/}).uncheck();await page.getByRole('button',{name:'Save topics'}).click();await expect(page.getByRole('status')).toContainText('Topics saved');
  await page.getByRole('button',{name:'Close dialog'}).click();await page.getByRole('button',{name:'Choose topics'}).click();await expect(page.getByRole('checkbox',{name:/Graphing solutions/})).not.toBeChecked();
});

test('LP IDs are enriched with CMS labels during backend rollout',async({page})=>{
  await page.route('**/auth/student',r=>r.fulfill({json:{studentId:'s-labels',name:'Ira',grade:'Grade 7',token:'test'}}));
  await page.route('**/classrooms?*',r=>r.fulfill({json:[]}));
  await page.route('**/students/s-labels/home',r=>r.fulfill({json:{subjects:[{subjectId:'math',topics:[{topicId:'equations',status:'not_started'}]}],continueWith:null}}));
  await page.route('**/curriculum',r=>r.fulfill({json:[{subjectId:'math',title:'Mathematics',strands:[{id:'algebra',title:'Algebra',units:[{id:'lines',title:'Straight lines',topics:[{id:'equations',title:'Linear equations'}]}]}]}]}));
  await page.goto('/login');await studentLogin(page);await expect(page.getByRole('tab',{name:'Mathematics'})).toBeVisible();await expect(page.getByRole('heading',{name:'Linear equations'})).toBeVisible();await expect(page.getByText('Algebra · Straight lines')).toBeVisible();
});

test('topic picker search and bulk selection preserve choices outside the filter',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await page.goto('/login?preview=1');await adultLogin(page,'parent');
  await page.getByRole('button',{name:'Add a child',exact:true}).click();
  const header=await page.getByRole('heading',{name:'Add your child'}).boundingBox();
  const grade=await page.getByRole('combobox',{name:'Grade',exact:true}).boundingBox();expect(grade!.y-header!.y).toBeLessThan(160);
  await page.getByLabel('What should we call your child?').fill('Mira');await page.getByRole('button',{name:'Choose topics',exact:true}).click();
  await page.getByLabel('Search topics').fill('Graphing solutions');await expect(page.locator('.j-topic-choice')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear shown'}).click();await expect(page.locator('.j-picker-summary')).toContainText('1 topics selected');
  await page.getByLabel('Search topics').fill('');await expect(page.getByRole('checkbox',{name:/Two-variable linear equations/})).toBeChecked();
  await page.getByRole('button',{name:'Select shown'}).click();await expect(page.locator('.j-picker-summary')).toContainText('2 topics selected');
  await page.getByRole('tab',{name:'Science',exact:true}).click();await page.getByRole('checkbox',{name:'Show topics from all grades'}).check();await page.getByRole('button',{name:'Select shown'}).click();await expect(page.locator('.j-picker-summary')).toContainText('3 topics selected');
  await page.getByRole('tab',{name:'Mathematics',exact:true}).click();
  await page.screenshot({path:'artifacts/topic-picker-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:'artifacts/topic-picker-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Create child profile'})).toBeVisible();
  const create=await page.getByRole('button',{name:'Create child profile'}).boundingBox();expect(create!.y+create!.height).toBeLessThan(844);
});
