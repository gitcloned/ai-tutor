import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';

test.use({hasTouch:true,launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['camera','microphone']});
async function connect(page:Page){
  const messages:any[]=[];let socket:WebSocketRoute;
  await page.routeWebSocket('**/camera-test',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/camera-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  return {messages,event:(event:object)=>socket!.send(JSON.stringify(event)),respond:()=>socket!.send(JSON.stringify({type:'text_chunk',content:'Thank you.',attrs:{}}))};
}
async function doubleTap(page:Page){
  const orb=page.getByRole('button',{name:'Send new work; hold to speak',exact:true});
  const box=await orb.boundingBox();await page.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);await page.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);await expect(page.getByRole('dialog',{name:'Show your work'})).toBeVisible();
}
test('multiple photographed pages are compressed, sent once, and retained as a notebook stack',async({page},testInfo)=>{
  const {messages,respond}=await connect(page);
  await page.getByRole('button',{name:'Text (T)',exact:true}).click();await page.mouse.click(700,230);await page.keyboard.type('Here is my working');await page.keyboard.press('Escape');
  await doubleTap(page);
  const capture=page.getByRole('button',{name:'Capture page',exact:true});
  await expect(capture).toBeEnabled();expect(messages).toHaveLength(0);
  await capture.tap();await expect(page.getByRole('button',{name:'Preview page 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Switch camera'}).tap();await expect(capture).toBeEnabled();
  await capture.tap();await expect(page.getByRole('button',{name:'Preview page 2',exact:true})).toBeVisible();
  await capture.tap();await expect(page.getByRole('button',{name:'Preview page 3',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preview page 3',exact:true}).tap();
  await page.getByRole('button',{name:'Delete this page'}).tap();await expect(page.getByRole('button',{name:'Preview page 3',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Close camera'}).tap();
  await expect(page.getByLabel('2 pages attached')).toBeVisible();expect(messages).toHaveLength(0);
  await doubleTap(page);await expect(page.getByRole('button',{name:'Preview page 2',exact:true})).toBeVisible();
  await expect(capture).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('camera.png')});
  await page.getByRole('button',{name:'Send 2 pages',exact:true}).tap();
  await expect.poll(()=>messages.length).toBe(1);expect(messages[0].images).toHaveLength(2);
  expect(messages[0].text).toContain('Here is my working');expect(messages[0].text).toContain('2 pages in capture order');
  for(const image of messages[0].images){
    expect(image.mimeType).toBe('image/jpeg');
    const size=await page.evaluate(async(data:string)=>{const image=new Image();image.src='data:image/jpeg;base64,'+data;await image.decode();return [image.naturalWidth,image.naturalHeight];},image.data);
    expect(Math.max(...size)).toBeLessThanOrEqual(1600);expect(Math.min(...size)).toBeGreaterThan(0);
  }
  await expect(page.getByRole('dialog',{name:'Show your work'})).toHaveCount(0);
  await expect(page.getByLabel('2 pages attached')).toHaveCount(0);
  respond();await expect(page.locator('.orb')).toBeEnabled();
  await page.getByRole('button',{name:'Pencil (D)',exact:true}).click();
  const stack=page.getByRole('button',{name:'Open your work, 2 pages'});await expect(stack).toBeVisible();await stack.tap();
  await expect(page.getByRole('dialog',{name:'Your submitted pages'})).toBeVisible();
  await page.getByRole('button',{name:'Next page'}).tap();await expect(page.getByRole('heading')).toContainText('Page 2 of 2');
  await page.getByRole('button',{name:'Close page preview'}).tap();
  await page.locator('.orb').tap();await page.waitForTimeout(700);expect(messages).toHaveLength(1);
  await page.reload();await expect(stack).toBeVisible();await stack.tap();await expect(page.getByAltText('Page 1', {exact:true})).toBeVisible();
});

test('closing the camera stops its tracks and held speech sends the attached pages',async({page})=>{
  const {messages}=await connect(page);
  await page.evaluate(()=>{
    const getUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).cameraStreams=[];(window as any).cameraRequests=[];
    Object.getPrototypeOf(navigator.mediaDevices).getUserMedia=async (constraints:MediaStreamConstraints)=>{
      const stream=await getUserMedia(constraints);
      if(constraints?.video){(window as any).cameraStreams.push(stream);(window as any).cameraRequests.push(constraints.video);}
      return stream;
    };
  });
  await doubleTap(page);
  const capture=page.getByRole('button',{name:'Capture page',exact:true});await expect(capture).toBeEnabled();await capture.tap();
  await expect(page.getByRole('button',{name:'Preview page 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Switch camera'}).tap();
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraRequests.length)).toBe(2);
  await expect(capture).toBeEnabled();
  await page.getByRole('button',{name:'Close camera'}).tap();
  const cameras=await page.evaluate(()=>({facing:(window as any).cameraRequests.map((r:any)=>r.facingMode.ideal),stopped:(window as any).cameraStreams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended'))}));
  expect(cameras).toEqual({facing:['user','environment'],stopped:true});
  const box=await page.locator('.orb').boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
  await expect(page.locator('.orb-label')).toHaveText('Listening…');await page.waitForTimeout(300);await page.mouse.up();
  await expect.poll(()=>messages.length).toBe(1);expect(messages[0].images).toHaveLength(1);expect(messages[0].audio.mimeType).toMatch(/^audio\//);
  await expect(page.getByLabel('1 pages attached')).toHaveCount(0);
});

test('camera permission failure offers retry and does not discard captured pages',async({page})=>{
  await connect(page);await doubleTap(page);
  await page.getByRole('button',{name:'Capture page',exact:true}).tap();await expect(page.getByRole('button',{name:'Preview page 1',exact:true})).toBeVisible();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await page.getByRole('button',{name:'Switch camera'}).tap();await expect(page.getByRole('alert')).toContainText('Allow camera access');
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close camera'}).tap();await expect(page.getByLabel('1 pages attached')).toBeVisible();
});


test('tutor opens camera after turn end without submitting photos automatically',async({page})=>{
  const {messages,event}=await connect(page);
  event({type:'event',event:{type:'tutor-started'}});
  event({type:'action',action:{type:'open-camera'}});
  await page.waitForTimeout(300);
  await expect(page.getByRole('dialog',{name:'Show your work'})).toHaveCount(0);
  event({type:'event',event:{type:'tutor-ended'}});
  await expect(page.getByRole('dialog',{name:'Show your work'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Capture page',exact:true})).toBeEnabled();
  expect(messages).toHaveLength(0);
});
