import type { TurnEvent }        from '../../../engine.js';
import type { BaseMedium }       from '../../base.js';
import type { BaseOutputModality } from './base.js';

/**
 * OutputParser — transforms raw LLM text_chunk / text events into typed output events.
 *
 * Constructed with a medium that defines which output modality keys are active.
 * One instance per transport connection — stateful, reset between turns via end().
 *
 * ## Parsing rules
 *
 * Top-level key line: `^<key>:\s?<rest>` — switches the active modality.
 * Attribute line:     `^/<key>:\s?<value>` — adds to the current block's attrs dict.
 * Any other line:     forwarded to the active modality's handle().
 *
 * Non-text events (tool_call, action, error, etc.) pass through unchanged.
 */
const PARALLEL_MAX_BLOCKS = 4;

export class OutputParser {
  private lineBuffer = '';
  private currentModality: BaseOutputModality | null = null;
  private currentAttrs: Record<string, string> = {};
  private inParallel = false;
  private parallelBlockCount = 0;

  constructor(private readonly medium: BaseMedium) {}

  async *parse(event: TurnEvent): AsyncGenerator<TurnEvent> {
    // No output modalities — pass everything through unchanged
    if (this.medium.outputModalities.size === 0) {
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
    const attrMatch = line.match(/^\/([a-z_][a-z0-9_-]*):\s?(.*)\n?$/);
    if (attrMatch) {
      if (this.currentModality) {
        this.currentAttrs[attrMatch[1]] = attrMatch[2].trim();
      }
      return;
    }

    if (/^parallel:start\s*\n?$/.test(line)) {
      yield* this.endBlock();
      if (!this.inParallel) {
        this.inParallel = true;
        this.parallelBlockCount = 0;
        yield { type: 'action', action: { type: 'parallel-start' } };
      }
      return;
    }
    if (/^parallel:end\s*\n?$/.test(line)) {
      yield* this.endBlock();
      if (this.inParallel) yield* this.closeParallel();
      return;
    }

    const keyMatch = line.match(/^([a-z_][a-z0-9_]*):\s?([\s\S]*)\n?$/);
    if (keyMatch?.[1] === 'parallel' && (keyMatch[2].trim() === 'start' || keyMatch[2].trim() === 'end')) {
      yield { type: 'action', action: { type: `parallel-${keyMatch[2].trim()}` } };
      return;
    }
    const modality = keyMatch ? this.medium.outputModalities.get(keyMatch[1]) : null;

    if (modality) {
      if (this.currentModality) {
        yield* this.currentModality.end(this.currentAttrs);
        this.currentAttrs = {};
      }
      this.currentModality = modality;

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
  }

  private async *endBlock(): AsyncGenerator<TurnEvent> {
    if (this.currentModality) yield* this.currentModality.end(this.currentAttrs);
    this.currentModality = null;
    this.currentAttrs = {};
  }
}
