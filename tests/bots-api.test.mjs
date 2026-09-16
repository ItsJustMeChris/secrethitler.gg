import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { freshMemory, observe, planBot } from '../lib/bots.ts';
import { verifyFairness } from '../lib/fairness.ts';
import { liveClient } from './live-client.mjs';

const base = process.env.TEST_URL || 'http://localhost:3000';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
const ip = `test-${randomUUID()}`;
class Client {
  cookie = '';
  id = '';
  async request(input, code, expected = 200, extraHeaders = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `${base}/api/table${code ? `?code=${code}` : ''}`,
        {
          method: input ? 'POST' : 'GET',
          headers: {
            Cookie: this.cookie,
            Origin: base,
            ...(local ? { 'CF-Connecting-IP': ip } : {}),
            ...(input ? { 'Content-Type': 'application/json' } : {}),
            ...extraHeaders,
          },
          ...(input ? { body: JSON.stringify(input) } : {}),
        },
      );
      const cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith('sh_session='));
      if (cookie) {
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        if (!local) assert.match(cookie, /Secure/);
        this.cookie = cookie.split(';')[0];
      }
      if (
        expected === 403 &&
        !response.headers.get('content-type')?.includes('json')
      ) {
        assert.equal(response.status, 403);
        await response.text();
        return {};
      }
      const data = await response.json();
      if (response.status === 429) {
        // Respect the real shared rate limiter when a fast test fills a minute.
        await delay(60050 - (Date.now() % 60000));
        continue;
      }
      assert.equal(
        response.status,
        expected,
        data.error ?? 'Unexpected HTTP result',
      );
      assert.match(response.headers.get('cache-control'), /no-store/);
      if (data.me) this.id = data.me.id;
      return data;
    }
    throw new Error('Rate limit did not clear');
  }
  action(game, action, expected = 200, requestId = randomUUID()) {
    return this.request(
      {
        operation: 'action',
        code: game.code,
        round: game.round,
        phase: game.phase,
        requestId,
        action,
      },
      null,
      expected,
    );
  }
  tick(game, manual = false, expected = 200, extra = {}) {
    return this.request(
      {
        operation: 'tick',
        code: game.code,
        manual,
        revision: game.revision,
        ...extra,
      },
      null,
      expected,
    );
  }
}

const host = new Client(),
  friend = new Client(),
  outsider = new Client();
let game = await host.request(
  { operation: 'create', name: 'AI test host', portrait: 12 },
  null,
  201,
);
const code = game.code;
const savedCommitment = game.fairness.commitment;
assert.equal(game.fairness.reveal, null);
assert.equal(game.players[0].portrait, 12);
await friend.request(
  { operation: 'join', code, name: 'AI test friend', portrait: 31 },
  null,
  400,
);
await friend.request({
  operation: 'join',
  code,
  name: 'AI test friend',
  portrait: 30,
});
game = await host.request(null, code);
assert.equal(game.players.find((p) => p.id === friend.id).portrait, 30);
await friend.action(game, { type: 'portrait', portrait: 0 }, 400);
await friend.action(game, { type: 'portrait', portrait: 11 });
game = await host.request(null, code);
assert.equal(game.players.find((p) => p.id === friend.id).portrait, 11);
assert.equal(game.players.find((p) => p.id === host.id).portrait, 12);
await friend.action(game, { type: 'add-bot' }, 400);
const addId = randomUUID();
game = await host.action(game, { type: 'add-bot' }, 200, addId);
game = await host.action(game, { type: 'add-bot' }, 200, addId);
assert.equal(game.players.length, 3);
const removed = game.players.find((p) => p.bot).id;
game = await host.action(game, { type: 'kick', target: removed });
assert.equal(game.practice, null);
game = await host.action(game, { type: 'fill-bots' });
assert.equal(game.players.filter((p) => p.bot).length, 8);
assert.ok(
  game.players.filter((p) => p.bot).every((p) => p.connected && p.ready),
);
await host.action(game, { type: 'add-bot' }, 400);
game = await host.action(game, { type: 'ready' });
await friend.action(game, { type: 'ready' });
game = await host.request(null, code);
game = await host.action(game, { type: 'start' });
await host.action(game, { type: 'add-bot' }, 400);
await friend.action(game, { type: 'portrait', portrait: 2 }, 400);
game = await host.action(game, { type: 'practice-settings', paused: true });
const live = liveClient(base, host.cookie, code);
await live.wait((message) => message.type === 'state');
process.on('uncaughtExceptionMonitor', () => live.close());
const friendBeforeLeave = await friend.request(null, code);
const leftLive = await friend.request({
  operation: 'action',
  code,
  requestId: randomUUID(),
  phase: 'lobby',
  round: -1,
  action: { type: 'leave' },
});
assert.equal(leftLive.left, true);
await friend.request(null, code, 401);
await friend.tick(game, false, 400);
const reserved = await host.request(null, code);
assert.equal(reserved.players.length, 10);
assert.equal(reserved.players.find((p) => p.id === friend.id).departed, true);
game = await friend.request({
  operation: 'join',
  code,
  name: 'AI test friend',
  portrait: 2,
});
assert.equal(game.me.role, friendBeforeLeave.me.role);
assert.equal(game.players.find((p) => p.id === friend.id).portrait, 11);
assert.equal(game.players.find((p) => p.id === friend.id).departed, false);
await friend.tick(game, true, 400);
await outsider.tick(game, false, 401);
await outsider.request(
  { operation: 'create', name: 'Separate room' },
  null,
  201,
);
await outsider.tick(game, false, 400);
await host.request({ operation: 'tick', code }, null, 403, {
  Origin: 'https://attacker.example',
});
const pausedRevision = game.revision;
game = await host.tick(game);
assert.equal(game.revision, pausedRevision);
assert.deepEqual(Object.keys(game.practice), ['paused', 'pace']);
assert.ok(game.players.every((p) => !('role' in p)));
console.log(
  'PASS: ordinary room holds two humans + eight AI, host-only add/remove, capacity, readiness, protected tick, private bot state, pause.',
);

