import {test,expect} from '@playwright/test';
test('cuboid lesson plays without replies, animates, rotates and persists',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Start learning'}).click();
  await page.getByLabel('Tutor address').fill(process.env.CUBOID_REPLAY_URL||'ws://127.0.0.1:32004');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  const model=page.locator('[data-model="cuboid-volume-01"]');
  await expect(model).toHaveAttribute('data-count','12',{timeout:45000});
  await page.getByRole('button',{name:'Fit lesson',exact:true}).click();
  await page.waitForTimeout(400); // Allow the camera's 350ms fit animation to settle for the screenshot.
  await page.screenshot({path:'artifacts/cuboid-base.png'});
  await expect(model).toHaveAttribute('data-count','24',{timeout:30000});
  await page.getByRole('button',{name:'Fit lesson',exact:true}).click();
  await page.waitForTimeout(400);
  await page.screenshot({path:'artifacts/cuboid-volume.png'});
  await expect(model).toHaveAttribute('data-routine','same-volume',{timeout:60000});
  await expect(model).toHaveAttribute('data-busy','false',{timeout:20000});
  await expect(page.locator('.caption')).toContainText('A new cuboid',{timeout:30000});
  await expect(page.locator('.orb-label')).toHaveText('Your turn');
  await page.getByRole('button',{name:'Fit lesson',exact:true}).click();
  await page.waitForTimeout(400);
  await expect(model).toHaveCount(1);
  const polygon=model.locator('polygon').first();const before=await polygon.getAttribute('points');
  const box=await model.boundingBox();
  await page.mouse.move(box!.x+box!.width*.5,box!.y+box!.height*.5);
  await page.mouse.down();await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.5,{steps:8});await page.mouse.up();
  await expect(polygon).not.toHaveAttribute('points',before!);
  await page.screenshot({path:'artifacts/cuboid-chapter.png'});
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export page',exact:true}).click();
  await (await download).saveAs('artifacts/cuboid-export.png');
  await expect.poll(()=>page.evaluate(()=>new Promise<number>((resolve,reject)=>{
    const request=indexedDB.open('TLDRAW_DOCUMENT_v2prodigy-canvas-v1');request.onsuccess=()=>{const db=request.result;const read=db.transaction('records').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result.find((r:{type:string})=>r.type==='model3d')?.props.count||0);db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);
  }))).toBe(24);
  await page.reload();await expect(model).toHaveAttribute('data-count','24');
  expect(errors).toEqual([]);
});
