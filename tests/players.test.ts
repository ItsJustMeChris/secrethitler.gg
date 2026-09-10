import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBot,
  applyAction,
  joinGame,
  newGame,
  validPortrait,
  viewFor,
} from '../lib/game.ts';
import { playerKnowledge } from '../lib/player-knowledge.ts';
import { PORTRAITS, portraitUrl } from '../lib/portraits.ts';

function started(count: number) {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0', 12);
  for (let i = 1; i < count; i++) joinGame(game, `p${i}`, `Player ${i}`, i);
  for (const player of game.players)
    applyAction(game, player.id, { type: 'ready' });
  applyAction(game, 'p0', { type: 'start' });
  return game;
}

void test('only catalog portraits are accepted, with a legacy default and safe local URLs', () => {
  assert.equal(PORTRAITS.length, 12);
  assert.equal(validPortrait(undefined), 1);
  for (const item of PORTRAITS) {
    assert.equal(validPortrait(item.id), item.id);
    assert.match(
      portraitUrl(item.id),
      /^\/assets\/portraits\/original-portrait-\d{2}\.png$/,
    );
  }
  for (const value of [
    0,
    -1,
    13,
    1.2,
    NaN,
    Infinity,
    null,
    '1',
    {},
    'https://example.com/a.png',
  ]) {
    assert.throws(() => validPortrait(value));
    assert.equal(portraitUrl(value as number), portraitUrl(1));
  }
  assert.throws(() => newGame('ABCDEFGH', 'host', 'Host', 13));
});

void test('pictures are public cosmetics, change only the actor and preserve lobby readiness', () => {
  const game = newGame('ABCDEFGH', 'host', 'Host', 12);
  joinGame(game, 'friend', 'Friend', 5);
  assert.throws(() => joinGame(game, 'invalid', 'Invalid', 13));
  assert.equal(game.players.length, 2);
  applyAction(game, 'friend', { type: 'ready' });
  applyAction(game, 'friend', { type: 'portrait', portrait: 9 });
  assert.deepEqual(
    game.players.map((p) => p.portrait),
    [12, 9],
  );
  assert.equal(game.players[1].ready, true);
  assert.throws(() =>
    applyAction(game, 'outsider', { type: 'portrait', portrait: 3 }),
  );
  assert.throws(() =>
    applyAction(game, 'host', { type: 'portrait', portrait: 13 }),
  );
  for (const player of game.players) {
    const view = viewFor(game, player.id);
    assert.deepEqual(
      view.players.map((p) => p.portrait),
      [12, 9],
    );
    assert.ok(view.players.every((p) => !('role' in p)));
    assert.ok(view.players.every((p) => playerKnowledge(view, p.id) === null));
  }
});

void test('pictures survive a live rejoin and rematch; identity cannot change after the deal', () => {
  const game = started(7);
  const before = game.players.map((p) => p.portrait);
  assert.throws(() =>
    applyAction(game, 'p1', { type: 'portrait', portrait: 11 }),
  );
  applyAction(game, 'p1', { type: 'leave' });
  joinGame(game, 'p1', 'Player 1', 11);
  assert.deepEqual(
    game.players.map((p) => p.portrait),
    before,
  );
  assert.equal(game.players[1].departed, false);
  game.phase = 'finished';
  game.winner = 'liberal';
  applyAction(game, 'p0', { type: 'rematch' });
  assert.deepEqual(
    game.players.map((p) => p.portrait),
    before,
  );
  joinGame(game, 'p1', 'Player 1');
  assert.equal(game.players[1].portrait, before[1]);
  joinGame(game, 'p1', 'Player 1', 11);
  assert.equal(game.players[1].portrait, 11);
});

void test('AI choose unused pictures before roles exist; legacy seats receive valid fallback pictures', () => {
  const game = newGame('ABCDEFGH', 'host', 'Host', 12);
  while (game.players.length < 10) addBot(game);
  const pictures = game.players.map((p) => p.portrait);
  assert.equal(new Set(pictures).size, 10);
  assert.ok(game.players.every((p) => !p.role));
  applyAction(game, 'host', { type: 'ready' });
  applyAction(game, 'host', { type: 'start' });
  assert.deepEqual(
    game.players.map((p) => p.portrait),
    pictures,
  );
  for (const player of game.players) delete player.portrait;
  assert.deepEqual(
    viewFor(game, 'host').players.map((p) => p.portrait),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

void test('persistent roster reveals exactly the permitted identities for every role at all 5–10 counts', () => {
  for (let count = 5; count <= 10; count++) {
    const game = started(count);
    for (const viewer of game.players) {
      const view = viewFor(game, viewer.id);
      for (const target of game.players) {
        const permitted =
          target.id === viewer.id ||
          (target.role !== 'liberal' &&
            (viewer.role === 'fascist' ||
              (viewer.role === 'hitler' && count <= 6)));
        const knowledge = playerKnowledge(view, target.id);
        assert.equal(
          knowledge?.kind ?? null,
          permitted ? target.role : null,
          `${count} players: ${viewer.role} viewing ${target.role}`,
        );
        if (knowledge) assert.equal(knowledge.source, 'role');
      }
      assert.ok(view.players.every((p) => !('role' in p)));
    }
  }
});

void test('roster investigations show party membership without identifying Hitler or leaking to another viewer', () => {
  const game = started(9);
  const liberals = game.players.filter((p) => p.role === 'liberal');
  const hitler = game.players.find((p) => p.role === 'hitler')!;
  const fascist = game.players.find((p) => p.role === 'fascist')!;
  game.notes[liberals[0].id] = [
    { targetId: hitler.id, party: 'fascist', text: 'Private investigation' },
    { targetId: fascist.id, party: 'fascist', text: 'Private investigation' },
    {
      targetId: liberals[1].id,
      party: 'liberal',
      text: 'Private investigation',
    },
  ];
  const view = viewFor(game, liberals[0].id);
  assert.deepEqual(playerKnowledge(view, hitler.id), {
    label: 'Fascist party',
    kind: 'fascist',
    source: 'party',
  });
  assert.deepEqual(
    playerKnowledge(view, hitler.id),
    playerKnowledge(view, fascist.id),
  );
  assert.deepEqual(playerKnowledge(view, liberals[1].id), {
    label: 'Liberal party',
    kind: 'liberal',
    source: 'party',
  });
  assert.equal(playerKnowledge(viewFor(game, liberals[1].id), hitler.id), null);
  game.phase = 'finished';
  for (const viewer of game.players) {
    for (const target of game.players) {
      const known = playerKnowledge(viewFor(game, viewer.id), target.id);
      assert.equal(known?.kind, target.role);
      assert.equal(known?.source, 'role');
    }
  }
});
