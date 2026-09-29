import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { connectTable, type TableView } from '../lib/table-connection.ts';
import { connectPolling } from '../lib/table-polling.ts';

function browser(
  t: TestContext,
  polling = false,
  code: string | undefined = 'ABCDEFGH',
) {
  t.mock.timers.enable({
    apis: ['Date', 'setTimeout', 'setInterval'],
    now: 100_000,
  });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  const nav = { onLine: true };
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onclose: ((event?: { code: number; reason: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    url: URL;
    constructor(url: URL) {
      this.url = url;
      sockets.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close(code = 1006, reason = '') {
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    message(message: unknown) {
      this.onmessage?.({ data: JSON.stringify(message) });
    }
  }
  const requests: {
    input: Record<string, unknown>;
    signal?: AbortSignal | null;
    respond: (data: unknown, status?: number) => void;
    fail: (error?: Error) => void;
  }[] = [];
  const values = {
    document: doc,
    window: win,
    navigator: nav,
    location: { href: 'https://table.test/' },
    WebSocket: FakeSocket,
    fetch: (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
        requests.push({
          input: JSON.parse(init.body as string),
          signal: init.signal,
          respond: (data, status = 200) =>
            resolve(Response.json(data, { status })),
          fail: (error = new Error('Network unavailable')) => reject(error),
        });
      }),
  };
  const restores: (() => void)[] = [];
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restores.push(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const views: TableView[] = [];
  const statuses: boolean[] = [];
  const errors: string[] = [];
  const connection = (polling ? connectPolling : connectTable)({
    code,
    receive: (view) => views.push(view),
    status: (value) => statuses.push(value),
    expired: (error) => errors.push(error),
  });
  t.after(() => {
    connection.stop();
    for (const restore of restores) restore();
  });
  return {
    doc,
    win,
    nav,
    sockets,
    requests,
    views,
    statuses,
    errors,
    connection,
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

void test('socket needs an authenticated snapshot; reconnect restores without replaying moves', (t) => {
  const b = browser(t);
  b.sockets[0].open();
  assert.equal(b.statuses.at(-1), false);
  b.sockets[0].message({
    type: 'state',
    view: { code: 'ABCDEFGH', revision: 8 },
  });
  assert.equal(b.statuses.at(-1), true);
  b.sockets[0].close();
  assert.equal(b.statuses.at(-1), false);
  t.mock.timers.tick(500);
  b.sockets[1].open();
  b.sockets[1].message({
    type: 'state',
    view: { code: 'ABCDEFGH', revision: 10 },
  });
  assert.equal(b.views.at(-1)?.revision, 10);
  assert.ok(
    b.sockets
      .flatMap((s) => s.sent)
      .every((data) => ['sync', 'ping'].includes(JSON.parse(data).type)),
  );
});

void test('silent sockets restart; hidden tabs disconnect and resync on return', (t) => {
  const b = browser(t);
  b.sockets[0].open();
  b.sockets[0].message({ type: 'state', view: { code: 'ABCDEFGH' } });
  t.mock.timers.tick(20_000);
  t.mock.timers.tick(1);
  assert.equal(b.sockets[0].readyState, 3);
  assert.equal(b.sockets.length, 2);
  b.doc.hidden = true;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(b.sockets[1].readyState, 3);
  t.mock.timers.tick(60_000);
  assert.equal(b.sockets.length, 2);
  b.doc.hidden = false;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(1);
  assert.equal(b.sockets.length, 3);
});

void test('offline recovery and closed-room errors return to an unbound socket; stopping removes listeners', (t) => {
  const b = browser(t);
  b.nav.onLine = false;
  b.win.dispatchEvent(new Event('offline'));
  t.mock.timers.tick(20_000);
  assert.equal(b.sockets.length, 1);
  b.nav.onLine = true;
  b.win.dispatchEvent(new Event('online'));
  t.mock.timers.tick(1);
  assert.equal(b.sockets.length, 2);
  b.sockets[1].open();
  b.sockets[1].message({ type: 'error', status: 404, error: 'Table closed.' });
  assert.deepEqual(b.errors, ['Table closed.']);
  assert.equal(b.statuses.at(-1), false);
  t.mock.timers.tick(1);
  assert.equal(b.sockets.length, 3);
  assert.equal(b.sockets[2].url.searchParams.has('code'), false);
  b.sockets[2].open();
  b.sockets[2].message({ type: 'ready' });
  assert.equal(b.statuses.at(-1), true);
  b.connection.stop();
  b.win.dispatchEvent(new Event('focus'));
  t.mock.timers.tick(60_000);
  assert.equal(b.sockets.length, 3);
});

void test('commands correlate acknowledgements and rule rejections without disconnecting', async (t) => {
  const b = browser(t);
  b.sockets[0].open();
  b.sockets[0].message({ type: 'state', view: { code: 'ABCDEFGH' } });
  const pending = b.connection.request({
    operation: 'action',
    action: { type: 'ready' },
  });
  const command = JSON.parse(b.sockets[0].sent.at(-1)!);
  assert.equal(command.type, 'command');
  assert.equal(command.input.requestId, command.requestId);
  b.sockets[0].message({
    type: 'result',
    requestId: command.requestId,
    data: { code: 'ABCDEFGH', revision: 9 },
  });
  assert.equal(((await pending) as TableView).revision, 9);
  const rejected = b.connection.request({
    operation: 'action',
    action: { type: 'start' },
  });
  const rejection = assert.rejects(rejected, /Only the host/);
  const next = JSON.parse(b.sockets[0].sent.at(-1)!);
  b.sockets[0].message({
    type: 'rejected',
    requestId: next.requestId,
    status: 400,
    error: 'Only the host can start.',
  });
  await rejection;
  assert.equal(b.statuses.at(-1), true);
});

void test('lost acknowledgements time out and reconnect without replaying the mutation', async (t) => {
  const b = browser(t);
  b.sockets[0].open();
  b.sockets[0].message({ type: 'state', view: { code: 'ABCDEFGH' } });
  const pending = b.connection.request({
    operation: 'action',
    action: { type: 'vote', yes: true },
  });
  const rejected = assert.rejects(pending, /not confirmed/);
  t.mock.timers.tick(8_000);
  await rejected;
  t.mock.timers.tick(1);
  assert.equal(b.sockets.length, 2);
  b.sockets[1].open();
  b.sockets[1].message({
    type: 'state',
    view: { code: 'ABCDEFGH', revision: 12 },
  });
  assert.equal(
    b.sockets[1].sent.some((frame) => JSON.parse(frame).type === 'command'),
    false,
  );
  const leaving = b.connection.request({
    operation: 'action',
    action: { type: 'leave' },
  });
  const id = JSON.parse(b.sockets[1].sent.at(-1)!).requestId;
  b.sockets[1].message({ type: 'result', requestId: id, data: { left: true } });
  assert.deepEqual(await leaving, { left: true });
  b.sockets[1].close();
  t.mock.timers.tick(500);
  assert.equal(b.requests[0].input.operation, 'sync');
  assert.equal(b.requests[0].input.code, undefined);
});

void test('disconnect rejects an in-flight command immediately and the recovered socket accepts the next command', async (t) => {
  const b = browser(t);
  b.sockets[0].open();
  b.sockets[0].message({ type: 'state', view: { code: 'ABCDEFGH' } });
  const pending = b.connection.request({
    operation: 'action',
    action: { type: 'vote', yes: true },
  });
  const rejection = assert.rejects(pending, /Connection interrupted/);
  b.sockets[0].close();
  await rejection;
  t.mock.timers.tick(500);
  b.sockets[1].open();
  b.sockets[1].message({
    type: 'state',
    view: { code: 'ABCDEFGH', revision: 12 },
  });
  const next = b.connection.request({
    operation: 'action',
    action: { type: 'chat', text: 'Back' },
  });
  const id = JSON.parse(b.sockets[1].sent.at(-1)!).requestId;
  b.sockets[1].message({
    type: 'result',
    requestId: id,
    data: { code: 'ABCDEFGH', revision: 13 },
  });
  assert.equal(((await next) as TableView).revision, 13);
});

void test('repeated socket failures switch to HTTP and stop creating sockets', async (t) => {
  const b = browser(t);
  b.sockets[0].close();
  t.mock.timers.tick(500);
  b.sockets[1].close();
  assert.equal(b.requests.length, 1);
  assert.equal(b.requests[0].input.operation, 'sync');
  b.requests[0].respond({ code: 'ABCDEFGH', revision: 8 });
  await flush();
  assert.equal(b.statuses.at(-1), true);
  assert.equal(b.views.at(-1)?.revision, 8);
  t.mock.timers.tick(750);
  assert.equal(b.requests.length, 2);
  assert.equal(b.sockets.length, 2);
});

void test('planned session renewal uses HTTP without flashing reconnecting or reopening sockets', async (t) => {
  const b = browser(t);
  b.sockets[0].open();
  b.sockets[0].message({
    type: 'state',
    view: { code: 'ABCDEFGH', revision: 3 },
  });
  b.sockets[0].close(1001, 'Reconnect to refresh session');
  assert.equal(b.statuses.at(-1), true);
  b.requests[0].respond({ code: 'ABCDEFGH', revision: 4 });
  await flush();
  assert.equal(b.views.at(-1)?.revision, 4);
  t.mock.timers.tick(60_000);
  assert.equal(b.sockets.length, 1);
  assert.equal(b.requests.length, 2, 'only one HTTP poll may be in flight');
});

void test('HTTP polls renew presence, hide/resume independently and stop without accepting late replies', async (t) => {
  const b = browser(t, true);
  b.requests[0].respond({ code: 'ABCDEFGH', revision: 1 });
  await flush();
  t.mock.timers.tick(750);
  assert.equal(b.requests[1].input.presence, false);
  b.requests[1].respond({ code: 'ABCDEFGH', revision: 2 });
  await flush();
  t.mock.timers.tick(20_000);
  assert.equal(b.requests[2].input.presence, true);
  b.doc.hidden = true;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(b.requests[2].signal?.aborted, true);
  assert.equal(b.requests[3].input.operation, 'disconnect');
  const previousId = b.requests[3].input.connectionId;
  b.requests[2].respond({ code: 'ABCDEFGH', revision: 99 });
  await flush();
  assert.equal(b.views.at(-1)?.revision, 2);
  t.mock.timers.tick(60_000);
  assert.equal(b.requests.length, 4);
  b.doc.hidden = false;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(1);
  assert.notEqual(b.requests[4].input.connectionId, previousId);
  assert.equal(b.requests[4].input.presence, true);
  b.connection.stop();
  b.requests[4].respond({ code: 'ABCDEFGH', revision: 100 });
  await flush();
  b.win.dispatchEvent(new Event('focus'));
  t.mock.timers.tick(60_000);
  assert.equal(b.views.at(-1)?.revision, 2);
  assert.equal(b.requests.length, 6);
});

void test('HTTP commands cancel older polls, correlate results and never replay timed-out moves', async (t) => {
  const b = browser(t, true);
  b.requests[0].respond({ code: 'ABCDEFGH', revision: 1 });
  await flush();
  t.mock.timers.tick(750);
  const result = b.connection.request({
    operation: 'action',
    code: 'ABCDEFGH',
    action: { type: 'vote', yes: true },
  });
  assert.equal(b.requests[1].signal?.aborted, true);
  assert.equal(b.requests[2].input.operation, 'action');
  b.requests[2].respond({ code: 'ABCDEFGH', revision: 3 });
  assert.equal(((await result) as TableView).revision, 3);
  t.mock.timers.tick(1);
  b.requests[3].respond({ code: 'ABCDEFGH', revision: 3 });
  await flush();
  const pending = b.connection.request({
    operation: 'action',
    action: { type: 'vote', yes: false },
  });
  const rejection = assert.rejects(pending, /not confirmed/);
  t.mock.timers.tick(8_000);
  await rejection;
  t.mock.timers.tick(1);
  assert.equal(b.requests[5].input.operation, 'sync');
  b.requests[5].respond({ code: 'ABCDEFGH', revision: 4 });
  await flush();
  assert.equal(b.statuses.at(-1), true);
  assert.equal(
    b.requests.filter((r) => r.input.operation === 'action').length,
    2,
  );
});

void test('HTTP errors back off; expired seats return to entry and create/join/leave stay usable', async (t) => {
  const b = browser(t, true);
  b.requests[0].respond({ error: 'Busy' }, 503);
  await flush();
  assert.equal(b.statuses.at(-1), false);
  t.mock.timers.tick(499);
  assert.equal(b.requests.length, 1);
  t.mock.timers.tick(1);
  b.requests[1].respond({ error: 'Table closed.' }, 404);
  await flush();
  assert.deepEqual(b.errors, ['Table closed.']);
  assert.equal(b.requests[2].input.operation, 'disconnect');
  t.mock.timers.tick(1);
  assert.equal(b.requests[3].input.code, undefined);
  b.requests[3].respond({ ready: true });
  await flush();
  const entering = b.connection.request({ operation: 'create', name: 'Host' });
  b.requests[4].respond({ code: 'NEWROOM2', revision: 0 });
  await entering;
  t.mock.timers.tick(1);
  assert.equal(b.requests[5].input.code, 'NEWROOM2');
  assert.equal(b.requests[5].input.presence, true);
  b.requests[5].respond({ code: 'NEWROOM2', revision: 0 });
  await flush();
  const leaving = b.connection.request({
    operation: 'action',
    action: { type: 'leave' },
  });
  b.requests[6].respond({ left: true });
  await leaving;
  assert.equal(b.requests[7].input.operation, 'disconnect');
  t.mock.timers.tick(1);
  assert.equal(b.requests[8].input.code, undefined);
});
