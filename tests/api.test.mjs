// Runs against the real local or hosted worker and D1, without browser automation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_URL || 'http://localhost:3000';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
const ip = `test-${randomUUID()}`; // Only local request headers; production CF sets the real IP.
class Client {
  cookie = '';
  id = '';
  async request(input, code, options = {}) {
    const response = await fetch(
      `${base}/api/table${code ? `?code=${code}` : ''}`,
      {
        method: input ? 'POST' : 'GET',
        headers: {
          Cookie: this.cookie,
          Origin: base,
          ...(local ? { 'CF-Connecting-IP': ip } : {}),
          ...(input ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      },
    );
    // Hosting may also set its own unrelated cookies.
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith('sh_session='));
    if (cookie) {
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      if (base.startsWith('https:')) assert.match(cookie, /Secure/);
      this.cookie = cookie.split(';')[0];
    }
    // Vite's outer Origin guard may reject before the application route runs.
    if (
      options.status === 403 &&
      !response.headers.get('content-type')?.includes('json')
    ) {
      assert.equal(response.status, 403);
      await response.text();
      return {};
    }
    assert.match(
      response.headers.get('cache-control') ?? '',
      /no-store/,
      `Missing no-store on HTTP ${response.status}`,
    );
    const data = await response.json();
    if (options.status)
      assert.equal(response.status, options.status, JSON.stringify(data));
    else
      assert.ok(
        response.ok,
        `HTTP ${response.status}: ${JSON.stringify(data)}`,
      );
    if (data.me) this.id = data.me.id;
    return data;
  }
  action(game, action, requestId = randomUUID(), options) {
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
      options,
    );
  }
}

const clients = Array.from({ length: 10 }, () => new Client());
const host = clients[0];
let game = await host.request({ operation: 'create', name: 'Host' });
const code = game.code;
assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
await new Client().request(null, code, { status: 401 });
const forged = new Client();
forged.cookie = `sh_session=${'a'.repeat(64)}`;
await forged.request(null, code, { status: 401 });
await host.request({ operation: 'create', name: 'Bad origin' }, null, {
  status: 403,
  headers: { Origin: 'https://attacker.example' },
});
for (let i = 1; i < 10; i++)
  game = await clients[i].request({
    operation: 'join',
    code,
    name: `Guest ${i}`,
  });
await new Client().request(
  { operation: 'join', code, name: 'Eleventh' },
  null,
  { status: 400 },
);
await clients[1].action(game, { type: 'start' }, randomUUID(), { status: 400 });
// Repeating a mutation ID is idempotent, including non-idempotent ready toggles.
const readyId = randomUUID();
game = await host.action(game, { type: 'ready' }, readyId);
game = await host.action(game, { type: 'ready' }, readyId);
assert.equal(game.players.find((p) => p.id === host.id).ready, true);
await Promise.all(
  clients.slice(1).map((c) => c.action(game, { type: 'ready' })),
);
game = await host.request(null, code);
assert.ok(game.players.every((p) => p.ready));
game = await host.action(game, { type: 'start' });
assert.equal(game.phase, 'nomination');
const seatViews = await Promise.all(clients.map((c) => c.request(null, code)));
const hitler = seatViews.find((v) => v.me.role === 'hitler');
assert.equal(hitler.me.teammates.length, 0);
assert.equal(seatViews.filter((v) => v.me.role === 'fascist').length, 3);
for (const view of seatViews) {
  assert.ok(view.players.every((p) => !('role' in p)));
  for (const key of ['deck', 'hand', 'discard', 'notes', 'processed'])
    assert.equal(key in view, false);
}
const actor = (id) => clients.find((c) => c.id === id);
const byRole = new Map(seatViews.map((v) => [v.me.id, v.me.role]));
const other = clients.find((c) => c.id !== game.president);
await other.action(
  game,
  { type: 'nominate', target: game.eligible[0] },
  randomUUID(),
  { status: 400 },
);
await new Client().request(
  { operation: 'join', code, name: 'Late visitor' },
  null,
  { status: 400 },
);
const oldNomination = game;
game = await actor(game.president).action(game, {
  type: 'nominate',
  target: game.eligible.find((id) => byRole.get(id) !== 'hitler'),
});
// A submitted vote is visible to everyone, but does not finish the election.
game = await host.action(game, { type: 'vote', yes: true });
const pendingVote = await clients[1].request(null, code);
assert.equal(pendingVote.me.ballot, null);
assert.equal(pendingVote.lastVote, null);
assert.equal(pendingVote.phase, 'voting');
assert.deepEqual(pendingVote.ballots, { [game.me.id]: true });
await host.action(game, { type: 'vote', yes: false }, randomUUID(), {
  status: 400,
});
// Nine concurrent votes must all survive database contention and resolve once.
const votes = await Promise.all(
  clients.slice(1).map((c) => c.action(game, { type: 'vote', yes: true })),
);
game = votes.sort((a, b) => b.revision - a.revision)[0];
assert.equal(game.phase, 'president-discard');
assert.equal(Object.keys(game.lastVote.votes).length, 10);
await host.action(
  oldNomination,
  { type: 'nominate', target: oldNomination.eligible[0] },
  randomUUID(),
  { status: 409 },
);
const president = actor(game.president),
  chancellor = actor(game.chancellor);
