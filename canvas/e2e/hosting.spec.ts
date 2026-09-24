import {test,expect} from '@playwright/test';

test('hosted canvas remains rendered past production license validation',async({page})=>{
  const url=process.env.PRODUCTION_SMOKE_URL;
  test.skip(!url,'Set PRODUCTION_SMOKE_URL to check a deployed site.');
  const licenseErrors:string[]=[];
  page.on('console',message=>{if(/No tldraw license|license is required|license key is not valid|license has expired/i.test(message.text()))licenseErrors.push(message.text());});
  await page.goto(url!);
  await expect(page.locator('.tl-canvas')).toBeVisible();
  // The SDK removes unlicensed production editors after five seconds.
  await page.waitForTimeout(7000);
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(page.getByRole('button',{name:'Pencil (D)',exact:true})).toBeVisible();
  await expect(page.locator('[data-testid="tl-license-expired"]')).toHaveCount(0);
  expect(licenseErrors).toEqual([]);
});
