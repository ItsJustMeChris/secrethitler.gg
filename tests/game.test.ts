import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  distribution,
  eligibleChancellors,
  joinGame,
  newGame,
  powerTrack,
  randomInt,
  validName,
  viewFor,
} from '../lib/game.ts';
import type { Game, Policy } from '../lib/game.ts';

function started(n = 7): Game {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  for (let i = 1; i < n; i++) joinGame(game, `p${i}`, `Player ${i}`);
  for (const p of game.players) applyAction(game, p.id, { type: 'ready' });
  applyAction(game, 'p0', { type: 'start' });
  game.president = 'p0';
  return game;
}
function fixedRoles(game: Game) {
  game.players.forEach((p, i) => {
    p.role =
      i === game.players.length - 1
        ? 'hitler'
        : i === game.players.length - 2
          ? 'fascist'
          : 'liberal';
  });
}
function elect(game: Game, target = eligibleChancellors(game)[0], yes = true) {
  applyAction(game, game.president!, { type: 'nominate', target });
  for (const p of game.players.filter((p) => p.alive))
    applyAction(game, p.id, { type: 'vote', yes });
}
function enact(game: Game, policy: Policy) {
  elect(game);
  game.hand = [policy, policy, policy];
  applyAction(game, game.president!, { type: 'discard', index: 0 });
  applyAction(game, game.chancellor!, { type: 'enact', index: 0 });
}
void test('exact role distribution and policy composition for all six player counts', () => {
  for (let n = 5; n <= 10; n++) {
    const game = started(n);
    const dist = distribution(n);
    assert.deepEqual(dist, {
      liberal: [3, 4, 4, 5, 5, 6][n - 5],
      fascist: [1, 1, 2, 2, 3, 3][n - 5],
      hitler: 1,
    });
    for (const role of ['liberal', 'fascist', 'hitler'] as const)
      assert.equal(
        game.players.filter((p) => p.role === role).length,
        dist[role],
      );
    assert.equal(game.deck.filter((p) => p === 'liberal').length, 6);
    assert.equal(game.deck.length, 17);
  }
});
void test('start requires host, correct size and every readiness; no late join', () => {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  assert.throws(() => applyAction(game, 'p0', { type: 'start' }));
  for (let i = 1; i < 5; i++) joinGame(game, `p${i}`, `Player ${i}`);
  assert.throws(() => applyAction(game, 'p1', { type: 'start' }));
  assert.throws(() => applyAction(game, 'p0', { type: 'start' }));
  const full = started();
  assert.throws(() => joinGame(full, 'late', 'Late player'));
  assert.doesNotThrow(() => joinGame(full, 'p0', 'Impersonation ignored'));
  assert.equal(full.players[0].name, 'Player 0');
});
void test('names and text cannot contain controls, duplicate names are rejected', () => {
  assert.throws(() => validName('a'));
  assert.throws(() => validName('Invisible\u202e'));
  const game = newGame('ABCDEFGH', 'p0', 'Alice');
  assert.throws(() => joinGame(game, 'p1', 'alice'));
  assert.throws(() =>
    applyAction(game, 'p0', { type: 'chat', text: 'A\u0000B' }),
  );
  assert.throws(() =>
    applyAction(game, 'p0', { type: 'chat', text: 'x'.repeat(401) }),
  );
});
void test('only 5–6 player Hitler receives knowledge of the Fascist', () => {
  for (const count of [5, 6, 7, 8, 9, 10]) {
    const game = started(count);
    for (const p of game.players) {
      const view = viewFor(game, p.id);
      assert.equal(view.me.role, p.role);
      assert.equal(
        view.me.teammates.length,
        p.role === 'liberal' || (p.role === 'hitler' && count >= 7)
          ? 0
          : distribution(count).fascist,
      );
      assert.ok(view.players.every((x) => !('role' in x)));
      for (const secret of ['deck', 'discard', 'hand', 'notes', 'processed'])
        assert.equal(secret in view, false);
    }
  }
  assert.throws(() => viewFor(started(), 'outsider'));
});
void test('term limits apply to last elected government, relax at five living players', () => {
  const game = started(7);
  game.lastPresident = 'p1';
  game.lastChancellor = 'p2';
  assert.deepEqual(eligibleChancellors(game), ['p3', 'p4', 'p5', 'p6']);
  game.players[5].alive = false;
  game.players[6].alive = false;
  assert.deepEqual(eligibleChancellors(game), ['p1', 'p3', 'p4']);
});
void test('non-president, self, and term-limited nominations rejected', () => {
  const game = started();
  game.lastChancellor = 'p1';
  assert.throws(() =>
    applyAction(game, 'p2', { type: 'nominate', target: 'p3' }),
  );
  assert.throws(() =>
    applyAction(game, 'p0', { type: 'nominate', target: 'p0' }),
  );
  assert.throws(() =>
    applyAction(game, 'p0', { type: 'nominate', target: 'p1' }),
  );
});
void test('submitted Ja and Nein votes are public to every seat; elections wait for everyone and ballots cannot change', () => {
  for (let count = 5; count <= 10; count++) {
    const game = started(count);
    applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
    applyAction(game, 'p0', { type: 'vote', yes: false });
    applyAction(game, 'p1', { type: 'vote', yes: true });
    for (const viewer of game.players) {
      const view = viewFor(game, viewer.id);
      assert.equal(view.phase, 'voting');
      assert.equal(view.lastVote, null);
      assert.deepEqual(view.ballots, { p0: false, p1: true });
      assert.deepEqual(view.voted, ['p0', 'p1']);
      assert.equal(view.me.ballot, game.votes[viewer.id] ?? null);
      view.ballots.p0 = true;
      assert.equal(game.votes.p0, false);
    }
    assert.throws(() => applyAction(game, 'p0', { type: 'vote', yes: true }));
    for (const p of game.players.slice(2))
      applyAction(game, p.id, { type: 'vote', yes: true });
    assert.equal(game.lastVote?.votes.p0, false);
    assert.equal(game.lastVote?.passed, true);
    assert.deepEqual(viewFor(game, 'p0').ballots, {});
  }
});
void test('live ballots do not carry over into the next election', () => {
  const game = started();
  elect(game, 'p1', false);
  assert.equal(game.phase, 'nomination');
  assert.deepEqual(viewFor(game, 'p0').ballots, {});
  applyAction(game, game.president!, {
    type: 'nominate',
    target: eligibleChancellors(game)[0],
  });
  const view = viewFor(game, 'p0');
  assert.equal(view.phase, 'voting');
  assert.deepEqual(view.ballots, {});
  assert.deepEqual(view.voted, []);
  assert.equal(view.me.ballot, null);
});
void test('a tied election fails and advances presidency; term limits persist', () => {
  const game = started(6);
  game.lastPresident = 'p4';
  game.lastChancellor = 'p5';
  applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
  game.players.forEach((p, i) =>
    applyAction(game, p.id, { type: 'vote', yes: i < 3 }),
  );
  assert.equal(game.phase, 'nomination');
  assert.equal(game.president, 'p1');
  assert.equal(game.tracker, 1);
  assert.equal(game.lastPresident, 'p4');
  assert.equal(game.lastChancellor, 'p5');
});
void test('three failures top-deck a policy, skip its power and clear term limits', () => {
  const game = started(9);
  game.deck[0] = 'fascist';
  game.lastPresident = 'p7';
  game.lastChancellor = 'p8';
  for (let i = 0; i < 3; i++) elect(game, eligibleChancellors(game)[0], false);
  assert.equal(game.fascist, 1);
  assert.equal(game.power, null);
  assert.equal(game.phase, 'nomination');
  assert.equal(game.tracker, 0);
  assert.equal(game.lastPresident, null);
  assert.equal(game.lastChancellor, null);
});
void test('successful elections do not reset tracker; enacting policies does', () => {
  const game = started();
  game.tracker = 2;
  elect(game);
  assert.equal(game.tracker, 2);
  game.hand = ['liberal', 'liberal', 'liberal'];
  applyAction(game, game.president!, { type: 'discard', index: 0 });
  applyAction(game, game.chancellor!, { type: 'enact', index: 0 });
  assert.equal(game.tracker, 0);
});
void test('legislative hands belong only to current holder; invalid choices rejected', () => {
  const game = started();
  elect(game, 'p1');
  assert.equal(viewFor(game, 'p0').me.hand.length, 3);
  assert.equal(viewFor(game, 'p1').me.hand.length, 0);
  assert.throws(() => applyAction(game, 'p1', { type: 'discard', index: 0 }));
  assert.throws(() => applyAction(game, 'p0', { type: 'discard', index: -1 }));
  assert.throws(() => applyAction(game, 'p0', { type: 'discard', index: 0.1 }));
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  assert.equal(viewFor(game, 'p0').me.hand.length, 0);
  assert.equal(viewFor(game, 'p1').me.hand.length, 2);
  assert.throws(() => applyAction(game, 'p0', { type: 'enact', index: 0 }));
  assert.throws(() => applyAction(game, 'p1', { type: 'enact', index: 2 }));
});
void test('Hitler election wins at three fascist policies, but not at two', () => {
  for (const count of [2, 3, 4, 5]) {
    const game = started();
    fixedRoles(game);
    game.fascist = count;
    elect(game, 'p6');
    assert.equal(game.phase, count >= 3 ? 'finished' : 'president-discard');
    assert.equal(game.winner, count >= 3 ? 'fascist' : null);
  }
});
void test('both policy victory conditions and chaos victory', () => {
  for (const policy of ['liberal', 'fascist'] as const) {
    const game = started();
    fixedRoles(game);
    game[policy] = policy === 'liberal' ? 4 : 5;
    enact(game, policy);
    assert.equal(game.winner, policy);
    assert.equal(game.phase, 'finished');
  }
  const game = started();
  game.liberal = 4;
  game.tracker = 2;
  game.deck[0] = 'liberal';
  elect(game, eligibleChancellors(game)[0], false);
  assert.equal(game.winner, 'liberal');
});
void test('all original power tracks', () => {
  assert.deepEqual(powerTrack(5), [
    null,
    null,
    'peek',
    'execute',
    'execute',
    null,
  ]);
  assert.deepEqual(powerTrack(8), [
    null,
    'investigate',
    'special-election',
    'execute',
    'execute',
    null,
  ]);
  assert.deepEqual(powerTrack(10), [
    'investigate',
    'investigate',
    'special-election',
    'execute',
    'execute',
    null,
  ]);
});
void test('every fascist policy selects the correct power for original player count', () => {
  for (const count of [5, 7, 9])
    for (let index = 0; index < 5; index++) {
      const game = started(count);
      fixedRoles(game);
      game.fascist = index;
      enact(game, 'fascist');
      assert.equal(game.power, powerTrack(count)[index]);
    }
});
void test('investigation reveals party only and only to the president; no repeated targets', () => {
  const game = started();
  fixedRoles(game);
  game.phase = 'executive';
  game.power = 'investigate';
  applyAction(game, 'p0', { type: 'power', target: 'p6' });
  assert.match(viewFor(game, 'p0').me.notes[0].text, /Fascist party/);
  assert.doesNotMatch(viewFor(game, 'p0').me.notes[0].text, /Hitler/i);
  assert.deepEqual(viewFor(game, 'p1').me.notes, []);
  game.phase = 'executive';
  game.power = 'investigate';
  game.president = 'p1';
  assert.throws(() => applyAction(game, 'p1', { type: 'power', target: 'p6' }));
});
void test('policy peek preserves top three order and keeps it private', () => {
  const game = started(5);
  game.phase = 'executive';
  game.power = 'peek';
  const before = [...game.deck];
  applyAction(game, 'p0', { type: 'power' });
  assert.deepEqual(game.deck, before);
  assert.deepEqual(
    viewFor(game, 'p0').me.notes[0].policies,
    before.slice(0, 3),
  );
  assert.deepEqual(viewFor(game, 'p1').me.notes, []);
});
void test('special election resumes after its caller even if chosen player is the usual successor', () => {
  for (const target of ['p1', 'p4']) {
    const game = started();
    game.phase = 'executive';
    game.power = 'special-election';
    applyAction(game, 'p0', { type: 'power', target });
    assert.equal(game.president, target);
    elect(game, eligibleChancellors(game)[0], false);
    assert.equal(game.president, 'p1');
  }
});
void test('execution hides non-Hitler role, excludes dead seats and skips them in rotation', () => {
  const game = started();
  fixedRoles(game);
  game.phase = 'executive';
  game.power = 'execute';
  applyAction(game, 'p0', { type: 'power', target: 'p1' });
  assert.equal(game.president, 'p2');
  assert.equal(game.players[1].alive, false);
  assert.ok(viewFor(game, 'p2').players.every((p) => !('role' in p)));
  assert.throws(() =>
    applyAction(game, 'p1', { type: 'chat', text: 'Here is my role' }),
  );
  applyAction(game, 'p2', { type: 'nominate', target: 'p3' });
  assert.throws(() => applyAction(game, 'p1', { type: 'vote', yes: true }));
});
void test('executing Hitler immediately ends the game and reveals all roles', () => {
  const game = started();
  fixedRoles(game);
  game.phase = 'executive';
  game.power = 'execute';
  applyAction(game, 'p0', { type: 'power', target: 'p6' });
  assert.equal(game.winner, 'liberal');
  assert.ok(viewFor(game, 'p1').players.every((p) => p.role));
  assert.doesNotThrow(() =>
    applyAction(game, 'p6', { type: 'chat', text: 'Good game' }),
  );
});
void test('executive power cannot be skipped, used by someone else, or target self', () => {
  const game = started();
  game.phase = 'executive';
  game.power = 'execute';
  assert.throws(() =>
    applyAction(game, 'p0', { type: 'nominate', target: 'p2' }),
  );
  assert.throws(() => applyAction(game, 'p1', { type: 'power', target: 'p2' }));
  assert.throws(() => applyAction(game, 'p0', { type: 'power', target: 'p0' }));
});
void test('veto unlocks at five, denial forces policy enactment', () => {
  const game = started();
  fixedRoles(game);
  elect(game, 'p1');
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  assert.throws(() => applyAction(game, 'p1', { type: 'veto' }));
  game.fascist = 5;
  applyAction(game, 'p1', { type: 'veto' });
  assert.equal(viewFor(game, 'p0').me.hand.length, 0);
  assert.throws(() =>
    applyAction(game, 'p1', { type: 'veto-answer', yes: true }),
  );
  applyAction(game, 'p0', { type: 'veto-answer', yes: false });
  assert.equal(game.phase, 'chancellor-enact');
  assert.throws(() => applyAction(game, 'p1', { type: 'veto' }));
});
void test('agreed veto counts toward tracker, retains government term limits, and discards hand', () => {
  const game = started();
  fixedRoles(game);
  game.fascist = 5;
  elect(game, 'p1');
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  applyAction(game, 'p1', { type: 'veto' });
  applyAction(game, 'p0', { type: 'veto-answer', yes: true });
  assert.equal(game.tracker, 1);
  assert.equal(game.hand.length, 0);
  assert.equal(game.discard.length, 3);
  assert.equal(game.lastPresident, 'p0');
  assert.equal(game.lastChancellor, 'p1');
});
void test('third inactive government via veto triggers chaos and clears term limits', () => {
  const game = started();
  fixedRoles(game);
  game.fascist = 5;
  game.tracker = 2;
  game.deck[3] = 'liberal';
  elect(game, 'p1');
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  applyAction(game, 'p1', { type: 'veto' });
  applyAction(game, 'p0', { type: 'veto-answer', yes: true });
  assert.equal(game.liberal, 1);
  assert.equal(game.tracker, 0);
  assert.equal(game.lastChancellor, null);
});
void test('government is muted during legislation, other living players can speak', () => {
  const game = started();
  elect(game, 'p1');
  for (const id of ['p0', 'p1'])
    assert.throws(() =>
      applyAction(game, id, { type: 'chat', text: 'Secret signal' }),
    );
  assert.doesNotThrow(() =>
    applyAction(game, 'p2', { type: 'chat', text: 'I do not trust them.' }),
  );
});
void test('leaving transfers hosting; live seats stay reserved and can rejoin', () => {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  joinGame(game, 'p1', 'Player 1');
  applyAction(game, 'p0', { type: 'leave' });
  assert.equal(game.hostId, 'p1');
  const live = started();
  assert.throws(() => applyAction(live, 'p0', { type: 'kick', target: 'p1' }));
  const roles = live.players.map((p) => p.role);
  applyAction(live, 'p0', { type: 'leave' });
  assert.equal(live.hostId, 'p1');
  assert.equal(live.players[0].departed, true);
  assert.deepEqual(
    live.players.map((p) => p.role),
    roles,
  );
  assert.throws(() =>
    applyAction(live, 'p0', { type: 'chat', text: 'Still here?' }),
  );
  joinGame(live, 'p0', 'Player 0');
  assert.equal(live.players[0].departed, false);
  assert.deepEqual(
    live.players.map((p) => p.role),
    roles,
  );
  assert.equal(live.hostId, 'p1');
});
void test('finished players can leave; rematch drops departed seats and can expand to ten', () => {
  const game = started(7);
  applyAction(game, 'p2', { type: 'leave' });
  game.phase = 'finished';
  applyAction(game, 'p0', { type: 'leave' });
  assert.equal(game.hostId, 'p1');
  assert.equal(game.players.length, 6);
  applyAction(game, 'p1', { type: 'rematch' });
  assert.equal(game.phase, 'lobby');
  assert.equal(game.players.length, 5);
  assert.ok(game.players.every((p) => !p.departed && !p.role));
  applyAction(game, 'p1', { type: 'fill-bots' });
  assert.equal(game.players.length, 10);
  for (const p of game.players.filter((p) => !p.bot))
    applyAction(game, p.id, { type: 'ready' });
  applyAction(game, 'p1', { type: 'start' });
  assert.equal(game.initialCount, 10);
});
void test('rematch resets secrets, readiness, policies and knowledge but advances round', () => {
  const game = started();
  fixedRoles(game);
  game.phase = 'executive';
  game.power = 'execute';
  applyAction(game, 'p0', { type: 'power', target: 'p6' });
  const round = game.round;
  game.processed.push('test-request');
  game.revision = 70;
  applyAction(game, 'p0', { type: 'rematch' });
  assert.equal(game.phase, 'lobby');
  assert.equal(game.round, round + 1);
  assert.equal(game.revision, 70);
  assert.equal(game.players.length, 7);
  assert.ok(game.players.every((p) => !p.role && !p.ready && p.alive));
  assert.deepEqual(game.deck, []);
  assert.deepEqual(game.notes, {});
  assert.deepEqual(game.processed, ['test-request']);
});
void test('600 simulated complete games preserve all 17 policies and finish legally', () => {
  const winners = new Set<string>();
  for (let sample = 0; sample < 600; sample++) {
    const game = started(5 + (sample % 6));
    let steps = 0;
    while (game.phase !== 'finished' && steps++ < 1000) {
      const president = game.president!;
      switch (game.phase) {
        case 'nomination': {
          const eligible = eligibleChancellors(game);
          applyAction(game, president, {
            type: 'nominate',
            target: eligible[randomInt(eligible.length)],
          });
          break;
        }
        case 'voting':
          for (const p of game.players.filter((p) => p.alive))
            applyAction(game, p.id, { type: 'vote', yes: randomInt(10) > 2 });
          break;
        case 'president-discard':
          applyAction(game, president, {
            type: 'discard',
            index: randomInt(3),
          });
          break;
        case 'chancellor-enact':
          applyAction(
            game,
            game.chancellor!,
            game.fascist >= 5 && !game.vetoDenied && randomInt(4) === 0
              ? { type: 'veto' }
              : { type: 'enact', index: randomInt(2) },
          );
          break;
        case 'veto-response':
          applyAction(game, president, {
            type: 'veto-answer',
            yes: !!randomInt(2),
          });
          break;
        case 'executive': {
          const targets = game.players.filter(
            (p) =>
              p.alive &&
              p.id !== president &&
              !(
                game.power === 'investigate' && game.investigated.includes(p.id)
              ),
          );
          applyAction(game, president, {
            type: 'power',
            target: targets[randomInt(targets.length)]?.id,
          });
          break;
        }
      }
      const all = [...game.deck, ...game.discard, ...game.hand];
      assert.equal(all.length + game.liberal + game.fascist, 17);
      assert.equal(all.filter((p) => p === 'liberal').length + game.liberal, 6);
      assert.equal(
        all.filter((p) => p === 'fascist').length + game.fascist,
        11,
      );
      assert.ok(game.tracker >= 0 && game.tracker < 3);
      if (game.phase === 'nomination') assert.ok(game.deck.length >= 3);
    }
    assert.equal(game.phase, 'finished');
    assert.ok(game.winner);
    winners.add(game.winner);
  }
  assert.deepEqual([...winners].sort(), ['fascist', 'liberal']);
});
