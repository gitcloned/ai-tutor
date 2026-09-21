import {it,expect} from 'vitest';
import {mcqConfig} from '../src/mcq';
it('reads sorted choices and an optional hidden answer',()=>{
  expect(mcqConfig({stem:'Find y','choice-b':'3','choice-a':'-3',answer:'a'})).toEqual({stem:'Find y',choices:[{key:'a',text:'-3'},{key:'b',text:'3'}],answer:'a'});
  expect(mcqConfig({})).toBeNull();
  expect(mcqConfig({stem:'Why?','choice-a':'One','choice-b':'Two'})?.answer).toBe('');
});
it('rejects incomplete or inconsistent questions before rendering',()=>{
  expect(()=>mcqConfig({stem:'Find y','choice-a':'3'})).toThrow();
  expect(()=>mcqConfig({stem:'Find y','choice-a':'3','choice-b':'4',answer:'c'})).toThrow();
});