const memories = new Map([
  [host.id, freshMemory()],
  [friend.id, freshMemory()],
]);
let moves = 0;
while (game.phase !== 'finished' && moves++ < 450) {
  let humanActed = false;
  for (const client of [host, friend]) {
    const view = await client.request(null, code);
    observe(view, memories.get(client.id));
    const plan = planBot(view, memories.get(client.id));
    if (plan) {
      game = await client.action(view, plan.action);
      humanActed = true;
      break;
    }
  }
  if (!humanActed) {
    const before = await host.request(null, code);
    // Two simultaneous step requests with the same revision must commit once.
    const results = await Promise.all([
      host.tick(before, true),
      host.tick(before, true),
    ]);
    game = results.sort((a, b) => b.revision - a.revision)[0];
    assert.ok(
      game.revision <= before.revision + 1,
      'A duplicate step advanced two moves',
    );
  }
}
assert.equal(game.phase, 'finished');
const verified = await verifyFairness(game.fairness, savedCommitment);
assert.equal(verified.players, 10);
assert.ok(game.players.every((p) => p.role));
assert.ok(
  game.messages.some((m) =>
    game.players.some((p) => p.id === m.playerId && p.bot),
  ),
);
const reconnect = new Client();
reconnect.cookie = host.cookie;
const restored = await reconnect.request(null, code);
assert.equal(restored.me.id, host.id);
assert.equal(restored.winner, game.winner);
live.close();
assert.equal((await host.action(game, { type: 'leave' })).left, true);
game = await friend.request(null, code);
assert.equal(game.hostId, friend.id);
assert.equal(game.players.length, 9);
game = await friend.action(game, { type: 'rematch' });
assert.equal(game.players.find((p) => p.id === friend.id).portrait, 11);
assert.equal(game.previousFairness.commitment, savedCommitment);
assert.ok(game.previousFairness.reveal);
assert.notEqual(game.fairness.commitment, savedCommitment);
assert.equal(game.fairness.reveal, null);
game = await host.request({ operation: 'join', code, name: 'AI test host' });
assert.equal(game.phase, 'lobby');
assert.equal(game.players.filter((p) => p.bot && p.ready).length, 8);
assert.equal(game.players.filter((p) => !p.bot && p.ready).length, 0);
assert.ok(game.players.every((p) => !p.role));
console.log(
  `PASS: complete mixed multiplayer game (${moves} steps), concurrent step protection, AI conversation, reconnect and rematch.`,
);

await host.request(
  { operation: 'solo', name: 'Solo host', seats: 11 },
  null,
  400,
);
await host.request(
  { operation: 'solo', name: 'Solo host', seats: 5.5 },
  null,
  400,
);
game = await host.request(
  { operation: 'solo', name: 'Solo host', seats: 10, portrait: 6 },
  null,
  201,
);
assert.equal(game.players.length, 10);
assert.equal(game.players.find((p) => p.id === host.id).portrait, 6);
assert.equal(game.players.filter((p) => p.bot).length, 9);
assert.equal(game.phase, 'nomination');
assert.ok(game.me.role);
await host.action(game, { type: 'practice-settings', pace: 'invalid' }, 400);
game = await host.action(game, { type: 'practice-settings', pace: 'fast' });
assert.equal(game.practice.pace, 'fast');
await delay(1300);
const before = game;
game = await host.tick(game);
assert.ok(game.revision >= before.revision);
assert.equal(
  (await host.request(null, game.code)).players.filter((p) => p.bot).length,
  9,
);
console.log(
  'PASS: solo shortcut seats one human + nine AI with original roles, validates sizes, saves pace and allows automatic ticks.',
);
