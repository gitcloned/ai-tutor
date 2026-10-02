import {randomBytes,timingSafeEqual} from 'node:crypto';
import { createServer }              from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage }       from 'http';
import { startHeartbeat }             from './heartbeat.js';
import type { Transport, StudentInput } from '../transport.js';
import type { LogEntry }              from '../types.js';
import type { TurnEvent }             from '../engine.js';
import type { BaseMedium }            from '../medium/base.js';
import type { SessionManager }        from '../session-manager.js';

type Handler<T> = (arg: T) => void | Promise<void>;

// ── Per-connection transport ──────────────────────────────────────────────────
// One instance per WebSocket connection. Handed to SessionManager.join().

class PerConnectionTransport implements Transport {
  private messageHandlers:      Handler<StudentInput>[] = [];
  private connectedHandlers:    Handler<void>[]         = [];
  private disconnectedHandlers: Handler<void>[]         = [];

  readonly medium?: BaseMedium;

  constructor(private readonly ws: WebSocket, medium?: BaseMedium) {
    this.medium = medium;
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
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(event));
  }

  onLog(entry: LogEntry): void {
    const colours: Record<string, string> = {
      debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m',
    };
    process.stderr.write(`${colours[entry.level] ?? ''}[${entry.level.toUpperCase()}] ${entry.message}\x1b[0m\n`);
  }

  async fireConnected(): Promise<void> {
    await Promise.all(this.connectedHandlers.map(h => h()));
  }

  async fireMessage(input: StudentInput): Promise<void> {
    for (const h of this.messageHandlers) await h(input);
  }

  fireDisconnected(): void {
    this.disconnectedHandlers.forEach(h => h());
  }
}

// ── Multi-session server ──────────────────────────────────────────────────────

export interface MultiSessionServerOptions {
  port?:   number;
  medium?: () => BaseMedium;  // factory — called once per connection
}

export class MultiSessionServer {
  private readonly port:          number;
  private readonly mediumFactory: (() => BaseMedium) | undefined;

  constructor(opts: MultiSessionServerOptions = {}) {
    this.port          = opts.port   ?? 32004;
    this.mediumFactory = opts.medium;
  }

  start(sm: SessionManager): void {
    const access = new Map<string,{studentId:string;ticket:string}>();
    async function authenticate(req:IncomingMessage,studentId:string){
      const base=process.env.ERP_URL??'http://localhost:32005';
      const response=await fetch(`${base}/me?studentId=${encodeURIComponent(studentId)}`,{headers:{Authorization:req.headers.authorization??''},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Please sign in with access to this student.');
      const user=await response.json() as {studentId?:string};
      if(user.studentId!==studentId)throw new Error('This session belongs to another student.');
    }
    function address(req:IncomingMessage,id:string,ticket:string){const url=new URL(sessionSocketUrl(req,id));url.searchParams.set('ticket',ticket);return url.href;}
    const http = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: sm.size }));
        return;
      }

      if(req.method==='GET'&&req.url?.startsWith('/sessions/')){
        const id=decodeURIComponent(req.url.split('/')[2]);const allowed=access.get(id);
        try{if(!allowed||!sm.isActive(id))throw new Error('Session ended. Start or continue your lesson from Home.');await authenticate(req,allowed.studentId);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sessionId:id,studentId:allowed.studentId,wsUrl:address(req,id,allowed.ticket)}));}
        catch(e){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(e)}));}return;
      }
      if (req.method === 'POST' && req.url === '/sessions') {
        try {
          const body = await readBody(req);
          const { studentId, conceptId, topicId, resumeSessionId } = JSON.parse(body) as {
            studentId?: string; conceptId?: string; topicId?: string; resumeSessionId?: string;
          };
          if (!studentId || !conceptId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'studentId and conceptId are required' }));
            return;
          }

          await authenticate(req,studentId);
          const result  = await sm.create({ studentId, conceptId, topicId, resumeSessionId });
          const ticket=randomBytes(24).toString('base64url');access.set(result.sessionId,{studentId,ticket});
          const agent   = sm.getAgent(result.sessionId);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            sessionId: result.sessionId,
            resumed:   result.resumed,
            wsUrl:     address(req, result.sessionId,ticket),
            concept:   agent?.ctx?.concept
              ? { id: agent.ctx.concept.id, title: agent.ctx.concept.title }
              : null,
            state: agent?.ctx?.journeyNode?.state ?? null,
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    const wss = new WebSocketServer({ server: http });

    wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      const url       = new URL(req.url ?? '/', 'http://x');
      const sessionId = url.searchParams.get('sessionId');

      const allowed=sessionId?access.get(sessionId):null;
      const ticket=url.searchParams.get('ticket')??'';
      if (!sessionId || !allowed || ticket.length!==allowed.ticket.length || !timingSafeEqual(Buffer.from(ticket),Buffer.from(allowed.ticket)) || !sm.isActive(sessionId)) {
        ws.close(1008, 'Unknown or expired session');
        return;
      }

      const connectedAt = Date.now();
      process.stdout.write(`[WS] connected  session=${sessionId}\n`);
      startHeartbeat(ws, msg => process.stderr.write(`[WS ${new Date().toISOString()}] ${msg}\n`));

      const medium    = this.mediumFactory?.();
      const transport = new PerConnectionTransport(ws, medium);

      ws.on('message', async (data: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          transport.handle({ type: 'error', message: 'Invalid JSON from client' });
          return;
        }

        if (msg !== null && typeof msg === 'object' && (msg as any).type === 'message') {
          const raw = msg as any;
          const input: StudentInput = {
            activity: raw.activity ?? undefined,
            text:     typeof raw.text === 'string' ? raw.text.trim() || undefined : undefined,
            audio:    raw.audio  ?? undefined,
            images:   Array.isArray(raw.images) && raw.images.length ? raw.images : undefined,
          };
          if (input.text || input.audio || input.images || input.activity) {
            await transport.fireMessage(input).catch(err =>
              transport.handle({ type: 'error', message: String(err) })
            );
          }
        }
      });

      ws.on('close', (code, reason) => {
        process.stdout.write(
          `[WS] disconnected session=${sessionId} code=${code} reason=${reason.toString()} connectedMs=${Date.now() - connectedAt}\n`
        );
        transport.fireDisconnected();
      });

      ws.on('error', (err: Error) => {
        process.stderr.write(`[WS] error: ${err.message}\n`);
        transport.handle({ type: 'error', message: err.message });
      });

      try {
        await sm.join(sessionId, transport);
        await transport.fireConnected();
      } catch (err) {
        transport.handle({ type: 'error', message: String(err) });
        ws.close(1011, 'Session join failed');
      }
    });

    wss.on('error', (err: Error) => {
      process.stderr.write(`[WS server error] ${err.message}\n`);
    });

    http.listen(this.port, () => {
      process.stdout.write(`\nProdigy agent server\n`);
      process.stdout.write(`  HTTP  http://localhost:${this.port}\n`);
      process.stdout.write(`  WS    ws://localhost:${this.port}\n\n`);
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Public tunnel URL wins; otherwise match the browser-facing request origin. */
export function sessionSocketUrl(req: IncomingMessage, sessionId: string): string {
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const base = process.env.PUBLIC_AGENT_URL ?? `${forwarded === 'https' ? 'https' : 'http'}://${req.headers.host ?? 'localhost:32004'}`;
  const url = new URL(base);
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  url.searchParams.set('sessionId', sessionId);
  return url.href;
}
