import {it,expect} from 'vitest';
import {activityCamera} from '../src/layout';
it('fits the complete question and options within tablet safe bounds',()=>{
  const area={x:110,y:24,w:890,h:610},content={x:172,y:1600,w:500,h:690};
  const c=activityCamera(area,content,1);
  expect((content.y+c.y)*c.z).toBeGreaterThanOrEqual(area.y);
  expect((content.y+content.h+c.y)*c.z).toBeLessThanOrEqual(area.y+area.h+.001);
  expect((content.x+c.x)*c.z).toBeGreaterThanOrEqual(area.x);
});
it('top-aligns exceptionally long questions rather than shrinking options too far',()=>{
  const c=activityCamera({x:110,y:24,w:890,h:500},{x:172,y:1600,w:500,h:1800},1);
  expect(c.z).toBe(.75);expect((1600+c.y)*c.z).toBeCloseTo(24);
});
it('fits width on a narrow viewport',()=>{
  const c=activityCamera({x:90,y:24,w:280,h:700},{x:172,y:100,w:500,h:500},1);
  expect(c.z).toBeCloseTo(.56);
});
