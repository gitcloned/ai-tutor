import {test,expect,type WebSocketRoute} from '@playwright/test';
test.use({hasTouch:true,viewport:{width:820,height:1180}});
for(const name of ['a finger tap on MCQ option text sends the selected answer','touch fallback submits after a cancelled pointer sequence'])test(name,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let socket:WebSocketRoute;const messages:any[]=[];
  await page.routeWebSocket('**/touch-mcq',ws=>{socket=ws;ws.onMessage(data=>messages.push(JSON.parse(String(data))));});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).tap();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/touch-mcq');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).tap();
  await expect(page.locator('.connection')).toContainText('Connected');
  socket!.send(JSON.stringify({type:'question',content:'Q1',attrs:{stem:'Find x: x + 2 = 5','choice-a':'3','choice-b':'5',answer:'a'}}));
  socket!.send(JSON.stringify({type:'event',event:{type:'tutor-ended'}}));
  const option=page.getByRole('button',{name:'A 3',exact:true});
  await expect(option).toBeEnabled();
  if(test.info().title.includes('fallback')){
    await option.evaluate(button=>{
      const box=button.getBoundingClientRect(),point={identifier:1,clientX:box.x+30,clientY:box.y+30};
      const touch=(type:string,touches:unknown[])=>{
        const event=new Event(type,{bubbles:true,cancelable:true});
        Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:[point]}});
        button.dispatchEvent(event);
      };
      touch('touchstart',[point]);
      button.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:1}));
      touch('touchend',[]);
    });
  }else await option.locator('span').nth(1).tap();
  await expect.poll(()=>messages.length).toBe(1);
  expect(messages[0].activity.choice).toBe('a');
});
