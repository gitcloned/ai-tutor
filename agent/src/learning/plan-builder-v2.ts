import { existsSync, readFileSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import type { PlanStep, PlanStepType } from '../types.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const CONTENT_ROOT = process.env['CMS_CONTENT_DIR']
  ?? join(__dir, '../../../cms/content');

// ── File detection ─────────────────────────────────────────────────────────────

export function probePlanPath(conceptId: string): string {
  return join(CONTENT_ROOT, conceptId, 'probe.md');
}

export function hasProbePlan(conceptId: string): boolean {
  return existsSync(probePlanPath(conceptId));
}

export function loadProbePlan(conceptId: string): MarkdownPlan {
  const md = readFileSync(probePlanPath(conceptId), 'utf8');
  return buildPlanFromMarkdown(md);
}

export function teachPlanPath(conceptId: string): string {
  return join(CONTENT_ROOT, conceptId, 'teach.md');
}

export function hasTeachPlan(conceptId: string): boolean {
  return existsSync(teachPlanPath(conceptId));
}

export function loadTeachPlan(conceptId: string): MarkdownPlan {
  const md = readFileSync(teachPlanPath(conceptId), 'utf8');
  return buildPlanFromMarkdown(md);
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface RawStep {
  id:         number;
  type:       PlanStepType;
  content:    Record<string, unknown>;
  ifCorrect:  number | null;
  ifWrong:    number | null;
}

export interface MarkdownPlan {
  steps:  PlanStep[];
  models: string[];  // model IDs declared via "# Models: a, b" in the preamble
}

// Header pattern: ## N (optional name) or ## Step N (optional name)
const HEADER_RE = /^## (?:Step )?(\d+)(?:\s+\(([^)]+)\))?\s*$/gm;
const HEADER_SPLIT_RE = /^## (?:Step )?\d+(?:\s+\([^)]+\))?\s*$/m;
const MODELS_RE  = /^#\s+Models:\s*(.+)$/im;

export function buildPlanFromMarkdown(markdown: string): MarkdownPlan {
  const headers = [...markdown.matchAll(HEADER_RE)];
  if (!headers.length) return { steps: [], models: [] };

  const parts = markdown.split(HEADER_SPLIT_RE);
  // parts[0] is preamble — parse model declarations from it
  const preamble = parts[0] ?? '';
  const modelsMatch = MODELS_RE.exec(preamble);
  const models = modelsMatch
    ? modelsMatch[1].split(',').map(m => m.trim()).filter(Boolean)
    : [];

  // parts[1..] are step bodies
  const raw: RawStep[] = headers.map((h, i) =>
    parseStep(parseInt(h[1], 10), h[2]?.trim() ?? null, parts[i + 1] ?? ''),
  );

  // Auto-append store_memory. State advancement is automatic — when the plan
  // exhausts (no next step), update_step calls nextConceptState() and transitions.
  const lastId  = raw.at(-1)?.id ?? 0;
  const storeId = lastId + 1;

  raw.push(
    { id: storeId, type: 'store_memory', content: { instruction: 'Store what you learned about this student' }, ifCorrect: null, ifWrong: null },
  );

  // Authored steps: ifCorrect/ifWrong stay null — LLM navigates via nextStep.
  // store_memory has null pointers so after it the plan exhausts → auto-advance.
  const steps: PlanStep[] = raw.map((r, idx) => ({
    id:        r.id,
    type:      r.type,
    content:   r.content,
    status:    idx === 0 ? 'in_progress' : 'pending',
    ifCorrect: r.ifCorrect,
    ifWrong:   r.ifWrong,
  }));

  return { steps, models };
}

const KV_RE      = /^(redirect|mode|reason|play):\s*(.+)$/i;

function parseStep(id: number, name: string | null, body: string): RawStep {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  const kv: Record<string, string> = {};
  const prose: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const m = KV_RE.exec(line);
    if (m) kv[m[1].toLowerCase()] = m[2].trim();
    else   prose.push(line);
  }

  // Video resource step — play: <url> maps to type 'resource'.
  if (kv['play']) {
    const content: Record<string, unknown> = {};
    if (name) content.name = name;
    content.resources  = [{ youtubeUrl: kv['play'], title: name ?? kv['play'] }];
    if (prose.length) content.instruction = prose.join('\n');
    return { id, type: 'resource', content, ifCorrect: null, ifWrong: null };
  }

  // Redirect step — maps to type 'teach' which update_step handles automatically.
  if (kv['redirect']) {
    const content: Record<string, unknown> = {};
    if (name) content.name = name;
    content.conceptId    = kv['redirect'];
    content.conceptTitle = kv['redirect']; // title not available in md; redirect.ts uses conceptId as fallback
    content.mode         = kv['mode'] ?? 'teach';
    if (kv['reason']) content.reason = kv['reason'];
    if (prose.length)  content.instruction = prose.join('\n');
    return { id, type: 'teach', content, ifCorrect: null, ifWrong: null };
  }

  const content: Record<string, unknown> = {};
  if (name) content.name = name;
  content.instruction = prose.join('\n');

  return { id, type: 'step', content, ifCorrect: null, ifWrong: null };
}

