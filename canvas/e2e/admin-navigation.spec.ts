import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('admin session links, tabs and breadcrumbs navigate with escaped parameters',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const student='student-one',concept='concept-1',subject='math"s';
 const session={id:'session-one',studentId:student,conceptId:concept,status:'started',history:[],rawHistory:[],planHistory:[],createdAt:'2026-10-03T10:00:00Z'};
 const data:Record<string,unknown>={
 '/students/all':[{studentId:student,name:'Arush',accessCode:'BC2345',grade:'Grade 8',classes:[]}],
 '/students':[{studentId:student,sessionCount:1}],
 '/subjects':[{id:subject,title:'Mathematics'}],
 '/admin/hierarchy':[{id:'strand',title:'Algebra',subjectId:subject,units:[{id:'unit',title:'Equations',topics:[{id:'topic',title:'Linear equations',concepts:[{id:concept,title:'Ordered pairs'}]}]}]}],
 [`/students/${student}/journeys`]:[{id:'journey',subjectId:subject}],
 [`/students/${student}/sessions`]:[session],
 [`/students/${student}/memories`]:[],
 '/journeys/journey/nodes':[{conceptId:concept,state:'assessing'}],
 '/sessions/session-one':session,
 };
 await page.route('**/*',r=>{const path=new URL(r.request().url()).pathname;if(path==='/admin')return r.fulfill({contentType:'text/html',body:readFileSync('../cms/packages/learning-progression/src/admin.html','utf8')});if(path in data)return r.fulfill({json:data[path]});return r.continue();});
 await page.goto('http://localhost:32002/admin');
 await expect(page.getByRole('cell',{name:'BC2345',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page).toHaveURL('http://localhost:32002/admin');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'View →',exact:true}).click();
 await page.getByRole('button',{name:'Sessions (1)',exact:true}).click();await expect(page).toHaveURL(/tab=sessions/);
 await page.getByRole('button',{name:'Learning',exact:true}).click();
 await page.getByRole('button',{name:'Mathematics',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('subject')).toBe(subject);
 await page.getByRole('button',{name:'View 1',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/concept=concept-1/);
 await page.locator('.filter-chip button').click();await expect.poll(()=>new URL(page.url()).searchParams.has('concept')).toBe(false);
 await page.getByRole('row').filter({hasText:'Ordered pairs'}).click();await expect(page).toHaveURL(/session=session-one/);
 await page.locator('#breadcrumb .crumb').filter({hasText:'Arush'}).click();await expect(page).toHaveURL(/student=student-one/);
 let deletes=0,flushes=0;
 await page.route('**/students/student-one',r=>{if(r.request().method()!=='DELETE')return r.fallback();deletes++;return r.fulfill({status:deletes===1?200:404,json:deletes===1?{deleted:{lp:null}}:{error:'Student not found'}});});
 await page.route('**/students/student-one/all',r=>{flushes++;return r.fulfill({status:flushes===1?503:200,json:flushes===1?{error:'offline'}:{deleted:{sessions:1}}});});
 await page.getByRole('button',{name:'Delete student',exact:true}).click();
 await expect(page.getByRole('button',{name:'Delete permanently',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(deletes).toBe(0);
 await page.getByRole('button',{name:'Delete student',exact:true}).click();
 await page.getByLabel('Type DELETE to confirm').fill('DELETE');
 await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Deletion did not fully complete');
 await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
 await expect(page).toHaveURL('http://localhost:32002/admin');expect(deletes).toBe(2);expect(flushes).toBe(2);
 expect(errors).toEqual([]);
});
