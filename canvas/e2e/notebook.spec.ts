import {test,expect,type WebSocketRoute} from '@playwright/test';

function silence(seconds:number) {
  const size=8000*2*seconds, wav=Buffer.alloc(44+size);
  wav.write('RIFF');wav.writeUInt32LE(36+size,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(size,40);
  return wav.toString('base64');
}

test('connection hides welcome, audio types captions, deleted notebook page can be undone',async({page})=>{
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/test-tutor',ws=>{socket=ws;});
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/test-tutor');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await expect(page.locator('.welcome')).toHaveCount(0);
  socket!.send(JSON.stringify({type:'session',title:'Notebook test',sessionId:'test'}));
  const sentence='A cuboid has length, width, and height. Count the cubes inside.';
  socket!.send(JSON.stringify({type:'audio_chunk',content:silence(3),attrs:{mimeType:'audio/wav',sentence}}));
  const caption=page.locator('.caption p');
  await expect.poll(async()=>{const s=await caption.textContent();return !!s&&sentence.startsWith(s)&&s.length>3&&s.length<sentence.length;}).toBe(true);
  await expect(caption).toHaveText(sentence,{timeout:7000});
  socket!.send(JSON.stringify({type:'text_chunk',content:'Volume = length × width × height',attrs:{}}));
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await expect(page.getByRole('button',{name:'Delete Notebook test',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Close notebook'}).click();
  await page.locator('.connection').click();
  await page.getByRole('button',{name:'Disconnect and keep my notebook'}).click();
  await page.getByRole('button',{name:'Lesson notebook',exact:true}).click();
  await page.getByRole('button',{name:'Delete Notebook test',exact:true}).click();
  await expect(page.locator('.page-list')).not.toContainText('Notebook test');
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Close notebook'}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.lesson-breadcrumb')).toContainText('Notebook test');
  await expect(page.locator('.tl-shape[data-shape-type="text"]')).toHaveCount(1);
});
