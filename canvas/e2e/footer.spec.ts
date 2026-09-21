import {test,expect} from '@playwright/test';
test('footer aligns navigation and offline orb opens connection on desktop and mobile',async({page})=>{
  await page.routeWebSocket('**/footer-test',()=>{});
  await page.goto('/');
  const footer=page.locator('.tutor-space'),orb=page.locator('.orb');
  await expect(footer.getByRole('button',{name:'Go back'})).toBeVisible();
  await expect(page.locator('.connection>span')).toHaveCSS('background-color','rgb(199, 96, 87)');
  await orb.click();await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toBeVisible();
  await page.getByLabel('Tutor address').fill('ws://127.0.0.1:32004/footer-test');
  await page.getByRole('button',{name:'Connect to tutor',exact:true}).click();
  await expect(page.locator('.connection')).toContainText('Connected');
  await expect(page.locator('.connection>span')).toHaveCSS('background-color','rgb(101, 150, 113)');
  const back=(await page.locator('.canvas-back').boundingBox())!,bar=(await footer.boundingBox())!;
  expect(Math.abs(back.y+back.height/2-bar.y-bar.height/2)).toBeLessThan(2);
  const topic=(await page.locator('.lesson-breadcrumb').boundingBox())!;
  expect(topic.width).toBeGreaterThan(300);
  const toolbar=(await page.locator('.toolbar').boundingBox())!,canvas=(await page.locator('.canvas-area').boundingBox())!;
  expect(Math.abs(toolbar.y+toolbar.height/2-canvas.y-canvas.height/2)).toBeLessThan(2);
  await page.screenshot({path:'test-results/footer-desktop.png'});
  await page.locator('.connection').click();await page.getByRole('button',{name:'Disconnect and keep my notebook'}).click();
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const title=(await page.locator('.lesson-breadcrumb').boundingBox())!;
    const controls=await Promise.all(['.connection','.zoom-controls','.footer-utilities>button'].map(s=>page.locator(s).boundingBox()));
    for(const control of controls){
      expect(control!.y).toBeGreaterThanOrEqual(title.y+title.height);
      expect(control!.x+control!.width).toBeLessThanOrEqual(width);
      expect(Math.abs(control!.y+control!.height/2-controls[0]!.y-controls[0]!.height/2)).toBeLessThan(2);
    }
    for(let i=1;i<controls.length;i++)expect(controls[i]!.x).toBeGreaterThanOrEqual(controls[i-1]!.x+controls[i-1]!.width);
    const orbBox=(await orb.boundingBox())!,footerBox=(await footer.boundingBox())!;
    expect(orbBox.y).toBeLessThan(footerBox.y);
    expect(orbBox.y+orbBox.height).toBeGreaterThan(footerBox.y);
    await expect(orb).toBeEnabled();await orb.click();
    await expect(page.getByRole('dialog',{name:'Meet on the canvas.'})).toBeVisible();
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
  await page.screenshot({path:'test-results/footer-mobile.png'});
});
