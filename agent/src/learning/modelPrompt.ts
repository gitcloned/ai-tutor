/**
 * Build a system-prompt fragment describing the interactive models declared
 * in a plan's preamble (# Models: model-a, model-b).
 *
 * Reads manifests from the local CMS package (same source as CanvasMedium),
 * emitting the same JSON format so the LLM sees consistent, complete manifests.
 * Synchronous — no network calls needed.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';
import { readFileSync }   from 'node:fs';

interface CatalogEntry { id: string; manifest: string; }
interface Catalog { models?: CatalogEntry[]; }

/** Candidate roots for the interactive-models package, checked in order. */
function modelRoots(): string[] {
  return [
    join(process.cwd(), '../cms/packages/resources/interactive-models'),
    join(dirname(fileURLToPath(import.meta.url)), '../../../cms/packages/resources/interactive-models'),
  ];
}

function loadCatalog(): { root: string; entries: CatalogEntry[] } | null {
  for (const root of modelRoots()) {
    try {
      const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')) as Catalog;
      return { root, entries: catalog.models ?? [] };
    } catch { /* try next */ }
  }
  return null;
}

interface ManifestExample { description: string; example: string; }
interface ManifestFile {
  title?:         unknown;
  whenToUse?:     unknown;
  studentEvents?: unknown;
  parameters?:    unknown;
  examples?:      unknown;
}

function readManifest(root: string, manifestPath: string): ManifestFile | null {
  try {
    return JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as ManifestFile;
  } catch { return null; }
}

function formatManifest(id: string, m: ManifestFile): string {
  const lines: string[] = [`### \`${id}\` — ${m.title ?? id}`];

  if (m.whenToUse)
    lines.push(`**Use when:** ${m.whenToUse}`);

  if (Array.isArray(m.studentEvents) && m.studentEvents.length)
    lines.push(`**Student events:** ${(m.studentEvents as string[]).map(e => `\`${e}\``).join(', ')}`);

  if (Array.isArray(m.parameters) && m.parameters.length)
    lines.push(`**Parameters:** ${(m.parameters as string[]).map(p => `\`/${p}\``).join(', ')}`);

  if (Array.isArray(m.examples)) {
    for (const ex of m.examples as ManifestExample[]) {
      lines.push(`**${ex.description}**`);
      lines.push(ex.example);
    }
  }

  return lines.join('\n');
}

/**
 * Returns a markdown prompt fragment listing the manifests for the requested model IDs,
 * or empty string if none are found.
 * Silently skips any model ID not present in the catalog.
 */
export function buildModelPrompt(models: string[]): string {
  if (!models.length) return '';

  const catalog = loadCatalog();
  if (!catalog) return '';

  const sections = models
    .map(id => {
      const entry = catalog.entries.find(e => e.id === id);
      if (!entry) return null;
      const manifest = readManifest(catalog.root, entry.manifest);
      if (!manifest) return null;
      return formatManifest(id, manifest);
    })
    .filter((s): s is string => s !== null);

  if (!sections.length) return '';

  return [
    '## Interactive models available in this lesson',
    ...sections,
  ].join('\n\n');
}
