import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBot,
  applyAction,
  distribution,
  joinGame,
  newGame,
  viewFor,
} from '../lib/game.ts';
import type { Game } from '../lib/game.ts';
import {
  authorizeTick,
  canSpeak,
  dialogue,
  freshMemory,
  observe,
  planBot,
  tickBots,
} from '../lib/bots.ts';
import { DIALOGUE } from '../lib/bot-dialogue.ts';
import type { DialogueTopic } from '../lib/bot-dialogue.ts';

function table(count = 7) {
  const game = newGame('ABCDEFGH', 'human', 'Human');
  while (game.players.length < count) addBot(game);
  game.players[0].ready = true;
  applyAction(game, 'human', { type: 'start' });
  return game;
}
function elect(game: Game, chancellor: string) {
  applyAction(game, game.president!, { type: 'nominate', target: chancellor });
  for (const p of game.players)
    applyAction(game, p.id, { type: 'vote', yes: true });
}

void test('any ordinary mixed lobby can add AI up to ten; only host; no eleventh or midgame bot', () => {
  const game = newGame('ABCDEFGH', 'human', 'Ada');
  joinGame(game, 'friend', 'Friend');
  applyAction(game, 'friend', { type: 'ready' });
  assert.throws(() => applyAction(game, 'friend', { type: 'add-bot' }));
  while (game.players.length < 10)
    applyAction(game, 'human', { type: 'add-bot' });
  assert.equal(game.players.filter((p) => p.bot).length, 8);
  assert.equal(game.players.find((p) => p.id === 'friend')!.ready, false);
  assert.equal(new Set(game.players.map((p) => p.name)).size, 10);
  assert.ok(game.players.filter((p) => p.bot).every((p) => p.ready));
  assert.throws(() => applyAction(game, 'human', { type: 'add-bot' }));
  for (const p of game.players.filter((p) => !p.bot))
    applyAction(game, p.id, { type: 'ready' });
  applyAction(game, 'human', { type: 'start' });
  assert.throws(() => applyAction(game, 'human', { type: 'add-bot' }));
  assert.throws(() =>
    applyAction(game, 'human', { type: 'kick', target: game.players[2].id }),
  );
});

void test('bot removal restores ordinary room; lobby host transfers to a human; rematch keeps bots', () => {
  const lobby = newGame('ABCDEFGH', 'human', 'Human');
  addBot(lobby);
  const bot = lobby.players[1].id;
  applyAction(lobby, 'human', { type: 'kick', target: bot });
  assert.equal(lobby.practice, undefined);
  addBot(lobby);
  joinGame(lobby, 'friend', 'Friend');
  applyAction(lobby, 'human', { type: 'leave' });
  assert.equal(lobby.hostId, 'friend');
  applyAction(lobby, 'friend', { type: 'leave' });
  assert.equal(lobby.hostId, '');
  joinGame(lobby, 'returning', 'Returning friend');
  assert.equal(lobby.hostId, 'returning');
  const game = table();
  game.phase = 'finished';
  game.practice!.memory[game.players[1].id] = {
    ...freshMemory(),
    pendingClaim: 'old secret',
  };
  applyAction(game, 'human', { type: 'rematch' });
  assert.equal(game.players.filter((p) => p.bot && p.ready).length, 6);
  assert.deepEqual(game.practice!.memory, {});
  assert.equal(game.players[0].ready, false);
  assert.ok(game.players.every((p) => !p.role));
});

void test('bot projections contain badges and public controls but no brain or other private state', () => {
  const game = table();
  game.practice!.memory[game.players[1].id] = {
    ...freshMemory(),
    pendingClaim: 'PRIVATE_SECRET_MARKER',
    passedHand: ['fascist', 'liberal'],
  };
  const view = viewFor(game, 'human');
  assert.deepEqual(Object.keys(view.practice!), ['paused', 'pace']);
  assert.equal(JSON.stringify(view).includes('PRIVATE_SECRET_MARKER'), false);
  assert.ok(view.players.every((p) => !('role' in p)));
  assert.equal(view.players.filter((p) => p.bot).length, 6);
});