const [presView, chanView] = await Promise.all([
  president.request(null, code),
  chancellor.request(null, code),
]);
assert.equal(presView.me.hand.length, 3);
assert.equal(chanView.me.hand.length, 0);
await chancellor.action(game, { type: 'discard', index: 0 }, randomUUID(), {
  status: 400,
});
await president.action(
  game,
  { type: 'chat', text: 'A secret signal' },
  randomUUID(),
  { status: 400 },
);
game = await president.action(game, { type: 'discard', index: 0 });
assert.equal(game.me.hand.length, 0);
game = await chancellor.request(null, code);
assert.equal(game.me.hand.length, 2);
assert.equal(
  game.log.some((entry) => entry.policy),
  false,
);
const publicPolicy = {
  kind: game.me.hand[0],
  source: 'government',
  count: 1,
  president: {
    id: game.president,
    name: game.players.find((p) => p.id === game.president).name,
  },
  chancellor: {
    id: game.chancellor,
    name: game.players.find((p) => p.id === game.chancellor).name,
  },
};
await chancellor.action(game, { type: 'enact', index: 1000 }, randomUUID(), {
  status: 400,
});
game = await chancellor.action(game, { type: 'enact', index: 0 });
assert.equal(game.liberal + game.fascist, 1);
assert.deepEqual(game.log.find((entry) => entry.policy).policy, publicPolicy);
const publicResultForHost = await host.request(null, code);
assert.deepEqual(
  publicResultForHost.log.find((entry) => entry.policy).policy,
  publicPolicy,
);
console.log(
  'PASS: 10 independent seats, private roles/hands, live public ballots, concurrent voting, replay protection, illegal moves, CSRF and session forgery.',
);

// Complete a real networked game, using only information legal for each seat.
let moves = 0;
while (game.phase !== 'finished' && moves++ < 150) {
  switch (game.phase) {
    case 'nomination':
      game = await actor(game.president).action(game, {
        type: 'nominate',
        target:
          game.eligible.find((id) => byRole.get(id) !== 'hitler') ??
          game.eligible[0],
      });
      break;
    case 'voting': {
      const results = await Promise.all(
        game.players
          .filter((p) => p.alive)
          .map((p) => actor(p.id).action(game, { type: 'vote', yes: true })),
      );
      game = results.sort((a, b) => b.revision - a.revision)[0];
      break;
    }
    case 'president-discard':
      game = await actor(game.president).action(game, {
        type: 'discard',
        index: 0,
      });
      break;
    case 'chancellor-enact':
      game = await actor(game.chancellor).action(game, {
        type: 'enact',
        index: 0,
      });
      break;
    case 'executive': {
      const targets = game.players.filter(
        (p) =>
          p.alive &&
          p.id !== game.president &&
          !(game.power === 'investigate' && game.investigated.includes(p.id)),
      );
      const target =
        targets.find((p) => byRole.get(p.id) === 'hitler') ?? targets[0];
      game = await actor(game.president).action(game, {
        type: 'power',
        target: target.id,
      });
      break;
    }
    default:
      assert.fail(`Unexpected phase: ${game.phase}`);
  }
}
assert.equal(game.phase, 'finished');
assert.ok(game.players.every((p) => p.role));
const reconnect = new Client();
reconnect.cookie = host.cookie;
const restored = await reconnect.request(null, code);
assert.equal(restored.me.id, host.id);
assert.equal(restored.winner, game.winner);
assert.deepEqual(
  restored.log.filter((entry) => entry.policy),
  game.log.filter((entry) => entry.policy),
);
game = await host.action(game, { type: 'rematch' });
assert.equal(game.phase, 'lobby');
assert.equal(
  game.log.some((entry) => entry.policy),
  false,
);
assert.ok(game.players.every((p) => !p.role && !p.ready));
// Rendered page and official static assets served successfully with security headers.
const page = await fetch(base);
assert.equal(page.status, 200);
assert.equal(page.headers.get('x-frame-options'), 'DENY');
for (const file of [
  'board-liberal',
  'board-fascist-5-6',
  'board-fascist-7-8',
  'board-fascist-9-10',
  'role-hitler',
  'ballot-ja',
  'logo-transparent',
]) {
  const image = await fetch(`${base}/assets/${file}.png`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image/);
}
console.log(
  `PASS: full multiplayer game, victory reveal, cookie reconnect, rematch, HTML and official assets (${moves} subsequent actions).`,
);
console.log(`Test table: ${code}`);
