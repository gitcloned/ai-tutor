import { createServer }              from 'http';
import { readFileSync }              from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Transport, StudentInput } from '../transport.js';
import type { LogEntry, LogLevel }      from '../types.js';
import type { TurnEvent }               from '../engine.js';
import type { BaseMedium }              from '../medium/base.js';

type Handler<T> = (arg: T) => void | Promise<void>;

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

export interface WebSocketTransportOptions {
  port?:      number;
  logLevel?:  LogLevel | 'none';
  medium?:    BaseMedium;
  /** Path to an HTML file to serve at GET / (e.g. the test page). */
  serveHtml?: string;
}

/**
 * WebSocketTransport — listens for one WebSocket client at a time.
 *
 * Client → server messages:   { type: 'message', text?, audio?, images? }
 * Server → client events:     JSON-serialised TurnEvent
 */
export class WebSocketTransport implements Transport {
  private messageHandlers:      Handler<StudentInput>[] = [];
  private connectedHandlers:    Handler<void>[]         = [];
  private disconnectedHandlers: Handler<void>[]         = [];

  private readonly port:      number;
  private readonly logLevel:  LogLevel | 'none';
  private readonly serveHtml: string | undefined;
  readonly medium?: BaseMedium;

  private socket: WebSocket | null = null;

  constructor(opts: WebSocketTransportOptions = {}) {
    this.port      = opts.port      ?? 32004;
    this.logLevel  = opts.logLevel  ?? 'info';
    this.medium    = opts.medium;
    this.serveHtml = opts.serveHtml;
  }

  on(event: 'message',      handler: Handler<StudentInput>): void;
  on(event: 'connected',    handler: Handler<void>):         void;
  on(event: 'disconnected', handler: Handler<void>):         void;
  on(event: string, handler: Handler<any>): void {
    if (event === 'message')      this.messageHandlers.push(handler);
    if (event === 'connected')    this.connectedHandlers.push(handler);
    if (event === 'disconnected') this.disconnectedHandlers.push(handler);
  }

  handle(event: TurnEvent): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(event));
  }

  onLog(entry: LogEntry): void {
    if (LOG_LEVELS[entry.level] < LOG_LEVELS[this.logLevel]) return;
    const colour: Record<string, string> = {
      debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const c = colour[entry.level] ?? '';
    process.stderr.write(`${c}[${entry.level.toUpperCase()}] ${entry.message}${reset}\n`);
  }

  start(): void {
    const htmlContent = this.serveHtml ? readFileSync(this.serveHtml, 'utf8') : null;

    const http = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        if (htmlContent) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(htmlContent);
        } else {
          res.writeHead(204);
          res.end();
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    const wss = new WebSocketServer({ server: http });

    http.listen(this.port, () => {
      if (htmlContent) {
        process.stdout.write(`\nTest page : http://localhost:${this.port}\n`);
      }
      process.stdout.write(`WebSocket : ws://localhost:${this.port}\n`);
      process.stdout.write(`Waiting for client…\n`);
    });

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      if (this.socket) {
        ws.close(1008, 'Session already active');
        return;
      }

      this.socket = ws;
      process.stdout.write('Client connected.\n');

      Promise.all(this.connectedHandlers.map(h => h()))
        .catch(err => this.handle({ type: 'error', message: String(err) }));

      ws.on('message', async (data: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          this.handle({ type: 'error', message: 'Invalid JSON from client' });
          return;
        }

        if (msg !== null && typeof msg === 'object' && (msg as any).type === 'message') {
          const raw = msg as any;
          const input: StudentInput = {
            activity: raw.activity ?? undefined,
            text:   typeof raw.text   === 'string' ? raw.text.trim() || undefined : undefined,
            audio:  raw.audio  ?? undefined,
            images: Array.isArray(raw.images) && raw.images.length ? raw.images : undefined,
          };
          if (input.text || input.audio || input.images || input.activity) {
            for (const h of this.messageHandlers) await h(input);
          }
        }
      });

      ws.on('close', () => {
        this.socket = null;
        process.stdout.write('Client disconnected.\n');
        this.disconnectedHandlers.forEach(h => h());
      });

      ws.on('error', (err: Error) => {
        this.handle({ type: 'error', message: err.message });
      });
    });

    wss.on('error', (err: Error) => {
      process.stderr.write(`[WebSocket server error] ${err.message}\n`);
    });
  }
}
