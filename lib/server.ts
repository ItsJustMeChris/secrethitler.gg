import { env } from 'cloudflare:workers';
import {
  applyAction,
  addBot,
  joinGame,
  newGame,
  randomInt,
  RuleError,
  validName,
  validPortrait,
  viewFor,
} from './game';
import type { Action, Game } from './game';
import { authorizeTick, tickBots } from './bots';
import { createFairness } from './fairness';
import { keepRoomOpen, releaseRoom, ROOM_GRACE_MS } from './room-presence';

const WEEK = 7 * 86400_000;
const COOKIE = 'sh_session';
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const headers = {
  'Cache-Control': 'no-store, private',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
}
function database() {
  if (!env.DB)
    throw new HttpError(
      'The table service is unavailable. Please try again shortly.',
      503,
    );
  return env.DB;
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function rate(key: string, max: number, windowSeconds = 60) {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const row = await database()
    .prepare(
      'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(`${key}:${bucket}`, (bucket + 2) * windowSeconds * 1000)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new HttpError('Too many requests. Wait a moment and try again.', 429);
}
type Identity = { id: string; hash: string; cookie?: string };
async function identity(request: Request, create = false): Promise<Identity> {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const now = Date.now();
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = await hash(token);
    const row = await database()
      .prepare('SELECT id FROM sessions WHERE hash=? AND expires>?')
      .bind(tokenHash, now)
      .first<{ id: string }>();
    if (row) {
      await database()
        .prepare(
          'UPDATE sessions SET last_seen=?, expires=? WHERE hash=? AND last_seen<?',
        )
        .bind(now, now + WEEK, tokenHash, now - 15_000)
        .run();
      // Renew the cookie alongside server expiry, without exposing the token to JS.
      return {
        id: row.id,
        hash: tokenHash,
        cookie: cookieValue(token, request),
      };
    }
  }
  if (!create)
    throw new HttpError(
      'Your seat session has expired. Join the table again.',
      401,
    );
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  await rate(`new-session:${await hash(ip)}`, 20);
  const secret = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const tokenHash = await hash(secret);
  const id = crypto.randomUUID();
  await database()
    .prepare(
      'INSERT INTO sessions (hash,id,expires,last_seen) VALUES (?,?,?,?)',
    )
    .bind(tokenHash, id, now + WEEK, now)
    .run();
  return { id, hash: tokenHash, cookie: cookieValue(secret, request) };
}
function cookieValue(token: string, request: Request) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  if (Number(request.headers.get('content-length') ?? 0) > 4096)
    throw new HttpError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('Request body is missing.', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw new HttpError('Request is too large.', 413);
    }
    chunks.push(value);
  }
  // Consume bounded request bodies before rejecting. Unread bodies can tear
  // down a reused connection in the local Worker proxy. No auth or writes
  // occur before these Origin and content-type checks.
  if (origin !== new URL(request.url).origin)
    throw new HttpError('This request did not come from this game.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new HttpError('Cross-site requests are not allowed.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError('JSON content is required.', 415);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(combined));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError('Invalid JSON request.', 400);
  }
}
function codeOf(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^[A-HJ-NP-Z2-9]{8}$/.test(input.toUpperCase())
  )
    throw new HttpError('Enter the eight-character room code.', 400);
  return input.toUpperCase();
}
async function readRoom(code: string) {
  const row = await database()
    .prepare(
      'SELECT state,revision FROM rooms WHERE code=? AND updated_at>? AND close_at>?',
    )
    .bind(code, Date.now() - WEEK, Date.now())
    .first<{ state: string; revision: number }>();
  if (!row) {
    await database()
      .prepare('DELETE FROM rooms WHERE code=? AND close_at<=?')
      .bind(code, Date.now())
      .run();
    throw new HttpError(
      'This table has closed or expired. Create a new table to play again.',
      404,
    );
  }
  return { game: JSON.parse(row.state) as Game, revision: row.revision };
}
async function projected(game: Game, id: string) {
  if (game.players.find((p) => p.id === id)?.departed)
    throw new HttpError(
      'Your seat is reserved. Join this room again to return.',
      401,
    );
  const view = viewFor(game, id);
  const seen = await database()
    .prepare(
      'SELECT DISTINCT player_id FROM room_connections WHERE code=? AND expires_at>?',
    )
    .bind(game.code, Date.now())
    .all<{ player_id: string }>();
  return {
    ...view,
    players: view.players.map((p) => ({
      ...p,
      connected:
        !p.departed &&
        (p.bot || seen.results.some((s) => s.player_id === p.id)),
    })),
  };
}
async function updateRoom(
  code: string,
  mutate: (game: Game) => void | boolean,
) {
  // Compare-and-swap makes all simultaneous moves linearizable across workers.
  for (let attempt = 0; attempt < 12; attempt++) {
    const { game, revision } = await readRoom(code);
    if (game.phase === 'lobby' && !game.fairness)
      game.fairness = await createFairness();
    if (mutate(game) === false) return game;
    if (game.phase === 'lobby' && !game.fairness)
      game.fairness = await createFairness();
    game.revision = revision + 1;
    game.updatedAt = Date.now();
    const result = await database()
      .prepare(
        'UPDATE rooms SET state=?,revision=?,updated_at=? WHERE code=? AND revision=? AND close_at>? RETURNING revision',
      )
      .bind(
        JSON.stringify(game),
        game.revision,
        game.updatedAt,
        code,
        revision,
        Date.now(),
      )
      .first();
    if (result) return game;
  }
  throw new HttpError('The table is busy. Please retry your move.', 409);
}
async function cleanup() {
  const now = Date.now();
  await database().batch([
    database().prepare('DELETE FROM rate_limits WHERE expires<?').bind(now),
    database().prepare('DELETE FROM sessions WHERE expires<?').bind(now),
    database()
      .prepare('DELETE FROM rooms WHERE updated_at<? OR close_at<=?')
      .bind(now - WEEK, now),
    database()
      .prepare('DELETE FROM room_connections WHERE expires_at<=?')
      .bind(now),
  ]);
}
async function performOperation(
  input: Record<string, unknown>,
  session: Identity,
  request: Request,
): Promise<Response> {
  const isEntry = ['create', 'join', 'solo'].includes(String(input.operation));
  if (input.operation === 'restore') {
    await rate(`read:${session.id}`, 120);
    const { game } = await readRoom(codeOf(input.code));
    return json(await projected(game, session.id), 200, session.cookie);
  }
  await rate(
    `${input.operation === 'tick' ? 'bot-wake' : 'write'}:${session.id}`,
    input.operation === 'tick' ? 100 : 80,
  );
  if (isEntry) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    await rate(`entry:${await hash(ip)}`, 40);
    const name = validName(input.name);
    const portrait = validPortrait(input.portrait);
    if (input.operation !== 'join') {
      if (
        input.operation === 'solo' &&
        (!Number.isInteger(input.seats) ||
          Number(input.seats) < 5 ||
          Number(input.seats) > 10)
      )
        throw new HttpError('Choose a table size from 5 to 10 players.', 400);
      await rate(`create:${session.id}`, 5, 300);
      await cleanup();
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from(
          { length: 8 },
          () => alphabet[randomInt(alphabet.length)],
        ).join('');
        const game = newGame(code, session.id, name, portrait);
        game.fairness = await createFairness();
        if (input.operation === 'solo') {
          while (game.players.length < Number(input.seats)) addBot(game);
          game.players[0].ready = true;
          applyAction(game, session.id, { type: 'start' });
          game.practice!.nextAt = Date.now() + 5000;
        }
        const row = await database()
          .prepare(
            'INSERT INTO rooms(code,state,revision,updated_at,close_at) VALUES (?,?,0,?,?) ON CONFLICT(code) DO NOTHING RETURNING code',
          )
          .bind(
            code,
            JSON.stringify(game),
            Date.now(),
            Date.now() + ROOM_GRACE_MS,
          )
          .first();
        if (row)
          return json(await projected(game, session.id), 201, session.cookie);
      }
      throw new HttpError('Could not create a table. Please try again.', 503);
    }
    const game = await updateRoom(codeOf(input.code), (game) =>
      joinGame(
        game,
        session.id,
        name,
        input.portrait === undefined ? undefined : portrait,
      ),
    );
    return json(await projected(game, session.id), 200, session.cookie);
  }
  if (input.operation === 'tick') {
    if (input.manual !== undefined && typeof input.manual !== 'boolean')
      throw new HttpError('Invalid step request.', 400);
    const game = await updateRoom(codeOf(input.code), (game) => {
      if (
        !authorizeTick(game, session.id, input.manual === true, input.revision)
      )
        return false;
      return tickBots(game, Date.now(), input.manual === true);
    });
    return json(await projected(game, session.id), 200, session.cookie);
  }
  if (input.operation !== 'action')
    throw new HttpError('Unknown operation.', 400);
  if (
    typeof input.requestId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(input.requestId)
  )
    throw new HttpError('A valid request ID is required.', 400);
  if (
    !input.action ||
    typeof input.action !== 'object' ||
    Array.isArray(input.action)
  )
    throw new HttpError('An action is required.', 400);
  const action = input.action as Action;
  if (action.type === 'chat') await rate(`chat:${session.id}`, 15, 30);
  const game = await updateRoom(codeOf(input.code), (game) => {
    const key = `${session.id}:${String(input.requestId)}`;
    if (game.processed.includes(key)) return false;
    if (
      action.type !== 'chat' &&
      action.type !== 'leave' &&
      (input.round !== game.round || input.phase !== game.phase)
    ) {
      throw new HttpError(
        'The turn has changed. Review the table before making your move.',
        409,
      );
    }
    applyAction(game, session.id, action);
    game.processed.push(key);
    game.processed = game.processed.slice(-300);
  });
  if (action.type === 'leave' || !game.players.some((p) => p.id === session.id))
    return json({ left: true }, 200, session.cookie);
  return json(await projected(game, session.id), 200, session.cookie);
}

