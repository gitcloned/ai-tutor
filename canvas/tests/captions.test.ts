import {expect,it} from 'vitest';
import {spokenPrefix} from '../src/captions';
it('reveals captions proportionally and finishes at the audio end',()=>{
  expect(spokenPrefix('Hello world',0,2)).toBe('H');
  expect(spokenPrefix('Hello world',1,2)).toBe('Hello ');
  expect(spokenPrefix('Hello world',2,2)).toBe('Hello world');
  expect(spokenPrefix('Hi 🌍',100,2)).toBe('Hi 🌍');
});
