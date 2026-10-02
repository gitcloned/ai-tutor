import {randomBytes,createHash} from 'node:crypto';
import {test,expect} from '@playwright/test';
// Opt-in: real ERP, MongoDB, CMS, LP and agent. Creates its own identifiable
// adult fixture; no Google login bypass is shipped in the application.
const live=process.env.JOURNEY_LIVE==='1';
test.skip(!live,'Set JOURNEY_LIVE=1 with the local services running.');
const erp=process.env.JOURNEY_ERP_URL||'http://localhost:32005';
let adult:any,db:any;
test.beforeAll(async()=>{
  if(!live)return;
  const mongoose=(await import('../../cms/packages/erp/node_modules/mongoose/index.js')).default;
  await mongoose.connect(process.env.JOURNEY_MONGO_URL||'mongodb://localhost:27017/prodigy');db=mongoose;
  const id=new mongoose.Types.ObjectId().toHexString();
  adult={userId:id,name:'Journey Integration Test',email:`journey-${id}@example.test`,roles:['teacher','parent'],token:randomBytes(32).toString('base64url')};
  await mongoose.connection.collection('accesssessions').insertOne({tokenHash:createHash('sha256').update(adult.token).digest('hex'),kind:'adult',subjectId:id,expiresAt:new Date(Date.now()+3600000)});
  await mongoose.connection.collection('users').insertOne({id,firebaseUid:`integration-${id}`,name:adult.name,email:adult.email,roles:adult.roles,createdAt:new Date()});
});
test.afterAll(async()=>{
  if(!db||!adult)return;
  const students=await db.connection.collection('students').find({createdByUserId:adult.userId}).toArray();
  const ids=students.map((s:any)=>s.id);
  await db.connection.collection('enrollments').deleteMany({studentId:{$in:ids}});
  await db.connection.collection('students').deleteMany({createdByUserId:adult.userId});
  await db.connection.collection('classrooms').deleteMany({ownerUserId:adult.userId});
  await db.connection.collection('accesssessions').deleteMany({subjectId:{$in:[adult.userId,...ids]}});
  await db.connection.collection('users').deleteOne({id:adult.userId});
  await db.disconnect();
});
test('real ERP enrollment, student login, code reset and real tutor session',async({page,request})=>{
  await page.goto('/login');
  await page.evaluate(user=>sessionStorage.setItem('prodigy-journey-live-identity',JSON.stringify({type:'adult',...user})),adult);
  await page.goto('/home');await expect(page.getByRole('heading',{name:'Welcome, Journey.'})).toBeVisible();
  await page.getByRole('button',{name:'Create a class',exact:true}).click();await page.getByLabel('Class name').fill('Integration Maths');await page.getByRole('button',{name:'Create class',exact:true}).click();
  let classCode=await page.locator('.j-access-slip strong').innerText();await page.getByRole('button',{name:'I’ve saved it'}).click();
  await page.getByRole('button',{name:/Integration Maths/}).click();await page.getByRole('button',{name:'Add student',exact:true}).first().click();
  await page.getByLabel('Student’s name').fill('Integration Learner');await page.getByRole('button',{name:'Create student profile'}).click();
  const studentCode=await page.locator('.j-access-slip strong').innerText();await page.getByRole('button',{name:'I’ve saved it'}).click();
  await expect(page.locator('.j-student-row')).toContainText('Integration Learner');
  await page.getByRole('button',{name:'Create a new invitation code'}).click();
  const newClassCode=await page.locator('.j-access-slip strong').innerText();expect(newClassCode).not.toBe(classCode);classCode=newClassCode;
  await page.getByRole('button',{name:'I’ve saved it'}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Student access code',{exact:true}).fill(studentCode);await page.getByRole('button',{name:'Let’s get started'}).click();
  await expect(page.getByRole('heading',{name:'Hi, Integration.'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Integration Maths/})).toBeVisible();
  await page.getByRole('button',{name:'Join a class',exact:true}).click();await page.getByLabel('Class code',{exact:true}).fill(classCode);await page.getByRole('button',{name:'Join class',exact:true}).click();await expect(page.getByRole('status')).toContainText('already in');
  await expect(page.locator('.j-lesson').first()).toBeVisible();
  await page.screenshot({path:'artifacts/journey-live-student.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  const identity=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('prodigy-journey-live-identity')!));
  expect((await request.get(`${erp}/students/${identity.studentId}/code`)).status()).toBe(401);
  const old=(await request.post(`${erp}/auth/student`,{data:{code:studentCode}}));expect(old.ok()).toBe(true);
  await db.connection.collection('accesssessions').insertOne({tokenHash:createHash('sha256').update(adult.token).digest('hex'),kind:'adult',subjectId:adult.userId,expiresAt:new Date(Date.now()+3600000)});
  const reset=await request.post(`${erp}/students/${identity.studentId}/reset-code`,{headers:{Authorization:`Bearer ${adult.token}`},data:{userId:adult.userId}});expect(reset.ok()).toBe(true);
  const visible=await request.get(`${erp}/students/${identity.studentId}/code`,{headers:{Authorization:`Bearer ${adult.token}`}});expect(visible.ok()).toBe(true);expect((await visible.json()).code).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/);
  const replacement=await reset.json();expect((await request.post(`${erp}/auth/student`,{data:{code:studentCode}})).status()).toBe(401);
  expect((await request.post(`${erp}/auth/student`,{data:{code:replacement.code}})).ok()).toBe(true);
  if(process.env.JOURNEY_ERP_ONLY==='1')return;
  // A real session exercises the entire REST → WebSocket → LLM → canvas path.
  const sent:any[]=[];
  page.on('websocket',ws=>ws.on('framereceived',event=>{try{sent.push(JSON.parse(String(event.payload)));}catch{}}));
  await page.getByLabel('Find a lesson').fill('Solutions to 2-variable');
  const first=page.locator('.j-lesson').first();await expect(first).toBeVisible();
  await first.getByRole('button',{name:/Start/}).click();
  await expect(page).toHaveURL(/\/sessions\/[^/]+/,{timeout:30000});
  await expect.poll(()=>sent.some(e=>e.type==='session'),{timeout:30000}).toBe(true);
  await expect.poll(()=>sent.some(e=>e.type==='event'&&e.event?.type==='tutor-ended'),{timeout:90000}).toBe(true);
  expect(sent.filter(e=>e.type==='error').map(e=>e.message)).toEqual([]);
  expect(sent.some(e=>['text_chunk','question','audio_chunk'].includes(e.type)),JSON.stringify(sent)).toBe(true);
  await page.screenshot({path:'artifacts/journey-live-canvas.png',fullPage:true});
  await page.getByRole('button',{name:'Go back',exact:true}).click();await expect(page.getByRole('button',{name:'Continue learning'})).toBeVisible();
});

test('ERP rejects other students, forged identity headers and unauthorized code access',async({request})=>{
  const headers={Authorization:`Bearer ${adult.token}`};
  // Each test gets a current adult login token even if a prior test signed out.
  await db.connection.collection('accesssessions').updateOne({tokenHash:createHash('sha256').update(adult.token).digest('hex')},{$set:{kind:'adult',subjectId:adult.userId,expiresAt:new Date(Date.now()+3600000)}},{upsert:true});
  const created=await request.post(`${erp}/students`,{headers,data:{name:'Access Test',grade:'Grade 7'}});expect(created.status()).toBe(201);const student=await created.json();
  const login=await request.post(`${erp}/auth/student`,{data:{code:student.code}});const signed=await login.json();expect(signed.token).toBeTruthy();
  const studentHeaders={Authorization:`Bearer ${signed.token}`};
  const self=await request.get(`${erp}/me?studentId=another-student`,{headers:studentHeaders});expect((await self.json()).studentId).toBe(student.studentId);
  expect((await request.get(`${erp}/students/${student.studentId}/code`,{headers:studentHeaders})).status()).toBe(403);
  expect((await request.get(`${erp}/students/${student.studentId}/code`,{headers:{'X-User-Id':adult.userId}})).status()).toBe(401);
  const stored=await db.connection.collection('students').findOne({id:student.studentId});expect(stored.encryptedCode).toBeTruthy();expect(stored.encryptedCode).not.toContain(student.code);expect(stored.hashedCode).not.toBe(student.code);
  expect((await (await request.get(`${erp}/students/${student.studentId}/code`,{headers})).json()).code).toBe(student.code);
  await request.post(`${erp}/auth/logout`,{headers:studentHeaders});expect((await request.get(`${erp}/me`,{headers:studentHeaders})).status()).toBe(401);
});
