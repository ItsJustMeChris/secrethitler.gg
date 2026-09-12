import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, joinGame, applyAction, viewFor } from '../lib/game.ts';
import {
  isYourTurn,
  playerOffice,
  playerSelection,
  tableCue,
} from '../lib/game-presentation.ts';
import { closedDossier, dossierReducer } from '../lib/dossier.ts';
import { createFairness } from '../lib/fairness.ts';

function fixture(count = 7) {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  for (let i = 1; i < count; i++) joinGame(game, `p${i}`, `Player ${i}`);
  for (const p of game.players) applyAction(game, p.id, { type: 'ready' });
  const lobby = viewFor(game, 'p0');
  applyAction(game, 'p0', { type: 'start' });
  game.revision = 1;
  game.president = 'p0';
  return { game, lobby, view: viewFor(game, 'p0') };
}

void test('offices follow nominations and rotation for all viewers, independent of their secret role', () => {
  const { game } = fixture();
  assert.equal(playerOffice(viewFor(game, 'p1'), 'p0')?.kind, 'president');
  assert.equal(playerOffice(viewFor(game, 'p1'), 'p1'), null);
  applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
  for (const viewer of game.players) {
    const view = viewFor(game, viewer.id);
    assert.equal(playerOffice(view, 'p0')?.label, 'President');
    assert.equal(playerOffice(view, 'p1')?.label, 'Chancellor');
    assert.equal(playerOffice(view, 'p2'), null);
  }
  for (const voter of game.players)
    applyAction(game, voter.id, { type: 'vote', yes: false });
  const next = viewFor(game, 'p0');
  assert.equal(playerOffice(next, 'p0'), null);
  assert.equal(playerOffice(next, 'p1')?.kind, 'president');
  for (const phase of ['lobby', 'finished'] as const)
    assert.equal(playerOffice({ ...next, phase }, 'p1'), null);
  game.players[1].alive = false;
  assert.equal(playerOffice(viewFor(game, 'p0'), 'p1'), null);
});

void test('every seated player gets the opening dossier at every table size, including restoration midgame', () => {
  for (let count = 5; count <= 10; count++) {
    const { game, lobby } = fixture(count);
    for (const player of game.players) {
      const waiting = dossierReducer(closedDossier, {
        type: 'receive',
        game: lobby,
        visible: true,
      });
      assert.equal(waiting.open, false);
      const event = {
        type: 'receive' as const,
        game: viewFor(game, player.id),
        visible: true,
      };
      const dealt = dossierReducer(waiting, event);
      assert.equal(dealt.open, true, `${count} players, ${player.id}`);
      assert.equal(dealt.pending, true);
      assert.equal(dossierReducer(dealt, { type: 'expire' }).open, true);
      const closed = dossierReducer(dealt, { type: 'dismiss' });
      assert.equal(
        dossierReducer(closed, event).open,
        false,
        'polling must not undo dismissal',
      );
      assert.equal(dossierReducer(closed, { type: 'resume' }).open, false);
      assert.equal(
        dossierReducer(closedDossier, event).open,
        true,
        'restoration must reveal the role',
      );
    }
  }
});

void test('a backgrounded opening reveal resumes until acknowledged; manual peeks still hide and expire', () => {
  const { view } = fixture();
  let state = dossierReducer(closedDossier, {
    type: 'receive',
    game: view,
    visible: false,
  });
  assert.equal(state.open, false);
  assert.equal(state.pending, true);
  state = dossierReducer(state, { type: 'resume' });
  assert.equal(state.open, true);
  state = dossierReducer(state, { type: 'hide' });
  assert.equal(state.open, false);
  state = dossierReducer(state, {
    type: 'receive',
    game: { ...view, revision: 2 },
    visible: false,
  });
  state = dossierReducer(state, { type: 'resume' });
  assert.equal(state.open, true);
  state = dossierReducer(state, { type: 'dismiss' });
  state = dossierReducer(state, { type: 'open' });
  assert.equal(state.open, true);
  assert.equal(state.pending, false);
  assert.equal(dossierReducer(state, { type: 'expire' }).open, false);
  state = dossierReducer(state, { type: 'hide' });
  assert.equal(dossierReducer(state, { type: 'resume' }).open, false);
});

