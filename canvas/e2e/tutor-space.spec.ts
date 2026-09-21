import {test,expect,type WebSocketRoute} from '@playwright/test';

test('graph equation is handwritten and captions stay outside the canvas on desktop and mobile',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('prodigy-input-hints-v1','{"write":true,"speak":true}'));
  let socket:WebSocketRoute;
  await page.routeWebSocket('**/tutor-space',ws=>{socket=ws;});
  await page.goto('/');await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill('ws://localhost:32004/tutor-space');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await expect(page.getByRole('button',{name:'Pencil (D)',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'blue ink',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.app-header')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Go back',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Type a reply',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Lesson conversation',exact:true})).toHaveCount(0);
  await expect(page.locator('.tutor-space .connection')).toBeVisible();
  await expect(page.locator('.tutor-space .zoom-controls')).toBeVisible();
  const send=(event:unknown)=>socket!.send(JSON.stringify(event));
  send({type:'model',content:'function-graph',attrs:{equation:'y = 2*x - 3',action:'plot'}});
  await expect(page.locator('.function-graph')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.graph-line')).toHaveCSS('animation-duration','3s');
  await expect(page.locator('.graph-line')).toHaveAttribute('stroke','#356aca');
  await expect(page.getByRole('button',{name:'Pencil (D)',exact:true})).toHaveAttribute('aria-pressed','true');
  const equation=page.locator('.function-graph header strong');
  await expect(equation).toHaveCSS('font-family',/tldraw_draw/);
  await expect.poll(()=>page.evaluate(()=>document.fonts.check('32px tldraw_draw')),{timeout:15000}).toBe(true);
  send({type:'text_chunk',content:'Each point has an x-value and a y-value.',attrs:{}});
  await expect(page.locator('.orb')).toHaveAttribute('data-state','writing');
  send({type:'audio_chunk',content:Buffer.from('Follow the line. When x is two, y is one. You can move across the graph to explore each coordinate pair.').toString('base64'),attrs:{mimeType:'text/plain'}});
  send({type:'event',event:{type:'tutor-ended'}});
  await expect(page.locator('.orb')).toHaveAttribute('data-state','speaking',{timeout:12000});
  await expect(page.locator('.caption p')).toContainText('Follow');
  await page.screenshot({path:'test-results/tutor-space-desktop.png'});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    await expect.poll(async()=>{
      const canvas=(await page.locator('.canvas-area').boundingBox())!,caption=(await page.locator('.caption').boundingBox())!;
      return caption.y-(canvas.y+canvas.height);
    }).toBeGreaterThanOrEqual(0);
    const orb=(await page.locator('.orb').boundingBox())!;
    expect(orb.x).toBeGreaterThanOrEqual(0);expect(orb.x+orb.width).toBeLessThanOrEqual(width);
    await expect.poll(async()=>{const graph=(await page.locator('.function-graph').boundingBox())!;return graph.x+graph.width;}).toBeLessThanOrEqual(width);
  }
  await page.screenshot({path:'test-results/tutor-space-mobile.png'});
});
