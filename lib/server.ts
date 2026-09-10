import { env } from 'cloudflare:workers';
import {
  applyAction,
  joinGame,
  newGame,
  randomInt,
  RuleError,
  validName,
  viewFor,
} from './game';
import type { Action, Game } from './game';

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
    .prepare('SELECT state,revision FROM rooms WHERE code=? AND updated_at>?')
    .bind(code, Date.now() - WEEK)
    .first<{ state: string; revision: number }>();
  if (!row)
    throw new HttpError('This table does not exist or has expired.', 404);
  return { game: JSON.parse(row.state) as Game, revision: row.revision };
}
async function projected(game: Game, id: string) {
  const view = viewFor(game, id);
  const ids = game.players.map((p) => p.id);
  const seen = await database()
    .prepare(
      `SELECT id,last_seen FROM sessions WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(...ids)
    .all<{ id: string; last_seen: number }>();
  return {
    ...view,
    players: view.players.map((p) => ({
      ...p,
      connected: seen.results.some(
        (s) => s.id === p.id && s.last_seen > Date.now() - 45_000,
      ),
    })),
  };
}
async function updateRoom(code: string, mutate: (game: Game) => void) {
  // Compare-and-swap makes all simultaneous moves linearizable across workers.
  for (let attempt = 0; attempt < 12; attempt++) {
    const { game, revision } = await readRoom(code);
    mutate(game);
    game.revision = revision + 1;
    game.updatedAt = Date.now();
    const result = await database()
      .prepare(
        'UPDATE rooms SET state=?,revision=?,updated_at=? WHERE code=? AND revision=? RETURNING revision',
      )
      .bind(JSON.stringify(game), game.revision, game.updatedAt, code, revision)
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
      .prepare('DELETE FROM rooms WHERE updated_at<?')
      .bind(now - WEEK),
  ]);
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
    const isEntry = input.operation === 'create' || input.operation === 'join';
    session = await identity(request, isEntry);
    await rate(`write:${session.id}`, 80);
    if (isEntry) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'local';
      await rate(`entry:${await hash(ip)}`, 40);
      const name = validName(input.name);
      if (input.operation === 'create') {
        await rate(`create:${session.id}`, 5, 300);
        await cleanup();
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = Array.from(
            { length: 8 },
            () => alphabet[randomInt(alphabet.length)],
          ).join('');
          const game = newGame(code, session.id, name);
          const row = await database()
            .prepare(
              'INSERT INTO rooms(code,state,revision,updated_at) VALUES (?,?,0,?) ON CONFLICT(code) DO NOTHING RETURNING code',
            )
            .bind(code, JSON.stringify(game), Date.now())
            .first();
          if (row)
            return json(await projected(game, session.id), 201, session.cookie);
        }
        throw new HttpError('Could not create a table. Please try again.', 503);
      }
      const game = await updateRoom(codeOf(input.code), (game) =>
        joinGame(game, session!.id, name),
      );
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
      const key = `${session!.id}:${String(input.requestId)}`;
      if (game.processed.includes(key)) return;
      if (
        action.type !== 'chat' &&
        (input.round !== game.round || input.phase !== game.phase)
      ) {
        throw new HttpError(
          'The turn has changed. Review the table before making your move.',
          409,
        );
      }
      applyAction(game, session!.id, action);
      game.processed.push(key);
      game.processed = game.processed.slice(-300);
    });
    if (!game.players.some((p) => p.id === session!.id))
      return json({ left: true }, 200, session.cookie);
    return json(await projected(game, session.id), 200, session.cookie);
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
