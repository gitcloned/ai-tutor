import {describe,it,expect} from 'vitest';
import {annotationTarget} from '../src/annotationTarget';
describe('annotation targets',()=>{
  it('matches spaced and unicode subtraction with original offsets',()=>{
    const text='y = 2*x − 3';const match=annotationTarget(text,'-3')!;
    expect(text.slice(match.start,match.end)).toBe('− 3');
  });
  it('does not mark the wrong number',()=>{
    expect(annotationTarget('x - 30','-3')).toBeNull();
    expect(annotationTarget('x - 3.5','-3')).toBeNull();
  });
  it('preserves partial variable selection',()=>expect(annotationTarget('2x = 4','x')).toEqual({start:1,end:2}));
});
