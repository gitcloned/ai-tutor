import type { AgentContext } from '../context.js';

// ── Tool type ──────────────────────────────────────────────────────────────────

export interface Tool {
  name:        string;
  description: string;
  schema:      Record<string, unknown>;  // JSON Schema for the parameters
  run:         (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
}

// ── Registry ───────────────────────────────────────────────────────────────────

export class ToolRegistry {
  private map = new Map<string, Tool>();

  add(...tools: Tool[]): this {
    tools.forEach(t => this.map.set(t.name, t));
    return this;
  }

  get(name: string): Tool | undefined {
    return this.map.get(name);
  }

  // Returns only the tools declared by the active skill
  forSkill(names: string[]): Tool[] {
    return names.map(n => {
      const t = this.map.get(n);
      if (!t) throw new Error(`Tool not registered: ${n}`);
      return t;
    });
  }

  // All tools as Anthropic tool definitions
  toAnthropicFormat(names: string[]): object[] {
    return this.forSkill(names).map(t => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.schema,
    }));
  }
}
