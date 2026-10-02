import {afterEach,describe,expect,it} from 'vitest';
import type {IncomingMessage} from 'http';
import {sessionSocketUrl} from '../transports/ws-multi.js';
const original=process.env.PUBLIC_AGENT_URL;
afterEach(()=>{if(original===undefined)delete process.env.PUBLIC_AGENT_URL;else process.env.PUBLIC_AGENT_URL=original;});
describe('session socket address',()=>{
  it('uses the requested local host',()=>{
    delete process.env.PUBLIC_AGENT_URL;
    expect(sessionSocketUrl({headers:{host:'10.0.0.12:32004'}} as unknown as IncomingMessage,'session-1')).toBe('ws://10.0.0.12:32004/?sessionId=session-1');
  });
  it('uses secure sockets behind an HTTPS proxy',()=>{
    delete process.env.PUBLIC_AGENT_URL;
    expect(sessionSocketUrl({headers:{host:'tutor.example.com','x-forwarded-proto':'https, http'}} as unknown as IncomingMessage,'session-2')).toBe('wss://tutor.example.com/?sessionId=session-2');
  });
  it('respects the configured public address and preserves its query',()=>{
    process.env.PUBLIC_AGENT_URL='https://tutor.example.com/socket?source=web';
    expect(sessionSocketUrl({headers:{host:'localhost:32004'}} as unknown as IncomingMessage,'session-3')).toBe('wss://tutor.example.com/socket?source=web&sessionId=session-3');
  });
});
