const CMS_BASE = process.env['CMS_URL'] ?? 'http://localhost:3001';
const LP_BASE  = process.env['LP_URL']  ?? 'http://localhost:3002';

async function req<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Content from CMS (concepts, resources, questions)
export const cms = {
  get:   <T>(path: string)                => req<T>(CMS_BASE, 'GET',   path),
  patch: <T>(path: string, body: unknown) => req<T>(CMS_BASE, 'PATCH', path, body),
};

// Student progression data (journeys, sessions, memory)
export const lp = {
  get:   <T>(path: string)                => req<T>(LP_BASE, 'GET',   path),
  post:  <T>(path: string, body: unknown) => req<T>(LP_BASE, 'POST',  path, body),
  patch: <T>(path: string, body: unknown) => req<T>(LP_BASE, 'PATCH', path, body),
};