export async function handle(request: Request) {
  let session: Identity | undefined;
  try {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      session = await identity(request);
      await rate(`read:${session.id}`, 120);
      const { game } = await readRoom(codeOf(url.searchParams.get('code')));
      return json(await projected(game, session.id), 200, session.cookie);
    }
    const input = await body(request);
    const isEntry =
      input.operation === 'create' ||
      input.operation === 'join' ||
      input.operation === 'solo';
    session = await identity(request, isEntry);
    return await performOperation(input, session, request);
  } catch (error) {
    if (error instanceof RuleError)
      return json({ error: error.message }, 400, session?.cookie);
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status, session?.cookie);
    // Never log a request, a session token, a hand, or the game state.
    console.error(
      'Table service failed:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return json(
      {
        error:
          'The table service is temporarily unavailable. Your last saved move is safe.',
      },
      503,
      session?.cookie,
    );
  }
}

// Sites supplies D1, not a room-coordinator binding. Each socket observes the
// durable room revision so players on different Worker isolates see the same
// commits. This is server-side D1 synchronization (750 ms), not browser polling
// or an unsafe in-memory broadcast registry. Only personalized views go on wire.
export async function openTableSocket(
  request: Request,
  ctx: ExecutionContext,
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
  )
    return json({ error: 'A WebSocket connection is required.' }, 426);
  if (
    request.headers.get('Origin') !== new URL(request.url).origin ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  )
    return json({ error: 'This request did not come from this game.' }, 403);

  const pair = new WebSocketPair();
  const client = pair[0];
  const socket = pair[1];
  let session: Identity;
  let code: string | undefined;
  let game: Game | undefined;
  const connectionId = crypto.randomUUID();
  try {
    const requestedCode = new URL(request.url).searchParams.get('code');
    session = await identity(request, !requestedCode);
    await rate(`socket:${session.id}`, 30);
    if (requestedCode) {
      code = codeOf(requestedCode);
      game = (await readRoom(code)).game;
      // Authenticate membership before accepting or scheduling any AI work.
      await projected(game, session.id);
      if (!(await keepRoomOpen(database(), code, connectionId, session.id)))
        throw new HttpError(
          'This table has closed. Create a new table to play again.',
          404,
        );
    }
  } catch (error) {
    socket.accept();
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof RuleError
          ? 403
          : 503;
    socket.send(
      JSON.stringify({
        type: 'error',
        status,
        error:
          status === 503
            ? 'The table service is temporarily unavailable.'
            : (error as Error).message,
      }),
    );
    socket.close(1008, 'Table unavailable');
    return new Response(null, { status: 101, webSocket: client });
  }

  socket.accept();
  let closed = false;
  let running = false;
  let force = true;
  let timer: ReturnType<typeof setTimeout>;
  let lastPing = Date.now();
  let lastPresence = 0;
  let lastSync = 0;
  let lastRefresh = Date.now();
  let sent = '';
  const started = Date.now();
  let queue = Promise.resolve();
  let queued = 0;
  function enqueue(work: () => Promise<void>) {
    if (closed || queued >= 8) return false;
    queued++;
    queue = queue
      .then(async () => {
        if (!closed) await work();
      })
      .catch(() => {
        stop(1011, 'Connection interrupted');
      })
      .finally(() => {
        queued--;
      });
    ctx.waitUntil(queue);
    return true;
  }
  function stop(closeCode = 1000, reason = 'Connection closed') {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (code)
      ctx.waitUntil(
        releaseRoom(database(), code, connectionId).catch(() => {
          // The lease expires even if this best-effort disconnect write fails.
        }),
      );
    try {
      socket.close(closeCode, reason);
    } catch {
      /* Already closed. */
    }
  }
  function send(message: unknown) {
    if (!closed) socket.send(JSON.stringify(message));
  }
  async function validateIdentity() {
    const valid = await database()
      .prepare('SELECT id FROM sessions WHERE hash=? AND expires>?')
      .bind(session.hash, Date.now())
      .first<{ id: string }>();
    if (!valid || valid.id !== session.id)
      throw new HttpError(
        'Your seat session has expired. Join the table again.',
        401,
      );
  }
  async function refresh() {
    if (closed || running) return;
    clearTimeout(timer);
    running = true;
    const refreshRequested = force;
    force = false;
    try {
      const now = Date.now();
      // Bound each Worker's request lifetime/query budget. Reconnect reauthenticates
      // the cookie and snapshots the room; no game state lives in this socket.
      if (now - lastPing > 45_000 || now - started > 60_000) {
        stop(1001, 'Reconnect to refresh session');
        return;
      }
      const presenceDue = now - lastPresence >= 20_000;
      if (presenceDue) {
        // Revalidate the identity created during this handshake, too. The
        // original request does not contain its newly issued cookie yet.
        await validateIdentity();
        if (closed) return;
        if (
          code &&
          !(await keepRoomOpen(database(), code, connectionId, session.id))
        )
          throw new HttpError(
            'This table has closed. Create a new table to play again.',
            404,
          );
        lastPresence = now;
      }
      if (!code || !game) {
        if (refreshRequested) send({ type: 'ready' });
        lastRefresh = Date.now();
        return;
      }
      const row = await database()
        .prepare(
          'SELECT revision FROM rooms WHERE code=? AND updated_at>? AND close_at>?',
        )
        .bind(code, now - WEEK, now)
        .first<{ revision: number }>();
      if (closed) return;
      if (!row)
        throw new HttpError('This table does not exist or has expired.', 404);
      if (row.revision !== game.revision) game = (await readRoom(code)).game;
      if (
        !game.players.some(
          (player) => player.id === session.id && !player.departed,
        )
      )
        throw new HttpError(
          'Your seat is no longer active. Join the table again.',
          401,
        );
      if (
        game.practice &&
        !game.practice.paused &&
        !['lobby', 'finished'].includes(game.phase) &&
        now >= game.practice.nextAt
      ) {
        game = await updateRoom(code, (current) => {
          if (!authorizeTick(current, session.id, false, undefined))
            return false;
          return tickBots(current, Date.now());
        });
      }
      if (refreshRequested || presenceDue || sent !== String(game.revision)) {
        const view = await projected(game, session.id);
        if (!closed) {
          send({ type: 'state', view });
          sent = String(game.revision);
        }
      }
      lastRefresh = Date.now();
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      try {
        send({
          type: 'error',
          status,
          error:
            status === 503
              ? 'The table service is temporarily unavailable. Reconnecting.'
              : (error as Error).message,
        });
      } finally {
        stop(1011, 'Refresh required');
      }
    } finally {
      running = false;
      if (!closed)
        timer = setTimeout(
          () => enqueue(refresh),
          force ? 0 : code ? 750 : 5_000,
        );
    }
  }
  const completed = new Map<string, string | undefined>();
  async function command(requestId: string, input: Record<string, unknown>) {
    try {
      await validateIdentity();
      if (completed.has(requestId)) {
        if (completed.get(requestId) !== code)
          throw new HttpError('This command belongs to an earlier table.', 409);
        const data = code
          ? await projected((await readRoom(code)).game, session.id)
          : { left: true };
        send({ type: 'result', requestId, data });
        return;
      }
      // Room mutations are bound to this authenticated connection. A payload
      // cannot select a different actor or silently write to another room.
      if (
        !['create', 'join', 'solo', 'restore'].includes(
          String(input.operation),
        ) &&
        (!code || codeOf(input.code) !== code)
      )
        throw new HttpError(
          'This command is not for your connected table.',
          403,
        );
      const response = await performOperation(
        { ...input, requestId },
        session,
        request,
      );
      const data = (await response.json()) as
        | Awaited<ReturnType<typeof projected>>
        | { left: true };
      if ('left' in data) {
        const previousCode = code;
        code = undefined;
        game = undefined;
        if (previousCode)
          await releaseRoom(database(), previousCode, connectionId);
      } else {
        if (code && code !== data.code)
          await releaseRoom(database(), code, connectionId);
        code = data.code;
        if (!(await keepRoomOpen(database(), code, connectionId, session.id)))
          throw new HttpError(
            'This table has closed. Create a new table to play again.',
            404,
          );
        game = (await readRoom(code)).game;
        // Return the latest projection if another player moved during the write.
        Object.assign(data, await projected(game, session.id));
      }
      lastRefresh = Date.now();
      completed.set(requestId, code);
      if (completed.size > 32) completed.delete(completed.keys().next().value!);
      send({ type: 'result', requestId, data });
      force = true;
      clearTimeout(timer);
      timer = setTimeout(() => enqueue(refresh), 0);
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof RuleError
            ? 400
            : 503;
      send({
        type: 'rejected',
        requestId,
        status,
        error:
          status === 503
            ? 'The command could not be confirmed. Reconnect and check the table.'
            : (error as Error).message,
      });
    }
  }
  let messageWindow = Date.now();
  let messages = 0;
  socket.addEventListener('message', (event) => {
    if (closed) return;
    if (Date.now() - messageWindow >= 60_000) {
      messageWindow = Date.now();
      messages = 0;
    }
    if (
      ++messages > 120 ||
      typeof event.data !== 'string' ||
      new TextEncoder().encode(event.data).byteLength > 4096
    ) {
      stop(1008, 'Invalid message');
      return;
    }
    try {
      const message = JSON.parse(event.data) as {
        type?: string;
        requestId?: string;
        input?: Record<string, unknown>;
      };
      if (message?.type === 'command') {
        if (
          typeof message.requestId !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(message.requestId) ||
          !message.input ||
          typeof message.input !== 'object' ||
          Array.isArray(message.input)
        ) {
          stop(1008, 'Invalid command');
          return;
        }
        lastPing = Date.now();
        const requestId = message.requestId;
        const input = message.input;
        if (!enqueue(() => command(requestId, input)))
          send({
            type: 'rejected',
            requestId,
            status: 429,
            error: 'Too many pending commands. Wait a moment.',
          });
        return;
      }
      if (message.type !== 'ping' && message.type !== 'sync') {
        stop(1008, 'Invalid message');
        return;
      }
      lastPing = Date.now();
      if (lastPing - lastRefresh > 15_000) {
        stop(1011, 'Table updates stalled');
        return;
      }
      send({ type: 'pong' });
      if (message.type === 'sync' && Date.now() - lastSync >= 500) {
        lastSync = Date.now();
        force = true;
        enqueue(refresh);
      }
    } catch {
      stop(1008, 'Invalid message');
    }
  });
  socket.addEventListener('close', () => stop());
  socket.addEventListener('error', () => stop(1011, 'Connection interrupted'));
  timer = setTimeout(() => enqueue(refresh), 0);
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: session.cookie ? { 'Set-Cookie': session.cookie } : undefined,
  });
}
