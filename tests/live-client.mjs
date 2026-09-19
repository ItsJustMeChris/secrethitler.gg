import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

// Real authenticated socket, with the same heartbeat/reconnect behavior as a
// browser. Used by HTTP integration suites so their rooms are actually occupied.
export function liveClient(base, cookie, code) {
  let stopped = false;
  let socket;
  let retry;
  let heartbeat;
  const messages = [];
  let failure;
  function open() {
    const url = new URL('/api/table/live', base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (code) url.searchParams.set('code', code);
    socket = new WebSocket(url, {
      headers: { Cookie: cookie, Origin: new URL(base).origin },
    });
    socket.on('upgrade', (response) => {
      const value = response.headers['set-cookie']?.find((c) =>
        c.startsWith('sh_session='),
      );
      if (value) cookie = value.split(';')[0];
    });
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'sync' }));
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: 'ping' }));
      }, 5_000);
    });
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      messages.push(message);
      if (message.type === 'result')
        code = message.data.left ? undefined : message.data.code;
      if (message.type === 'error')
        failure = new Error(`Socket ${message.status}: ${message.error}`);
    });
    socket.on('error', (error) => {
      failure = error;
    });
    socket.on('close', () => {
      clearInterval(heartbeat);
      if (!stopped && !failure) retry = setTimeout(open, 100);
    });
  }
  open();
  return {
    messages,
    get cookie() {
      return cookie;
    },
    get socket() {
      return socket;
    },
    async wait(predicate, timeout = 10_000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const result = messages.find(predicate);
        if (result) return result;
        if (failure) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Timed out waiting for a WebSocket update.');
    },
    async request(input, requestId = randomUUID()) {
      const from = messages.length;
      socket.send(JSON.stringify({ type: 'command', requestId, input }));
      const end = Date.now() + 10_000;
      while (Date.now() < end) {
        const result = messages
          .slice(from)
          .find((m) => m.requestId === requestId);
        if (result?.type === 'rejected')
          throw Object.assign(new Error(result.error), {
            status: result.status,
          });
        if (result?.type === 'result') return result.data;
        if (failure) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Socket command timed out');
    },
    close() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket.close();
    },
  };
}