void test('rematches reveal even when the same role is dealt and the client missed the lobby', async () => {
  const { game } = fixture();
  game.fairness = await createFairness();
  let state = dossierReducer(closedDossier, {
    type: 'receive',
    game: viewFor(game, 'p0'),
    visible: true,
  });
  state = dossierReducer(state, { type: 'dismiss' });
  const oldMatch = state.match;
  game.fairness = await createFairness();
  state = dossierReducer(state, {
    type: 'receive',
    game: viewFor(game, 'p0'),
    visible: true,
  });
  assert.notEqual(state.match, oldMatch);
  assert.equal(state.open, true);
  assert.equal(
    dossierReducer(state, { type: 'expire' }).open,
    true,
    'a stale timeout cannot close a new reveal',
  );
});

void test('lobby, finished games and leaving clear pending reveals without breaking manual endgame dossiers', () => {
  const { view, lobby } = fixture();
  const dealt = dossierReducer(closedDossier, {
    type: 'receive',
    game: view,
    visible: true,
  });
  const waiting = dossierReducer(dealt, {
    type: 'receive',
    game: lobby,
    visible: true,
  });
  assert.equal(waiting.open, false);
  assert.equal(
    dossierReducer(waiting, { type: 'receive', game: view, visible: true })
      .open,
    true,
  );
  const finished = { ...view, phase: 'finished' as const };
  const ended = dossierReducer(dealt, {
    type: 'receive',
    game: finished,
    visible: true,
  });
  assert.equal(ended.open, false);
  assert.equal(ended.pending, false);
  assert.equal(
    dossierReducer(closedDossier, {
      type: 'receive',
      game: finished,
      visible: true,
    }).open,
    false,
  );
  const manual = dossierReducer(ended, { type: 'open' });
  assert.equal(
    dossierReducer(manual, { type: 'receive', game: finished, visible: true })
      .open,
    true,
  );
  assert.deepEqual(dossierReducer(dealt, { type: 'reset' }), closedDossier);
});

void test('floor nomination choices agree with authoritative eligibility at every table size and living-player threshold', () => {
  for (let count = 5; count <= 10; count++) {
    for (const eliminated of [false, true]) {
      const { game } = fixture(count);
      game.lastPresident = 'p1';
      game.lastChancellor = 'p2';
      if (eliminated) game.players.at(-1)!.alive = false;
      const selection = playerSelection(viewFor(game, 'p0'))!;
      assert.equal(selection.kind, 'nominate');
      for (const target of game.players) {
        let accepted = true;
        try {
          applyAction(structuredClone(game), 'p0', {
            type: 'nominate',
            target: target.id,
          });
        } catch {
          accepted = false;
        }
        const option = selection.options.find((o) => o.player.id === target.id);
        assert.equal(
          !!option && !option.disabledReason,
          accepted,
          `${count} players, eliminated=${eliminated}, target=${target.id}`,
        );
      }
      assert.equal(playerSelection(viewFor(game, 'p1')), null);
    }
  }
});

void test('floor power choices match the server, including investigated, departed and eliminated targets', () => {
  for (let count = 5; count <= 10; count++) {
    for (const power of [
      'investigate',
      'special-election',
      'execute',
    ] as const) {
      const { game } = fixture(count);
      game.phase = 'executive';
      game.power = power;
      game.investigated = ['p2'];
      game.players[3].departed = true;
      game.players.at(-1)!.alive = false;
      const selection = playerSelection(viewFor(game, 'p0'))!;
      assert.equal(selection.kind, power);
      for (const target of game.players) {
        let accepted = true;
        try {
          applyAction(structuredClone(game), 'p0', {
            type: 'power',
            target: target.id,
          });
        } catch {
          accepted = false;
        }
        const option = selection.options.find((o) => o.player.id === target.id);
        assert.equal(
          !!option && !option.disabledReason,
          accepted,
          `${count} players, ${power}, target=${target.id}`,
        );
      }
      assert.equal(playerSelection(viewFor(game, 'p1')), null);
    }
  }
});

void test('floor choices disappear outside targeted phases and for eliminated or departed actors', () => {
  const { view } = fixture();
  for (const phase of [
    'lobby',
    'voting',
    'president-discard',
    'chancellor-enact',
    'veto-response',
    'finished',
  ] as const)
    assert.equal(playerSelection({ ...view, phase }), null);
  assert.equal(
    playerSelection({ ...view, phase: 'executive', power: 'peek' }),
    null,
  );
  assert.equal(
    playerSelection({
      ...view,
      players: view.players.map((p) =>
        p.id === view.me.id ? { ...p, alive: false } : p,
      ),
    }),
    null,
  );
  assert.equal(
    playerSelection({
      ...view,
      players: view.players.map((p) =>
        p.id === view.me.id ? { ...p, departed: true } : p,
      ),
    }),
    null,
  );
});

