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
test('student signs in, joins a class once, searches, and switches out',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/home?preview=1');
  await expect(page.getByLabel('Student access code',{exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/journey-login.png',fullPage:true});
  await studentLogin(page,'ZZZZZZ');await expect(page.getByRole('alert')).toContainText("That code didn't work");
  await studentLogin(page);await expect(page.getByRole('heading',{name:'Hi, Aarav.'})).toBeVisible();
  await page.getByRole('button',{name:'Join a class',exact:true}).click();
  await page.getByLabel('Class code',{exact:true}).fill('B3MN8P');await page.getByRole('button',{name:'Join class',exact:true}).click();
  await expect(page.getByRole('button',{name:/Grade 7 Maths/})).toBeVisible();
  await page.getByRole('button',{name:'Join a class',exact:true}).click();await page.getByLabel('Class code',{exact:true}).fill('B3MN8P');await page.getByRole('button',{name:'Join class',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('already in');
  await expect(page.getByRole('button',{name:/Grade 7 Maths/})).toHaveCount(1);
  await page.screenshot({path:'artifacts/journey-student.png',fullPage:true});
  await page.getByLabel('Find a lesson').fill('expressions');await expect(page.locator('.j-lesson')).toHaveCount(1);
  await page.getByRole('button',{name:'Start Algebraic expressions'}).click();await expect(page.getByRole('status')).toContainText('This is a preview');
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
  await expect(page.getByRole('heading',{name:'Hi, Anaya.'})).toBeVisible();await expect(page.getByRole('button',{name:/Saturday Maths/})).toBeVisible();
});
test('parent creates a child, resets their code, and can return to their dashboard',async({page})=>{
  await page.goto('/home?preview=1');await adultLogin(page,'parent');
  await page.getByRole('button',{name:'Add a child',exact:true}).click();await page.getByLabel('What should we call your child?').fill('Ira');await page.getByRole('button',{name:'Create child profile'}).click();
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
  const calls:any[]=[];
  await page.route('**/auth/student',route=>route.fulfill({json:{studentId:'s-test',name:'Test child',grade:'Grade 7',token:'test-token'}}));
  await page.route('**/classrooms?*',route=>route.fulfill({json:[]}));
  await page.route('**/concepts',route=>route.fulfill({json:[{id:'algebra',title:'Algebra'}]}));
  await page.route('**/sessions',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:{sessionId:'session-test',resumed:false,concept:{id:'algebra',title:'Algebra'},wsUrl:'ws://localhost:32004/journey-test?sessionId=session-test'}});});
  await page.route('**/me',route=>route.fulfill({json:{type:'student',studentId:'s-test',name:'Test child',grade:'Grade 7'}}));
  await page.route(/http:\/\/(localhost|127\.0\.0\.1):32004\/sessions\/session-test$/,route=>route.fulfill({json:{studentId:'s-test',sessionId:'session-test',wsUrl:'ws://localhost:32004/journey-test?sessionId=session-test'}}));
  let connected=false;
  await page.routeWebSocket('**/journey-test?sessionId=session-test',ws=>{connected=true;ws.send(JSON.stringify({type:'session',sessionId:'session-test',title:'Algebra',conceptId:'algebra'}));});
  await page.goto('/home');await studentLogin(page);await page.getByRole('button',{name:'Start Algebra',exact:true}).click();
  await expect(page).toHaveURL(/\/sessions\/session-test/);await expect.poll(()=>connected).toBe(true);
  expect(calls).toEqual([{studentId:'s-test',conceptId:'algebra'}]);
  await page.getByRole('button',{name:'Go back',exact:true}).click();await expect(page.getByRole('heading',{name:'Hi, Test.'})).toBeVisible();await expect(page.getByRole('button',{name:'Continue learning'})).toBeVisible();
});

test('desktop journey fits the viewport and keeps the lesson list scrollable',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await page.goto('/home?preview=1');
  await expect(page.getByLabel('Student access code',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  await studentLogin(page);await expect(page.locator('.j-lesson').first()).toBeVisible();
  const action=await page.locator('.j-lesson').first().getByRole('button').boundingBox();
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
  await expect(page.locator('.j-student-row')).toHaveCount(2);
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