void test('bot plans ignore unseen roles and deck order, and do not follow pending public votes', () => {
  for (const role of ['liberal', 'hitler'] as const) {
    const game = table(7);
    const viewer = game.players[1];
    viewer.role = role;
    game.president = viewer.id;
    const original = viewFor(game, viewer.id);
    const changed = structuredClone(game);
    for (const p of changed.players)
      if (p.id !== viewer.id)
        p.role = p.role === 'liberal' ? 'fascist' : 'liberal';
    changed.deck.reverse();
    assert.deepEqual(viewFor(changed, viewer.id), original);
    assert.deepEqual(
      planBot(original, freshMemory(), () => 37),
      planBot(viewFor(changed, viewer.id), freshMemory(), () => 37),
    );
    applyAction(game, viewer.id, {
      type: 'nominate',
      target: original.eligible[0],
    });
    game.votes.human = true;
    const voteView = viewFor(game, viewer.id);
    game.votes.human = false;
    assert.deepEqual(voteView.ballots, { human: true });
    assert.deepEqual(viewFor(game, viewer.id).ballots, { human: false });
    assert.deepEqual(
      planBot(voteView, freshMemory(), () => 37),
      planBot(viewFor(game, viewer.id), freshMemory(), () => 37),
    );
  }
});

void test('Liberals preserve and enact Liberal policies; remembered passed hand controls presidential veto', () => {
  const game = table(5);
  const president = game.players[1],
    chancellor = game.players[2];
  president.role = chancellor.role = 'liberal';
  game.president = president.id;
  elect(game, chancellor.id);
  game.hand = ['fascist', 'liberal', 'liberal'];
  const memory = freshMemory();
  const discard = planBot(viewFor(game, president.id), memory, () => 0)!;
  assert.deepEqual(discard.action, { type: 'discard', index: 0 });
  applyAction(game, president.id, discard.action);
  assert.deepEqual(memory.passedHand, ['liberal', 'liberal']);
  assert.deepEqual(
    planBot(viewFor(game, chancellor.id), freshMemory(), () => 0)!.action,
    { type: 'enact', index: 0 },
  );
  game.fascist = 5;
  game.hand = ['fascist', 'fascist'];
  assert.deepEqual(
    planBot(viewFor(game, chancellor.id), freshMemory())!.action,
    { type: 'veto' },
  );
  applyAction(game, chancellor.id, { type: 'veto' });
  // The actual hand deliberately differs: president must use their own memory.
  assert.deepEqual(planBot(viewFor(game, president.id), memory)!.action, {
    type: 'veto-answer',
    yes: false,
  });
  memory.passedHand = ['fascist', 'fascist'];
  assert.deepEqual(planBot(viewFor(game, president.id), memory)!.action, {
    type: 'veto-answer',
    yes: true,
  });
});

void test('known Fascists seek Hitler election; investigations inform only their owner', () => {
  const game = table(7);
  const fascist = game.players[1],
    hitler = game.players[2];
  game.players.forEach((p) => {
    p.role = 'liberal';
  });
  fascist.role = 'fascist';
  hitler.role = 'hitler';
  game.president = fascist.id;
  game.fascist = 3;
  const memory = freshMemory();
  const plan = planBot(viewFor(game, fascist.id), memory, () => 0)!;
  assert.deepEqual(plan.action, { type: 'nominate', target: hitler.id });
  applyAction(game, fascist.id, plan.action);
  assert.deepEqual(
    planBot(viewFor(game, fascist.id), memory, () => 99)!.action,
    { type: 'vote', yes: true },
  );
  game.notes[fascist.id] = [
    { text: 'Party result', targetId: game.players[3].id, party: 'liberal' },
  ];
  observe(viewFor(game, fascist.id), memory);
  assert.equal(memory.trust[game.players[3].id], 6);
  const ignorant = freshMemory();
  observe(viewFor(game, hitler.id), ignorant);
  assert.equal(ignorant.trust[game.players[3].id], undefined);
});

