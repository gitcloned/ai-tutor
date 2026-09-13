import { describe, expect, it } from 'vitest';
import { cameraShift, resolvePlacement, textStyle, questionText, writingFrames, WRITE_CHARACTER_DELAY_MS } from '../src/layout';

describe('canvas placement', () => {
  it('honors an explicit position even when it overlaps existing content', () => {
    expect(resolvePlacement(
      {position:'300,180'}, 500, 54, {x:260,y:100},
      [{x:250,y:150,w:500,h:80}],
    )).toEqual({x:300,y:180});
  });

  it('moves automatically placed content below an overlap', () => {
    expect(resolvePlacement(
      {}, 500, 54, {x:260,y:100},
      [{x:250,y:80,w:500,h:100}],
    )).toEqual({x:260,y:198});
  });
});

describe('teaching camera', () => {
  const viewport = {x:0,y:0,w:1000,h:700};

  it('does not move when the active object is in the teaching focus zone', () => {
    expect(cameraShift(viewport,{x:300,y:180,w:300,h:100})).toBeNull();
  });

  it('pans vertically without changing zoom when new work falls below the focus zone', () => {
    expect(cameraShift(viewport,{x:300,y:650,w:300,h:100})).toEqual({x:0,y:316});
  });
});

it('uses one writing style for explanations and questions', () => {
  expect(textStyle('write')).toEqual({font:'draw',size:'l',color:'black'});
  expect(textStyle('ask')).toEqual({font:'draw',size:'l',color:'green'});
});

it('prefixes questions without duplicating backend question labels',()=>{
  expect(questionText(' How many cubes? ')).toBe('Q. How many cubes?');
  for(const text of ['Q. How many?', 'Q: How many?', 'Question: How many?', 'Q1. How many?'])expect(questionText(text)).toBe(text);
});

it('reveals writing one character at a readable cadence', () => {
  expect(writingFrames('x = 2')).toEqual(['x', 'x ', 'x =', 'x = ', 'x = 2']);
  expect(WRITE_CHARACTER_DELAY_MS).toBe(45);
});
