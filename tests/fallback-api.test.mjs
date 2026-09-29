import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.TEST_URL || 'http://localhost:3000';
const ip = `fallback-test-${randomUUID()}`;
const players = [];
class Player {
  cookie = '';
  connectionId = randomUUID();
  view;
  async request(input) {
    const response = await fetch(`${base}/api/table`, {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        Cookie: this.cookie,
        'CF-Connecting-IP': ip,
      },
      body: JSON.stringify(input),
    });
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('sh_session='));
    if (cookie) this.cookie = cookie.split(';')[0];
    const data = await response.json();
    assert.ok(response.ok, `${response.status}: ${data.error}`);
    if (data.code) this.view = data;
    return data;
  }
  sync(code = this.view?.code) {
    return this.request({
      operation: 'sync',
      code,
      connectionId: this.connectionId,
      presence: true,
    });
  }
  move(action) {
    return this.request({
      operation: 'action',
      code: this.view.code,
      phase: this.view.phase,
      round: this.view.round,
      requestId: randomUUID(),
      action,
    });
  }
}
let code;
try {
  // No sockets are opened anywhere in this suite.
  for (let i = 0; i < 5; i++) {
    const player = new Player();
    players.push(player);
    assert.deepEqual(await player.sync(), { ready: true });
    const view = await player.request({
      operation: i ? 'join' : 'create',
      code,
      name: `HTTP player ${i}`,
    });
    code = view.code;
    await player.sync();
    await player.move({ type: 'ready' });
  }
  const host = players[0];
  let game = await host.sync();
  assert.ok(game.players.every((p) => p.connected && p.ready));
  game = await host.move({ type: 'start' });
  await Promise.all(players.map((p) => p.sync()));
  const president = players.find((p) => p.view.me.id === game.president);
  await president.move({
    type: 'nominate',
    target: president.view.eligible[0],
  });
  await Promise.all(players.map((p) => p.sync()));
  await Promise.all(players.map((p) => p.move({ type: 'vote', yes: true })));
  game = await president.sync();
  assert.equal(game.phase, 'president-discard');
  assert.equal(game.me.hand.length, 3);
  const other = players.find((p) => p !== president);
  assert.equal((await other.sync()).me.hand.length, 0);
  await president.move({ type: 'discard', index: 0 });
  const chancellor = players.find((p) => p.view.me.id === game.chancellor);
  await chancellor.sync();
  assert.equal(chancellor.view.me.hand.length, 2);
  await chancellor.move({ type: 'enact', index: 0 });
  game = await host.sync();
  assert.equal(game.phase, 'nomination');
  assert.equal(game.liberal + game.fascist, 1);
  await host.move({ type: 'chat', text: 'HTTP connection check' });
  assert.equal(
    (await other.sync()).messages.at(-1).text,
    'HTTP connection check',
  );
  await host.request({
    operation: 'disconnect',
    code,
    connectionId: host.connectionId,
  });
  host.connectionId = randomUUID();
  assert.equal((await host.sync()).me.id, game.me.id);
  console.log(
    'PASS: HTTP-only entry, five-player election, private legislation, chat and seat restoration.',
  );

  // Exercise the real minute-long socket-renewal boundary using HTTP leases.
  for (let i = 0; i < 4; i++) {
    await delay(16_000);
    await Promise.all(players.map((p) => p.sync()));
  }
  assert.ok(host.view.players.every((p) => p.connected));
  console.log(
    'PASS: HTTP-only rooms and all player presences survive beyond one minute.',
  );

  const solo = new Player();
  players.push(solo);
  const first = await solo.request({
    operation: 'solo',
    name: 'HTTP solo',
    seats: 10,
  });
  await solo.sync();
  await delay(5500);
  const next = await solo.sync();
  assert.ok(next.revision > first.revision, 'HTTP sync advances due AI work');
  await solo.move({ type: 'practice-settings', paused: true });
  const paused = await solo.sync();
  assert.equal(paused.practice.paused, true);
  assert.equal((await solo.sync()).revision, paused.revision);
  console.log(
    'PASS: HTTP fallback drives due AI work and respects host pause.',
  );
} finally {
  await Promise.allSettled(
    players.map(async (p) => {
      if (!p.view) return;
      await p.move({ type: 'leave' });
      await p.request({
        operation: 'disconnect',
        code: p.view.code,
        connectionId: p.connectionId,
      });
    }),
  );
}