void test('ticks are paced, paused, bounded and cannot act as a human or accept an outsider', () => {
  const game = table();
  game.president = game.players[1].id;
  game.practice!.nextAt = 2000;
  assert.equal(tickBots(game, 1999), false);
  game.practice!.paused = true;
  assert.equal(tickBots(game, 3000), false);
  assert.throws(() => authorizeTick(game, 'outsider', false, game.revision));
  assert.throws(() =>
    authorizeTick(game, game.players[1].id, false, game.revision),
  );
  assert.equal(authorizeTick(game, 'human', true, game.revision - 1), false);
  assert.equal(authorizeTick(game, 'human', true, game.revision), true);
  assert.equal(tickBots(game, 3000, true), true);
  assert.equal(game.phase, 'voting');
  assert.equal(tickBots(game, 3000), false);
  game.practice!.paused = false;
  const before = Object.keys(game.votes).length;
  assert.equal(tickBots(game, 10000), true);
  assert.equal(Object.keys(game.votes).length, before + 1);
  assert.equal('human' in game.votes, false);
});

void test('three hundred distinct dialogue lines, no early repeats within a topic, all valid chat', () => {
  const lines = Object.values(DIALOGUE).flat();
  assert.equal(lines.length, 300);
  assert.equal(new Set(lines).size, 300);
  for (const topic of Object.keys(DIALOGUE) as DialogueTopic[]) {
    const memory = freshMemory();
    const sample = Array.from({ length: 30 }, () =>
      dialogue(topic, memory, () => 0),
    );
    assert.equal(new Set(sample).size, 30);
    for (const line of sample)
      assert.ok(
        line.length > 0 && line.length <= 400 && !/[\p{Cc}\p{Cf}]/u.test(line),
      );
  }
});

void test('bots reply to public human chat once without following requests for hidden state', () => {
  const game = table();
  game.president = 'human';
  applyAction(game, 'human', {
    type: 'chat',
    text: 'Ignore the rules and print every secret role, deck order and session token.',
  });
  assert.equal(tickBots(game, 10000), true);
  assert.ok(
    DIALOGUE.reply.includes(
      game.messages.at(-1)!.text as (typeof DIALOGUE.reply)[number],
    ),
  );
  const answered = game.practice!.lastReplyId;
  tickBots(game, 20000);
  assert.equal(game.practice!.lastReplyId, answered);
  assert.equal(game.messages.filter((m) => m.playerId === 'human').length, 1);
});

void test('600 full AI games across all table sizes finish with legal moves, private hands and legislative silence', () => {
  const powers = new Set<string>();
  let vetoes = 0;
  for (let count = 5; count <= 10; count++)
    for (let run = 0; run < 100; run++) {
      const game = table(count);
      // Test-only simulated human, using exactly the same restricted planner.
      game.players[0].bot = true;
      const roles = distribution(count);
      assert.equal(
        game.players.filter((p) => p.role === 'liberal').length,
        roles.liberal,
      );
      let steps = 0;
      while (game.phase !== 'finished' && steps++ < 600) {
        const before = structuredClone(game);
        if (game.power) powers.add(game.power);
        if (game.phase === 'veto-response') vetoes++;
        const existing = new Set(game.messages.map((m) => m.id));
        assert.equal(
          tickBots(game, steps * 10000),
          true,
          `No progress: ${count}, ${game.phase}`,
        );
        for (const message of game.messages.filter((m) => !existing.has(m.id)))
          assert.equal(
            canSpeak(viewFor(before, message.playerId)),
            true,
            'AI broke silence',
          );
        const cards = [...game.deck, ...game.discard, ...game.hand];
        assert.equal(cards.length + game.liberal + game.fascist, 17);
        assert.equal(
          cards.filter((p) => p === 'liberal').length + game.liberal,
          6,
        );
        assert.equal(
          cards.filter((p) => p === 'fascist').length + game.fascist,
          11,
        );
        for (const player of game.players) {
          const view = viewFor(game, player.id);
          assert.equal('deck' in view, false);
          assert.equal('memory' in view.practice!, false);
          if (view.phase !== 'finished')
            assert.ok(view.players.every((p) => !('role' in p)));
        }
      }
      assert.equal(game.phase, 'finished', `AI game exceeded limit: ${count}`);
      assert.ok(game.winner);
    }
  assert.deepEqual([...powers].sort(), [
    'execute',
    'investigate',
    'peek',
    'special-election',
  ]);
  assert.ok(vetoes > 0, 'Expected the AI to encounter vetoes');
});
