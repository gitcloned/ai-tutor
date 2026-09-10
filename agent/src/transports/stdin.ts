import * as readline from 'readline';
import type { Transport } from '../transport.js';
import type { LogEntry, LogLevel } from '../types.js';
import type { TurnEvent } from '../engine.js';

type Handler<T> = (arg: T) => void | Promise<void>;

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

export interface StdinTransportOptions {
  studentName?: string;
  logLevel?: LogLevel | 'none';
  hideToolCalls?: boolean;
}

/**
 * StdinTransport — reads from stdin, writes to stdout.
 *
 * Fires 'connected' immediately on start().
 * Fires 'message' on each line of stdin input.
 * Fires 'disconnected' when the user types /exit or closes stdin.
 */
export class StdinTransport implements Transport {
  private messageHandlers: Handler<string>[] = [];
  private connectedHandlers: Handler<void>[] = [];
  private disconnectedHandlers: Handler<void>[] = [];

  private readonly studentName: string;
  private readonly logLevel: LogLevel | 'none';
  private readonly hideToolCalls: boolean;

  constructor(opts: StdinTransportOptions = {}) {
    this.studentName = opts.studentName ?? 'You';
    this.logLevel = opts.logLevel ?? 'debug';
    this.hideToolCalls = opts.hideToolCalls ?? false;
  }

  private rl: readline.Interface | null = null;
  private pendingAutoSend = false;
  private streamingActive = false;

  on(event: 'message', handler: Handler<string>): void;
  on(event: 'connected', handler: Handler<void>): void;
  on(event: 'disconnected', handler: Handler<void>): void;
  on(event: string, handler: Handler<any>): void {
    if (event === 'message') this.messageHandlers.push(handler);
    if (event === 'connected') this.connectedHandlers.push(handler);
    if (event === 'disconnected') this.disconnectedHandlers.push(handler);
  }

  handle(event: TurnEvent): void {
    if (event.type === 'text_chunk') {
      if (!this.streamingActive) {
        process.stdout.write(`\nTutor: `);
        this.streamingActive = true;
      }
      process.stdout.write(event.content);
      return;
    }
    if (event.type === 'text') {
      if (this.streamingActive) {
        process.stdout.write('\n');
        this.streamingActive = false;
      } else {
        process.stdout.write(`\nTutor: ${event.content}\n`);
      }
      return;
    }
    if (event.type === 'tool_call' && !this.hideToolCalls) {
      process.stdout.write(`  → [${event.name}] ${JSON.stringify(event.args ?? {})}\n`);
    }
    if (event.type === 'error') {
      process.stdout.write(`\n[Error] ${event.message}\n`);
    }
    if (event.type === 'action' && (event.action as any)?.type === 'send-ok') {
      this.pendingAutoSend = true;
    }
  }

  onLog(entry: LogEntry): void {
    if (LOG_LEVELS[entry.level] < LOG_LEVELS[this.logLevel]) return;

    const colour: Record<string, string> = {
      debug: '\x1b[90m',   // gray
      info: '\x1b[36m',   // cyan
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m',   // red
    };
    const reset = '\x1b[0m';
    const c = colour[entry.level] ?? '';
    process.stderr.write(`${c}[${entry.level.toUpperCase()}] ${entry.message}${reset}\n`);
  }

  /** Start listening. Call after all handlers are registered. */
  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => this.rl!.question(`\n${this.studentName}: `, async (input: string) => {
      const text = input.trim();

      if (!text || text === '/exit') {
        this.disconnectedHandlers.forEach(h => h());
        this.rl!.close();
        return;
      }

      // Await all message handlers before re-prompting so agent response
      // prints before the next input prompt appears
      for (const h of this.messageHandlers) {
        await h(text);
      }

      // If the turn signalled send-ok, auto-advance without user input
      if (this.pendingAutoSend) {
        this.pendingAutoSend = false;
        for (const h of this.messageHandlers) {
          process.stdout.write(`\n[Action] Sending auto ok\n`);
          await h('Ok');
        }
      }

      prompt();
    });

    this.rl.on('close', () => {
      this.disconnectedHandlers.forEach(h => h());
    });

    // Fire connected handlers and wait for them to finish (agent speaks first),
    // then open the input prompt.
    Promise.all(this.connectedHandlers.map(h => h()))
      .catch(err => process.stdout.write(`\n[Error] ${err}\n`))
      .finally(() => prompt());
  }
}
