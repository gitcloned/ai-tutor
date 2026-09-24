import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {WebSocket} from 'ws';
import {startHeartbeat} from '../transports/heartbeat.js';
afterEach(()=>vi.useRealTimers());
function socket(){return Object.assign(new EventEmitter(),{readyState:WebSocket.OPEN,ping:vi.fn(),terminate:vi.fn()});}
it('keeps idle connections alive with pings and cleans up on close',()=>{
  vi.useFakeTimers();const ws=socket();startHeartbeat(ws as unknown as WebSocket,vi.fn());
  for(let i=0;i<12;i++){vi.advanceTimersByTime(25000);ws.emit('pong');}
  expect(ws.ping).toHaveBeenCalledTimes(12);expect(ws.terminate).not.toHaveBeenCalled();
  ws.emit('close');vi.advanceTimersByTime(100000);expect(ws.ping).toHaveBeenCalledTimes(12);expect(ws.listenerCount('pong')).toBe(0);
});
it('reports and terminates an unresponsive connection after grace period',()=>{
  vi.useFakeTimers();const ws=socket(),report=vi.fn();startHeartbeat(ws as unknown as WebSocket,report);
  vi.advanceTimersByTime(74999);expect(ws.terminate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);expect(ws.terminate).toHaveBeenCalledOnce();expect(report).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(100000);expect(ws.terminate).toHaveBeenCalledOnce();
});
