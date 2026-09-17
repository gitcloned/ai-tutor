import {expect,it} from 'vitest';
import {compileEquation,graphConfig,assessPoint,snapped} from '../src/models/functionGraph';

it('evaluates arithmetic without executing code, including exponent precedence',()=>{
  expect(compileEquation('y = 2*x - 3')(4)).toBe(5);
  expect(compileEquation('y = 2x - 3')(2)).toBe(1);
  expect(compileEquation('y = -x^2 + 2*(x+1)')(3)).toBe(-1);
  expect(compileEquation('y = 2^3^2')(0)).toBe(512);
  expect(compileEquation('y = sqrt(x) + abs(-2)')(9)).toBe(5);
  for(const bad of ['y = alert(1)','y = window.location','y = x;fetch(1)','x + y = 2','y = (x+1','y = 2**x'])expect(()=>compileEquation(bad)).toThrow();
});
it('checks both requested x-values and the function value, preserving earlier correct points',()=>{
  const c=graphConfig({equation:'y = 2*x - 3',action:'ask',targets:'2,3,4'});
  expect(assessPoint(c,[],2,2).correct).toBe(false);
  expect(assessPoint(c,[],1,-1).correct).toBe(false);
  expect(assessPoint(c,[],2,1)).toEqual({correct:true,remaining:[3,4],complete:false});
  expect(assessPoint(c,[{x:2,y:1,correct:true},{x:3,y:3,correct:true}],4,5)).toEqual({correct:true,remaining:[],complete:true});
});
it('supports fractional grids and rejects unreachable or undefined targets',()=>{
  expect(snapped(.300000000001,.1)).toBe(.3);
  expect(()=>graphConfig({equation:'y = x / 2',action:'ask',targets:'3'})).toThrow(/snap/);
  const c=graphConfig({equation:'y = x / 2',action:'ask',targets:'3',snap:'.5'});
  expect(assessPoint(c,[],3,1.5).correct).toBe(true);
  expect(()=>graphConfig({equation:'y = 1/x',action:'ask',targets:'0'})).toThrow(/domain/);
  expect(()=>graphConfig({action:'ask',targets:'4','y-range':'-2,2'})).toThrow(/range/);
  expect(()=>graphConfig({targets:'2,,3'})).toThrow();
});
it('keeps configuration when revealing an activity and allows open practice',()=>{
  const c=graphConfig({action:'ask',targets:'2,3'});
  expect(graphConfig({action:'plot'},c)).toEqual({...c,mode:'plot'});
  expect(assessPoint(graphConfig({action:'ask'}),[],4,5)).toEqual({correct:true,remaining:[],complete:false});
});
