import type { ConnectionOptions, TableResult } from './table-connection.ts';

type Reply = TableResult | { ready: true };
const terminal = (error: unknown) =>
  [400, 401, 403, 404].includes((error as { status?: number }).status ?? 0);

// HTTP uses the same cookie, projected views, commands, and room leases as the
// socket. One poll at a time; moves are sent once and never retried automatically.
export function connectPolling({
  code,
  receive,
  status,
  expired,
}: ConnectionOptions) {
  let stopped = false;
  let ready = false;
  let generation = 0;
  let attempts = 0;
  let connectionId = crypto.randomUUID();
  let lastPresence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: AbortController | undefined;
  let command: AbortController | undefined;

  const available = () =>
    !stopped && !document.hidden && navigator.onLine !== false;
  const interrupted = () =>
    new Error(
      'Connection interrupted. Check the restored table before trying again.',
    );
  function schedule(delay = 750) {
    clearTimeout(timer);
    if (available()) timer = setTimeout(() => void refresh(), delay);
  }
  async function post(
    input: Record<string, unknown>,
    controller: AbortController,
  ): Promise<Reply> {
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(
            'The command was not confirmed. Check the restored table before trying again.',
          ),
        ),
      8_000,
    );
    try {
      const response = await fetch('/api/table', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const data = (await response.json()) as Reply & { error?: string };
      if (!response.ok)
        throw Object.assign(
          new Error(
            data.error ?? 'The table service is temporarily unavailable.',
          ),
          { status: response.status },
        );
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
  function resetSeat(error: unknown) {
    release();
    code = undefined;
    expired((error as Error).message, (error as { status: number }).status);
  }
  async function refresh() {
    if (!available() || poll || command) return;
    const current = generation;
    const currentCode = code;
    const controller = new AbortController();
    poll = controller;
    const presence = lastPresence === 0 || Date.now() - lastPresence >= 20_000;
    let delay = 750;
    try {
      const data = await post(
        { operation: 'sync', code, connectionId, presence },
        controller,
      );
      if (current !== generation || controller.signal.aborted) return;
      if (currentCode) {
        if (!('code' in data) || data.code !== currentCode)
          throw new Error('Unexpected table response.');
        receive(data);
      } else if (!('ready' in data))
        throw new Error('Unexpected session response.');
      if (presence) lastPresence = Date.now();
      ready = true;
      attempts = 0;
      status(true);
      if (!code) delay = 20_000;
    } catch (error) {
      if (current !== generation || (controller.signal.aborted && !available()))
        return;
      ready = false;
      status(false);
      if (terminal(error)) {
        resetSeat(error);
        delay = 0;
      } else delay = Math.min(10_000, 500 * 2 ** Math.min(attempts++, 5));
    } finally {
      if (poll === controller) poll = undefined;
      if (current === generation) schedule(delay);
    }
  }
  function release() {
    if (code) {
      // Best effort only. If the browser is suspended before this arrives, the
      // independent lease expires normally; no shared seat is removed.
      void fetch('/api/table', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'disconnect', code, connectionId }),
      }).catch(() => {});
    }
    connectionId = crypto.randomUUID();
    lastPresence = 0;
  }
  function suspend() {
    generation++;
    clearTimeout(timer);
    poll?.abort(interrupted());
    command?.abort(interrupted());
    poll = command = undefined;
    release();
    ready = false;
    status(false);
  }
  function sync() {
    if (available()) schedule(0);
  }
  function visibility() {
    if (document.hidden) suspend();
    else sync();
  }
  async function request(input: Record<string, unknown>): Promise<TableResult> {
    if (!available() || !ready)
      throw new Error('Reconnecting to the table. Try again when connected.');
    if (command) throw new Error('Wait for your previous command to finish.');
    clearTimeout(timer);
    generation++;
    poll?.abort();
    poll = undefined;
    const current = generation;
    const controller = new AbortController();
    command = controller;
    try {
      const data = await post(
        { ...input, requestId: crypto.randomUUID() },
        controller,
      );
      if (current !== generation || controller.signal.aborted)
        throw interrupted();
      if ('ready' in data) throw new Error('Unexpected command response.');
      const nextCode = 'left' in data ? undefined : data.code;
      if (nextCode !== code) {
        release();
        code = nextCode;
      }
      return data;
    } catch (error) {
      if (
        current === generation &&
        (!('status' in (error as object)) ||
          (error as { status: number }).status >= 500)
      ) {
        ready = false;
        status(false);
      }
      throw error;
    } finally {
      if (command === controller) command = undefined;
      if (current === generation) schedule(0);
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    suspend();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', sync);
    window.removeEventListener('pageshow', sync);
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', suspend);
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('online', sync);
  window.addEventListener('offline', suspend);
  // Keep the last status during a planned socket renewal until HTTP confirms it.
  void refresh();
  return { stop, sync, request };
}
