import { position, type Attrs, type Block } from './protocol';

export type Rect = { x: number; y: number; w: number; h: number };

export function resolvePlacement(
  attrs: Attrs,
  width: number,
  height: number,
  fallback: { x: number; y: number },
  obstacles: Rect[],
) {
  const explicit = position(attrs, width, height);
  if (explicit) return explicit;

  const point = { ...fallback };
  for (let tries = 0; tries <= obstacles.length; tries++) {
    const overlap = obstacles.find(bounds =>
      point.x < bounds.x + bounds.w &&
      point.x + width > bounds.x &&
      point.y < bounds.y + bounds.h + 12 &&
      point.y + height > bounds.y - 12
    );
    if (!overlap) break;
    point.y = overlap.y + overlap.h + 18;
  }
  return point;
}

/**
 * Return the smallest page-space movement that brings the active object into
 * the teaching focus zone. The zone sits above center so there is room for the
 * tutor's next step below it.
 */
export function cameraShift(viewport: Rect, active: Rect) {
  const zone = {
    minX: viewport.x + viewport.w * 0.18,
    maxX: viewport.x + viewport.w * 0.82,
    minY: viewport.y + viewport.h * 0.16,
    maxY: viewport.y + viewport.h * 0.62,
  };

  let x = 0;
  let y = 0;
  if (active.w > zone.maxX - zone.minX) {
    x = active.x + active.w / 2 - (viewport.x + viewport.w * 0.5);
  } else if (active.x < zone.minX) {
    x = active.x - zone.minX;
  } else if (active.x + active.w > zone.maxX) {
    x = active.x + active.w - zone.maxX;
  }

  if (active.h > zone.maxY - zone.minY) {
    y = active.y + active.h / 2 - (viewport.y + viewport.h * 0.42);
  } else if (active.y < zone.minY) {
    y = active.y - zone.minY;
  } else if (active.y + active.h > zone.maxY) {
    y = active.y + active.h - zone.maxY;
  }

  return x === 0 && y === 0 ? null : { x, y };
}

export function textStyle(kind: Extract<Block['kind'], 'write' | 'ask'>) {
  return { font: 'draw' as const, size: 'l' as const, color: kind==='ask'?'green' as const:'black' as const };
}

export function questionText(text:string) {
  const trimmed=text.trim();
  return /^(?:q(?:uestion)?\s*[.:：)]|q\s*\d+[.:)])\s*/i.test(trimmed)?trimmed:`Q. ${trimmed}`;
}

export const WRITE_CHARACTER_DELAY_MS = 60;

export function writingFrames(text: string) {
  const characters = [...text];
  return characters.map((_, index) => characters.slice(0, index + 1).join(''));
}
