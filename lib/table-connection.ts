import type { GameView } from './game.ts';

export type TableView = Omit<GameView, 'players'> & {
  players: (GameView['players'][number] & { connected: boolean })[];
};

export type TableMessage =
  | { type: 'ready' }
  | { type: 'state'; view: TableView }
  | { type: 'result'; requestId: string; data: TableResult }
  | { type: 'rejected'; requestId: string; status: number; error: string }
  | { type: 'pong' }
  | { type: 'error'; status: number; error: string };

export type TableResult = TableView | { left: true };

type Options = {
  code?: string;
  receive: (view: TableView) => void;
  status: (connected: boolean) => void;
  expired: (message: string, status: number) => void;
};

// No moves are replayed on reconnect. Every new connection gets a full,
// authenticated snapshot, including moves whose acknowledgement was lost.
export function connectTable({ code, receive, status, expired }: Options) {
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let attempts = 0;
  let lastReceived = 0;
  let openedAt = 0;
  let ready = false;
  const pending = new Map<
    string,
    {
      resolve: (result: TableResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function detach() {
    const previous = socket;
    socket = undefined;
    ready = false;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new Error(
          'Connection interrupted. Check the restored table before trying again.',
        ),
      );
    }
    pending.clear();
    if (watchdog) clearInterval(watchdog);
    if (previous) {
      previous.onopen =
        previous.onmessage =
        previous.onerror =
        previous.onclose =
          null;
      previous.close();
    }
  }

  function reconnect(immediate = false) {
    if (retry) clearTimeout(retry);
    detach();
    status(false);
    if (stopped || document.hidden || navigator.onLine === false) return;
    const delay = immediate
      ? 0
      : Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5));
    retry = setTimeout(open, delay);
  }

  function send(type: 'ping' | 'sync') {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type }));
      } catch {
        reconnect();
      }
    }
  }

  function open() {
    if (stopped || document.hidden || navigator.onLine === false) return;
    const url = new URL('/api/table/live', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (code) url.searchParams.set('code', code);
    openedAt = lastReceived = Date.now();
    let current: WebSocket;
    try {
      current = new WebSocket(url);
    } catch {
      reconnect();
      return;
    }
    socket = current;
    current.onopen = () => send('sync');
    current.onmessage = (event) => {
      if (socket !== current || stopped) return;
      try {
        const message = JSON.parse(event.data) as TableMessage;
        if (message.type === 'ready') {
          if (code) throw new Error('Missing restored table');
          ready = true;
          attempts = 0;
          status(true);
        } else if (message.type === 'state') {
          if (message.view.code !== code) throw new Error('Wrong table');
          receive(message.view);
          ready = true;
          attempts = 0;
          status(true);
        } else if (message.type === 'result' || message.type === 'rejected') {
          const request = pending.get(message.requestId);
          if (!request) return;
          clearTimeout(request.timer);
          pending.delete(message.requestId);
          if (message.type === 'rejected') {
            request.reject(
              Object.assign(new Error(message.error), {
                status: message.status,
              }),
            );
          } else {
            code = 'left' in message.data ? undefined : message.data.code;
            request.resolve(message.data);
          }
        } else if (message.type === 'error') {
          if ([400, 401, 403, 404].includes(message.status)) {
            code = undefined;
            detach();
            status(false);
            expired(message.error, message.status);
            reconnect(true);
            return;
          }
          reconnect();
          return;
        } else if (message.type !== 'pong') {
          throw new Error('Unexpected table message');
        }
        lastReceived = Date.now();
      } catch {
        reconnect();
      }
    };
    current.onerror = () => {
      if (socket === current) reconnect();
    };
    current.onclose = () => {
      if (socket === current) reconnect();
    };
    watchdog = setInterval(() => {
      const now = Date.now();
      if ((!ready && now - openedAt >= 8_000) || now - lastReceived >= 20_000)
        reconnect(true);
      else send('ping');
    }, 5_000);
  }

  function resume() {
    if (stopped || document.hidden) return;
    if (!socket || Date.now() - lastReceived >= 15_000) reconnect(true);
    else send('sync');
  }
  function visibility() {
    if (document.hidden) {
      if (retry) clearTimeout(retry);
      detach();
      status(false);
    } else resume();
  }
  function offline() {
    reconnect();
  }
  function stop() {
    stopped = true;
    if (retry) clearTimeout(retry);
    detach();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', resume);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', offline);
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  status(false);
  open();
  function request(input: Record<string, unknown>): Promise<TableResult> {
    if (stopped || !ready || socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(
        new Error('Reconnecting to the table. Try again when connected.'),
      );
    if (pending.size)
      return Promise.reject(
        new Error('Wait for your previous command to finish.'),
      );
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            'The command was not confirmed. Check the restored table before trying again.',
          ),
        );
        reconnect(true);
      }, 8_000);
      pending.set(requestId, { resolve, reject, timer });
      try {
        socket!.send(
          JSON.stringify({
            type: 'command',
            requestId,
            input: { ...input, requestId },
          }),
        );
      } catch {
        reconnect();
      }
    });
  }
  return { stop, sync: resume, request };
}
