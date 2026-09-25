import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const SHARED_TUTOR_URL=process.env.VITE_TUTOR_WS_URL??readFileSync(new URL('../.env',import.meta.url),'utf8').match(/^VITE_TUTOR_WS_URL=(.+)$/m)![1].trim();
test.use({hasTouch:true});

test('shared HTTPS address connects securely and is remembered only after opening',async({page},testInfo)=>{
  let connects=0;await page.routeWebSocket(SHARED_TUTOR_URL,()=>{connects++;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await expect(page.getByRole('button',{name:/Shared tutor/})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('connection-options.png')});
  await page.getByLabel('Tutor address').fill(SHARED_TUTOR_URL.replace('wss:','https:'));
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toHaveText('Connected');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prodigy-successful-tutors')!))).toEqual([SHARED_TUTOR_URL]);
  await page.reload();await page.getByRole('button',{name:'Start learning'}).click();
  await expect(page.locator('.connection')).toHaveText('Connected');
  await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toHaveCount(0);expect(connects).toBe(2);
  await page.locator('.connection').click();await page.getByRole('button',{name:'Disconnect and keep my notebook'}).click();
  await page.locator('.orb').tap();await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toBeVisible();
  expect(connects).toBe(2);await expect(page.getByRole('button',{name:/Last working/})).toBeVisible();
  await page.getByRole('button',{name:/Last working/}).tap();await expect(page.locator('.connection')).toHaveText('Connected');
  expect(connects).toBe(3);
});

test('a failed remembered address opens the connection choices without overwriting history',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('prodigy-successful-tutors',JSON.stringify(['wss://unreachable.example/'])));
  await page.routeWebSocket(SHARED_TUTOR_URL,()=>{});
  await page.goto('/');
  await page.evaluate(()=>{
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{
      constructor(url:string|URL,protocols?:string|string[]){
        if(String(url).includes('unreachable.example'))throw new DOMException('Unavailable','SecurityError');
        super(url,protocols);
      }
    };
  });
  await page.getByRole('button',{name:'Start learning'}).click();
  await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prodigy-successful-tutors')!))).toEqual(['wss://unreachable.example/']);
  await page.getByRole('button',{name:/Shared tutor/}).click();await expect(page.locator('.connection')).toHaveText('Connected');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prodigy-successful-tutors')!)[0])).toBe(SHARED_TUTOR_URL);
});

test('a stalled connection times out and can be replaced',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('prodigy-successful-tutors',JSON.stringify(['wss://stalled.example/']));
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{
      constructor(url:string|URL,protocols?:string|string[]){
        if(String(url).includes('stalled.example'))return {readyState:0,close(){this.readyState=3;}} as WebSocket;
        super(url,protocols);
      }
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await expect(page.locator('.connection')).toHaveText('Connecting…');
  await page.locator('.orb').tap();await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('did not respond',{timeout:13000});
  await expect(page.getByRole('button',{name:/Shared tutor/})).toBeEnabled();
});
