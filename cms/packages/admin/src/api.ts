import type { Concept, ConceptStub, Resource, ResourceStub, Question, StrandNode, Topic } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  hierarchy:    ()          => get<StrandNode[]>('/admin/hierarchy'),
  conceptsAll:  (q?: string) => get<ConceptStub[]>(`/admin/concepts/all${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  resourcesAll: (q?: string) => get<ResourceStub[]>(`/admin/resources/all${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getConcept:   (id: string) => get<Concept>(`/admin/concepts/${id}`),
  patchConcept: (id: string, body: Partial<Concept>) => patch<Concept>(`/admin/concepts/${id}`, body),
  getTopic:     (id: string) => get<Topic>(`/admin/topics/${id}`),
  patchTopic:   (id: string, body: unknown) => patch<Topic>(`/admin/topics/${id}`, body),
  getResource:  (id: string) => get<Resource>(`/admin/resources/${id}`),
  getQuestion:  (id: string) => get<Question>(`/admin/questions/${id}`),
};
