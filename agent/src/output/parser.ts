import type { TurnEvent } from '../engine.js';
import type { BaseOutput } from './base.js';
import type { BaseModality } from './modalities/base.js';

/**
 * Parser — transforms raw LLM text_chunk / text events into typed output events.
 *
 * Constructed with an output instance that defines which modalities (keys) are active.
 * One instance per transport connection — stateful, reset between turns via end().
 *
 * ## Parsing rules
 *
 * Top-level key line: `^<key>:\s?<rest>` — switches the active modality.
 * Attribute line:     `^/<key>:\s?<value>` — adds to the current block's attrs dict.
 * Any other line:     forwarded to the active modality's handle().
 *
 * Example LLM output:
 *   speak: Let's look at this.
 *   draw:
 *   <svg viewBox="0 0 400 300">...</svg>
 *   /position: 400,200
 *   /anchor: center
 *   ask: What type of shape is this?
 *
 * Attrs are collected throughout the block and passed to modality.end(attrs) when
 * the block closes (next key or stream end). Attr order relative to content doesn't matter.
 *
 * Non-text events (tool_call, action, error, etc.) pass through unchanged.
 */
const PARALLEL_MAX_BLOCKS = 4;

export class Parser {
  private lineBuffer = '';
  private currentModality: BaseModality | null = null;
  private currentAttrs: Record<string, string> = {};
  private inParallel = false;
  private parallelBlockCount = 0;

  constructor(private readonly output: BaseOutput) {}

  async *parse(event: TurnEvent): AsyncGenerator<TurnEvent> {
    // DefaultOutput has no modalities — pass everything through unchanged
    if (this.output.modalities.size === 0) {
      yield event;
      return;
    }

    if (event.type === 'text_chunk') {
      yield* this.feed(event.content);
    } else if (event.type === 'text') {
      yield* this.flush();
    } else {
      yield event;
    }
  }

  private async *feed(chunk: string): AsyncGenerator<TurnEvent> {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop()!;

    for (const line of lines) {
      yield* this.processLine(line + '\n');
    }
  }

  private async *flush(): AsyncGenerator<TurnEvent> {
    if (this.lineBuffer) {
      yield* this.processLine(this.lineBuffer);
      this.lineBuffer = '';
    }
    if (this.currentModality) {
      yield* this.currentModality.end(this.currentAttrs);
      this.currentModality = null;
      this.currentAttrs = {};
    }
  }

  private async *closeParallel(): AsyncGenerator<TurnEvent> {
    this.inParallel = false;
    this.parallelBlockCount = 0;
    yield { type: 'action', action: { type: 'parallel-end' } };
  }

  private async *processLine(line: string): AsyncGenerator<TurnEvent> {
    // Attribute line: /key: value — attach to current block, not forwarded as content
    const attrMatch = line.match(/^\/([a-z_]+):\s?(.*)\n?$/);
    if (attrMatch) {
      if (this.currentModality) {
        this.currentAttrs[attrMatch[1]] = attrMatch[2].trim();
      }
      return;
    }

    // Parallel control lines — structural, not modality keys
    if (/^parallel:start\s*\n?$/.test(line)) {
      if (!this.inParallel) {
        this.inParallel = true;
        this.parallelBlockCount = 0;
        yield { type: 'action', action: { type: 'parallel-start' } };
      }
      return;
    }
    if (/^parallel:end\s*\n?$/.test(line)) {
      if (this.inParallel) yield* this.closeParallel();
      // stray parallel:end outside a parallel block → silently ignore
      return;
    }

    // Modality key line: key: <rest>
    const keyMatch = line.match(/^([a-z_]+):\s?([\s\S]*)\n?$/);
    const modality = keyMatch ? this.output.modalities.get(keyMatch[1]) : null;

    if (modality) {
      if (this.currentModality) {
        yield* this.currentModality.end(this.currentAttrs);
        this.currentAttrs = {};
      }
      this.currentModality = modality;

      // Count blocks inside a parallel zone; auto-close at the limit
      if (this.inParallel) {
        this.parallelBlockCount++;
        if (this.parallelBlockCount >= PARALLEL_MAX_BLOCKS) {
          yield* this.closeParallel();
        }
      }

      const rest = keyMatch![2];
      if (rest) yield* modality.handle(rest + '\n');
    } else if (this.currentModality) {
      yield* this.currentModality.handle(line);
    }
    // Lines before the first key are silently ignored
  }
}
