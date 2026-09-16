import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { liveClient } from './live-client.mjs';

const base = process.env.TEST_URL || 'http://localhost:3000';
const sockets = [];
class Player {
  cookie = '';
  id = '';
  live;
  async connect(code) {
    this.live = liveClient(base, this.cookie, code);
    sockets.push(this.live);
    await this.live.wait((m) => m.type === (code ? 'state' : 'ready'));
    this.cookie = this.live.cookie;
    assert.match(this.cookie, /^sh_session=[a-f0-9]{64}$/);
    return this.live;
  }
  async api(input, code, requestId) {
    if (!this.live) await this.connect();
    const view = await this.live.request(
      input ?? { operation: 'restore', code },
      requestId,
    );
    if (view.me) this.id = view.me.id;
    return view;
  }
  move(view, action, requestId) {
    return this.api(
      {
        operation: 'action',
        code: view.code,
        phase: view.phase,
        round: view.round,
        action,
      },
      undefined,
      requestId,
    );
  }
}

try {
  const players = Array.from({ length: 7 }, () => new Player());
  const createId = randomUUID();
  let game = await players[0].api(
    { operation: 'create', name: 'Socket host' },
    undefined,
    createId,
  );
  const duplicate = await players[0].api(
    { operation: 'create', name: 'Socket host' },
    undefined,
    createId,
  );
  assert.equal(duplicate.code, game.code);
  const code = game.code;
  const hostLive = players[0].live;
  await hostLive.wait((m) => m.type === 'state');
  for (const [i, player] of players.entries()) {
    if (i)
      game = await player.api({
        operation: 'join',
        code,
        name: `Socket player ${i}`,
      });
    const readyId = randomUUID();
    const once = await player.move(game, { type: 'ready' }, readyId);
    const twice = await player.move(game, { type: 'ready' }, readyId);
    assert.equal(twice.revision, once.revision);
    assert.equal(twice.players.find((p) => p.id === player.id).ready, true);
  }
  const friendLive = players[1].live;
  const before = await friendLive.wait((m) => m.type === 'state');
  game = await players[0].api(undefined, code);
  await assert.rejects(
    players[1].move(game, { type: 'start' }),
    (e) => e.status === 400,
  );
  game = await players[0].move(game, { type: 'start' });
  const host = (
    await hostLive.wait(
      (m) => m.type === 'state' && m.view.phase === 'nomination',
    )
  ).view;
  const friend = (
    await friendLive.wait(
      (m) => m.type === 'state' && m.view.phase === 'nomination',
    )
  ).view;
  assert.notEqual(host.me.id, friend.me.id);
  assert.ok(host.me.role && friend.me.role);
  assert.ok(host.players.every((p) => !('role' in p)));
  assert.equal('deck' in host, false);
  assert.equal('votes' in host, false);
  assert.equal('notes' in host, false);
  assert.equal('seed' in host.fairness, false);
  assert.ok(friend.revision > before.view.revision);
  const ready = await Promise.all(players.map((p) => p.api(undefined, code)));
  const roles = new Map(ready.map((view) => [view.me.id, view.me.role]));
  const actor = (id) => players.find((p) => p.id === id);
  const president =
    players[ready.findIndex((view) => view.me.id === game.president)];
  const oldNomination = game;
  await assert.rejects(
    players[0].api({
      operation: 'action',
      code: 'ABCDEFGH',
      action: { type: 'ready' },
    }),
    (e) => e.status === 403,
  );
  game = await president.move(game, {
    type: 'nominate',
    target: game.eligible.find((id) => roles.get(id) !== 'hitler'),
  });
  game = await players[0].move(game, { type: 'vote', yes: true });
  const privateBallot = (
    await hostLive.wait((m) => m.type === 'state' && m.view.me.ballot === true)
  ).view;
  const publicBallot = (
    await friendLive.wait(
      (m) => m.type === 'state' && m.view.revision >= privateBallot.revision,
    )
  ).view;
  assert.equal(publicBallot.me.ballot, null);
  assert.equal('votes' in publicBallot, false);
  friendLive.close();
  game = await players[0].move(game, {
    type: 'chat',
    text: 'Reconnect verification',
  });
  const reconnected = await players[1].connect(code);
  const restored = (
    await reconnected.wait(
      (m) => m.type === 'state' && m.view.revision >= game.revision,
    )
  ).view;
  assert.equal(restored.me.id, friend.me.id);
  assert.ok(restored.messages.some((m) => m.text === 'Reconnect verification'));
  await assert.rejects(
    president.move(oldNomination, {
      type: 'nominate',
      target: oldNomination.eligible[0],
    }),
    (e) => e.status === 409,
  );
  const voted = await Promise.all(
    players.slice(1).map((p) => p.move(game, { type: 'vote', yes: true })),
  );
  game = voted.sort((a, b) => b.revision - a.revision)[0];
  assert.equal(game.phase, 'president-discard');
  assert.equal(Object.keys(game.lastVote.votes).length, players.length);
  const presView = await actor(game.president).api(undefined, code);
  const chanView = await actor(game.chancellor).api(undefined, code);
  assert.equal(presView.me.hand.length, 3);
  assert.equal(chanView.me.hand.length, 0);
  await assert.rejects(
    actor(game.chancellor).move(game, { type: 'discard', index: 0 }),
    (e) => e.status === 400,
  );
  // A complete match, including policy and executive decisions, uses socket commands only.
  let moves = 0;
  while (game.phase !== 'finished' && moves++ < 150) {
    switch (game.phase) {
      case 'nomination':
        game = await actor(game.president).move(game, {
          type: 'nominate',
          target:
            game.eligible.find((id) => roles.get(id) !== 'hitler') ??
            game.eligible[0],
        });
        break;
      case 'voting': {
        const results = await Promise.all(
          game.players
            .filter((p) => p.alive)
            .map((p) => actor(p.id).move(game, { type: 'vote', yes: true })),
        );
        game = results.sort((a, b) => b.revision - a.revision)[0];
        break;
      }
      case 'president-discard':
        game = await actor(game.president).move(game, {
          type: 'discard',
          index: 0,
        });
        break;
      case 'chancellor-enact': {
        const view = await actor(game.chancellor).api(undefined, code);
        assert.equal(view.me.hand.length, 2);
        game = await actor(game.chancellor).move(game, {
          type: 'enact',
          index: 0,
        });
        break;
      }
      case 'executive': {
        const targets = game.players.filter(
          (p) =>
            p.alive &&
            p.id !== game.president &&
            !(game.power === 'investigate' && game.investigated.includes(p.id)),
        );
        const target =
          targets.find((p) => roles.get(p.id) === 'hitler') ?? targets[0];
        game = await actor(game.president).move(game, {
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
  game = await players[0].move(game, { type: 'rematch' });
  assert.equal(game.phase, 'lobby');
  assert.ok(game.players.every((p) => !p.role && !p.ready));
  const leaveId = randomUUID();
  assert.deepEqual(await players[1].move(game, { type: 'leave' }, leaveId), {
    left: true,
  });
  assert.deepEqual(await players[1].move(game, { type: 'leave' }, leaveId), {
    left: true,
  });
  game = await players[1].api({
    operation: 'join',
    code,
    name: 'Returned player',
  });
  assert.equal(game.me.id, friend.me.id);
  game = await players[0].move(game, { type: 'add-bot' });
  const bot = game.players.find((p) => p.bot);
  assert.ok(bot);
  game = await players[0].move(game, { type: 'kick', target: bot.id });
  assert.equal(
    game.players.some((p) => p.id === bot.id),
    false,
  );
  console.log(
    `PASS: full ${players.length}-player socket-only match, simultaneous votes, private hands, invalid/stale commands, deduplication, chat, restore, rematch, leave/rejoin and host controls (${moves} subsequent moves).`,
  );
  const outsider = new Player();
  await outsider.api({ operation: 'create', name: 'Outside seat' });
  const rejected = liveClient(base, outsider.cookie, code);
  sockets.push(rejected);
  const denial = await rejected.wait((m) => m.type === 'error');
  assert.equal(denial.status, 403);
  assert.equal(
    rejected.messages.some((m) => m.type === 'state'),
    false,
  );
  rejected.close();
  const solo = new Player();
  let soloGame = await solo.api({
    operation: 'solo',
    name: 'Socket solo',
    seats: 5,
  });
  if (soloGame.president === soloGame.me.id)
    soloGame = await solo.move(soloGame, {
      type: 'nominate',
      target: soloGame.eligible[0],
    });
  soloGame = await solo.move(soloGame, {
    type: 'practice-settings',
    paused: true,
    pace: 'fast',
  });
  assert.equal(soloGame.practice.paused, true);
  soloGame = await solo.api({
    operation: 'tick',
    code: soloGame.code,
    manual: true,
    revision: soloGame.revision,
  });
  soloGame = await solo.move(soloGame, {
    type: 'practice-settings',
    paused: false,
  });
  const soloLive = solo.live;
  await soloLive.wait(
    (m) => m.type === 'state' && m.view.revision > soloGame.revision,
    20_000,
  );
  soloLive.close();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bad.terminate();
      reject(new Error('Cross-origin rejection timed out'));
    }, 10_000);
    const url = new URL(`/api/table/live?code=${code}`, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const bad = new WebSocket(url, {
      headers: {
        Cookie: players[0].cookie,
        Origin: 'https://attacker.example',
      },
    });
    bad.on('unexpected-response', (_, response) => {
      clearTimeout(timeout);
      assert.equal(response.statusCode, 403);
      response.resume();
      bad.terminate();
      resolve();
    });
    bad.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    bad.on('open', () => {
      clearTimeout(timeout);
      bad.close();
      reject(new Error('Cross-origin socket was accepted'));
    });
  });
  console.log(
    'PASS: authenticated WebSocket updates, isolated roles and hands, reconnect snapshots, server-driven AI, and cross-origin/membership rejection.',
  );
} finally {
  for (const socket of sockets) socket.close();
}
