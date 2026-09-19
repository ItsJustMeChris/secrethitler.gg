import assert from 'node:assert/strict';
import { liveClient } from './live-client.mjs';

const base = process.env.TEST_URL || 'http://localhost:3000';
const sockets = [];
async function connect(cookie = '', code) {
  const live = liveClient(base, cookie, code);
  sockets.push(live);
  await live.wait((m) => m.type === (code ? 'state' : 'ready'));
  return live;
}
async function transfer(input, cookie = '', origin = new URL(base).origin) {
  const response = await fetch(`${base}/api/table/transfer`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  return {
    response,
    data: response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(body)
      : { error: body },
  };
}
try {
  const source = await connect();
  let game = await source.request({
    operation: 'create',
    name: 'Transfer host',
    portrait: 8,
  });
  const code = game.code;
  const stranger = await connect();
  assert.equal(
    (await transfer({ operation: 'create', code })).response.status,
    401,
  );
  assert.equal(
    (await transfer({ operation: 'create', code }, stranger.cookie)).response
      .status,
    403,
  );
  assert.equal(
    (
      await transfer(
        { operation: 'create', code },
        source.cookie,
        'https://elsewhere.invalid',
      )
    ).response.status,
    403,
  );

  let issued = await transfer({ operation: 'create', code }, source.cookie);
  assert.equal(issued.response.status, 200);
  assert.match(issued.data.token, /^[a-f0-9]{64}$/);
  assert.match(issued.response.headers.get('cache-control'), /no-store/);
  const first = issued.data.token;
  issued = await transfer({ operation: 'create', code }, source.cookie);
  assert.equal(
    (await transfer({ operation: 'claim', code, token: first })).response
      .status,
    410,
  );
  assert.equal(
    (await transfer({ operation: 'revoke' }, source.cookie)).response.status,
    200,
  );
  assert.equal(
    (await transfer({ operation: 'claim', code, token: issued.data.token }))
      .response.status,
    410,
  );

  // Start a real match so the transfer covers a secret role, not just a lobby.
  game = await source.request({
    operation: 'action',
    code,
    phase: game.phase,
    round: game.round,
    action: { type: 'fill-bots' },
  });
  game = await source.request({
    operation: 'action',
    code,
    phase: game.phase,
    round: game.round,
    action: { type: 'ready' },
  });
  game = await source.request({
    operation: 'action',
    code,
    phase: game.phase,
    round: game.round,
    action: { type: 'start' },
  });
  issued = await transfer({ operation: 'create', code }, source.cookie);
  const claim = { operation: 'claim', code, token: issued.data.token };
  assert.equal((await transfer(claim, source.cookie)).response.status, 409);
  assert.equal(
    (await transfer(claim, '', 'https://elsewhere.invalid')).response.status,
    403,
  );
  assert.equal(
    (await transfer({ ...claim, token: 'f'.repeat(64) })).response.status,
    410,
  );
  const results = await Promise.all([transfer(claim), transfer(claim)]);
  assert.deepEqual(
    results.map((r) => r.response.status).sort((a, b) => a - b),
    [200, 410],
  );
  const winner = results.find((r) => r.response.status === 200);
  const setCookie = winner.response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const newCookie = setCookie.split(';')[0];
  assert.notEqual(newCookie, source.cookie);
  const oldRead = await fetch(`${base}/api/table?code=${code}`, {
    headers: { Cookie: source.cookie },
  });
  assert.equal(oldRead.status, 401);
  assert.equal(
    (await transfer({ operation: 'create', code }, source.cookie)).response
      .status,
    401,
  );
  const revoked = await source.wait(
    (m) => m.type === 'error' && m.status === 401,
    5_000,
  );
  assert.match(revoked.error, /moved|expired/);
  const destination = await connect(newCookie, code);
  const restored = (await destination.wait((m) => m.type === 'state')).view;
  assert.equal(restored.me.id, game.me.id);
  assert.equal(restored.me.role, game.me.role);
  assert.equal(restored.hostId, game.hostId);
  assert.equal(restored.players.find((p) => p.id === game.me.id).portrait, 8);
  assert.equal(restored.players.length, game.players.length);
  assert.equal(restored.players.filter((p) => p.id === game.me.id).length, 1);
  assert.equal(JSON.stringify(restored).includes(issued.data.token), false);
  assert.equal((await transfer(claim)).response.status, 410);
  console.log(
    'PASS: private single-use seat transfer, replacement/revocation, origin checks, racing claims, role/host preservation, and old-cookie/socket invalidation.',
  );
} finally {
  for (const socket of sockets) socket.close();
}
