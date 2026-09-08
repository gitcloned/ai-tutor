import * as readline from 'readline';
import type { Transport } from '../transport.js';
import type { TurnEvent } from '../engine.js';

type Handler<T> = (arg: T) => void | Promise<void>;

/**
 * StdinTransport — reads from stdin, writes to stdout.
 *
 * Fires 'connected' immediately on start().
 * Fires 'message' on each line of stdin input.
 * Fires 'disconnected' when the user types /exit or closes stdin.
 */
export class StdinTransport implements Transport {
  private messageHandlers:      Handler<string>[] = [];
  private connectedHandlers:    Handler<void>[]   = [];
  private disconnectedHandlers: Handler<void>[]   = [];

  constructor(private readonly studentName: string = 'You') {}

  private rl: readline.Interface | null = null;

  on(event: 'message',      handler: Handler<string>): void;
  on(event: 'connected',    handler: Handler<void>): void;
  on(event: 'disconnected', handler: Handler<void>): void;
  on(event: string, handler: Handler<any>): void {
    if (event === 'message')      this.messageHandlers.push(handler);
    if (event === 'connected')    this.connectedHandlers.push(handler);
    if (event === 'disconnected') this.disconnectedHandlers.push(handler);
  }

  send(event: TurnEvent): void {
    if (event.type === 'text') {
      process.stdout.write(`\nTutor: ${event.content}\n`);
    }
    if (event.type === 'tool_call') {
      process.stdout.write(`  → [${event.name}]\n`);
    }
    if (event.type === 'error') {
      process.stdout.write(`\n[Error] ${event.message}\n`);
    }
  }

  /** Start listening. Call after all handlers are registered. */
  start(): void {
    this.rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });

    const prompt = () => this.rl!.question(`\n${this.studentName}: `, async (input) => {
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
