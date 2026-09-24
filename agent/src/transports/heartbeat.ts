import { WebSocket } from 'ws';

/** Protocol pings are answered by browsers even while the student watches video. */
export function startHeartbeat(ws: WebSocket, report: (message: string) => void) {
  let lastPong = Date.now();
  const pong = () => { lastPong = Date.now(); };
  ws.on('pong', pong);
  const timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastPong >= 75_000) {
      report('Heartbeat timeout: no pong for 75 seconds.');
      ws.terminate();
      stop();
      return;
    }
    ws.ping();
  }, 25_000);
  timer.unref();
  function stop() { clearInterval(timer); ws.off('pong', pong); ws.off('close', stop); }
  ws.once('close', stop);
  return stop;
}
