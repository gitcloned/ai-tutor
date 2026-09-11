import { describe, expect, it } from 'vitest';
import { BlockAdapter, decodeNarration, position, safeMedia } from '../src/protocol';
import { sanitizeDiagram } from '../src/diagram';

describe('the backend canvas stream', () => {
  it('keeps consecutive writes distinct, including empty attribute sentinels', () => {
    const adapter = new BlockAdapter();
    expect(adapter.accept({type:'text_chunk',content:'2x'})).toEqual([]);
    expect(adapter.accept({type:'text_chunk',content:' = 4'})).toEqual([]);
    expect(adapter.accept({type:'text_chunk',content:'',attrs:{position:'300,180'}})).toEqual([{kind:'write',content:'2x = 4',attrs:{position:'300,180'}}]);
    adapter.accept({type:'text_chunk',content:'x = 2'});
    expect(adapter.accept({type:'text_chunk',content:'',attrs:{}})[0].content).toBe('x = 2');
  });
  it('flushes plain baseline text on text completion without duplicating it', () => {
    const adapter = new BlockAdapter();
    adapter.accept({type:'text_chunk',content:'Hello'});
    expect(adapter.accept({type:'text',content:'Hello'})).toHaveLength(1);
    expect(adapter.accept({type:'text',content:'Hello'})).toHaveLength(0);
  });
  it('does not lose pending writing before a diagram', () => {
    const adapter = new BlockAdapter();
    adapter.accept({type:'text_chunk',content:'Hello'});
    expect(adapter.accept({type:'svg',content:'<svg/>',attrs:{}}).map(x=>x.kind)).toEqual(['write','svg']);
  });
  it('decodes replay narration as UTF-8', () => {
    expect(decodeNarration(btoa(String.fromCharCode(...new TextEncoder().encode('Let’s try — 你好'))))).toBe('Let’s try — 你好');
  });
  it('maps center anchors and rejects invalid positions', () => {
    expect(position({position:'300,260',anchor:'center'},400,80)).toEqual({x:100,y:220});
    expect(position({position:'NaN,20'},400,80)).toBeNull();
  });
  it('only embeds trusted YouTube hosts and safe video URLs', () => {
    expect(safeMedia('https://www.youtube.com/watch?v=CWFyxn0qDEU')?.kind).toBe('youtube');
    expect(safeMedia('javascript:alert(1)')).toBeNull();
    expect(safeMedia('https://youtube.com.evil.test/watch?v=CWFyxn0qDEU')?.kind).toBe('link');
  });
  it('removes executable SVG and preserves educational styling', () => {
    const svg = sanitizeDiagram('<svg viewBox="0 0 400 80" onload="alert(1)"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><line stroke-dasharray="6,3" x1="0" x2="40"/><text>2</text></svg>');
    expect(svg.content).not.toMatch(/onload|script|foreignObject/);
    expect(svg.content).toContain('stroke-dasharray="6,3"');
    expect(svg.width).toBe(400); expect(svg.height).toBe(80);
  });
});
