import DOMPurify from 'dompurify';
export function sanitizeDiagram(value: string) {
  const clean = DOMPurify.sanitize(value, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject','script','style','image','a','animate','animateMotion','animateTransform','set'], FORBID_ATTR: ['href','xlink:href','style'] });
  const document = new DOMParser().parseFromString(clean,'image/svg+xml');
  const svg = document.documentElement;
  if (svg.tagName !== 'svg' || document.querySelector('parsererror')) throw new Error('The tutor sent a diagram that could not be displayed.');
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const width = Math.min(2000,Math.max(40,viewBox?.[2] || parseFloat(svg.getAttribute('width') ?? '') || 400));
  const height = Math.min(2000,Math.max(40,viewBox?.[3] || parseFloat(svg.getAttribute('height') ?? '') || 300));
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width',String(width)); svg.setAttribute('height',String(height));
  return {content:new XMLSerializer().serializeToString(svg),width,height};
}
