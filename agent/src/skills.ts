/**
 * Skill loader — mirrors openworker's skills/base.py pattern.
 *
 * Each skill lives in its own folder under /skills with a SKILL.md file:
 *   skills/probing/SKILL.md
 *   skills/teaching/SKILL.md
 *
 * SKILL.md frontmatter:
 *   name:   <skill name>
 *   state:  <concept state this skill handles>
 *   tools:  <comma-separated tool names>
 *
 * Template variables in the body:
 *   {{concept.title}}   {{probingTree}}   {{plan}}   {{memories}}
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ConceptState } from './types.js';
import type { AgentContext } from './context.js';

export interface Skill {
  name:   string;
  state:  ConceptState;
  tools:  string[];
  prompt: (ctx: AgentContext) => string;
}

export class SkillLoader {
  private skills = new Map<ConceptState, Skill>();

  constructor(dir: string) {
    this.load(dir);
  }

  get(state: ConceptState): Skill {
    const skill = this.skills.get(state);
    if (!skill) throw new Error(`No skill registered for state: ${state}`);
    return skill;
  }

  private load(dir: string) {
    for (const folder of readdirSync(dir, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const skillFile = join(dir, folder.name, 'SKILL.md');
      try {
        const skill = parse(readFileSync(skillFile, 'utf8'));
        this.skills.set(skill.state, skill);
      } catch {
        // skip folders without SKILL.md
      }
    }
  }
}

function parse(raw: string): Skill {
  const match = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md missing frontmatter');

  const meta  = parseFrontmatter(match[1]);
  const body  = match[2].trim();

  return {
    name:   meta['name'] ?? 'unnamed',
    state:  meta['state'] as ConceptState,
    tools:  (meta['tools'] ?? '').split(',').map(s => s.trim()).filter(Boolean),
    prompt: (ctx) => render(body, ctx),
  };
}

function parseFrontmatter(block: string): Record<string, string> {
  return Object.fromEntries(
    block.split('\n')
      .map(line => line.split(':').map(s => s.trim()))
      .filter(parts => parts.length >= 2)
      .map(([key, ...rest]) => [key, rest.join(':').trim()])
  );
}

function render(template: string, ctx: AgentContext): string {
  const planLines = ctx.plan.map(s => `[${s.status}] ${s.id}. ${s.content}`).join('\n');
  const memLines  = ctx.memories.length > 0
    ? ctx.memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
    : 'None yet.';

  return template
    .replace('{{concept.title}}', ctx.concept.title)
    .replace('{{probingTree}}',   JSON.stringify(ctx.concept.probingTree ?? {}, null, 2))
    .replace('{{plan}}',          planLines)
    .replace('{{memories}}',      memLines);
}