void test('turn guidance identifies only an actionable living seat across every phase', () => {
  const { view } = fixture();
  for (const phase of [
    'nomination',
    'president-discard',
    'veto-response',
    'executive',
  ] as const) {
    assert.equal(isYourTurn({ ...view, phase }), true);
    assert.equal(isYourTurn({ ...view, phase, president: 'p1' }), false);
  }
  assert.equal(
    isYourTurn({ ...view, phase: 'chancellor-enact', chancellor: 'p0' }),
    true,
  );
  assert.equal(
    isYourTurn({ ...view, phase: 'chancellor-enact', chancellor: 'p1' }),
    false,
  );
  assert.equal(
    isYourTurn({ ...view, phase: 'voting', me: { ...view.me, ballot: null } }),
    true,
  );
  assert.equal(
    isYourTurn({ ...view, phase: 'voting', me: { ...view.me, ballot: false } }),
    false,
  );
  for (const phase of ['lobby', 'finished'] as const)
    assert.equal(isYourTurn({ ...view, phase }), false);
  assert.equal(
    isYourTurn({
      ...view,
      players: view.players.map((p) => ({ ...p, alive: false })),
    }),
    false,
  );
});

void test('cues ignore initial load, room changes, duplicate polls, stale revisions and rematches', () => {
  const { view, lobby } = fixture();
  assert.equal(tableCue(null, view), null);
  assert.equal(
    tableCue(view, { ...view, code: 'OTHERONE', revision: 2 }),
    null,
  );
  assert.equal(tableCue(view, { ...view, phase: 'finished' }), null);
  assert.equal(tableCue(view, { ...view, revision: 0, liberal: 1 }), null);
  assert.equal(tableCue(view, { ...lobby, revision: 2 }), null);
  assert.equal(tableCue(view, { ...view, revision: 2 }), null);
});

void test('deal and policy cues depend on public events and contain no role or hand data', () => {
  const { view, lobby } = fixture();
  const deal = tableCue(lobby, view);
  assert.equal(deal?.kind, 'deal');
  assert.equal(
    tableCue(view, { ...view, revision: 2, liberal: 1 })?.party,
    'liberal',
  );
  const fascist = { ...view, revision: 2, fascist: 3 };
  assert.match(tableCue(view, fascist)!.detail, /Hitler/);
  const changedSecrets = {
    ...fascist,
    me: {
      ...fascist.me,
      role: 'hitler' as const,
      teammates: [],
      hand: ['fascist' as const],
      notes: [{ text: 'DO NOT REVEAL' }],
    },
  };
  assert.deepEqual(tableCue(view, fascist), tableCue(view, changedSecrets));
  assert.ok(!JSON.stringify(deal).includes('teammates'));
});

void test('ballots are announced only after simultaneous public reveal', () => {
  const { view } = fixture();
  const voting = { ...view, phase: 'voting' as const };
  assert.equal(
    tableCue(voting, { ...voting, revision: 2, voted: ['p0'] }),
    null,
  );
  const elected = {
    ...view,
    revision: 2,
    phase: 'president-discard' as const,
    lastVote: {
      president: 'p0',
      chancellor: 'p1',
      votes: {
        p0: true,
        p1: false,
        p2: true,
        p3: true,
        p4: true,
        p5: false,
        p6: false,
      },
      passed: true,
      round: 1,
    },
  };
  assert.deepEqual(tableCue(voting, elected), {
    id: 'ABCDEFGH:2',
    kind: 'election',
    title: 'Government elected',
    detail: '4 Ja · 3 Nein',
  });
});

void test('execution cues do not reveal allegiance, and victory takes precedence', () => {
  const { view } = fixture();
  const execution = {
    ...view,
    revision: 2,
    players: view.players.map((p) => ({ ...p, alive: p.id !== 'p1' })),
  };
  const cue = tableCue(view, execution);
  assert.equal(cue?.kind, 'execution');
  assert.equal(cue?.party, undefined);
  assert.equal(cue?.title, 'Player 1 was executed');
  const ended = {
    ...execution,
    phase: 'finished' as const,
    winner: 'liberal' as const,
    winReason: 'Hitler was executed.',
  };
  assert.equal(tableCue(view, ended)?.kind, 'victory');
  assert.equal(tableCue(view, ended)?.party, 'liberal');
});
