import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, joinGame, applyAction, viewFor } from '../lib/game.ts';
import {
  isYourTurn,
  legislativeGuidance,
  electionResult,
  newElectionResult,
  policyResult,
  newPolicyResult,
  policyResultTitle,
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

void test('legislative guidance names the actual sender and recipient without depending on private cards', () => {
  for (let count = 5; count <= 10; count++) {
    const { game } = fixture(count);
    assert.equal(legislativeGuidance(viewFor(game, 'p0')), null);
    applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
    for (const player of game.players)
      applyAction(game, player.id, { type: 'vote', yes: true });
    assert.match(
      legislativeGuidance(viewFor(game, 'p0'))!.description,
      /remaining two policies to Player 1/,
    );
    assert.match(legislativeGuidance(viewFor(game, 'p2'))!.title, /Player 0/);
    applyAction(game, 'p0', { type: 'discard', index: 0 });
    const chancellor = viewFor(game, 'p1');
    assert.match(
      legislativeGuidance(chancellor)!.description,
      /^Player 0 passed you these two policies/,
    );
    assert.match(legislativeGuidance(viewFor(game, 'p2'))!.title, /^Player 1/);
    assert.deepEqual(
      legislativeGuidance(chancellor),
      legislativeGuidance({
        ...chancellor,
        me: {
          ...chancellor.me,
          role: 'hitler',
          hand: ['fascist', 'fascist'],
          teammates: [],
          notes: [{ text: 'SECRET' }],
        },
      }),
    );
    game.vetoDenied = true;
    assert.match(
      legislativeGuidance(viewFor(game, 'p1'))!.description,
      /Player 0.*refused the veto/,
    );
    game.phase = 'veto-response';
    assert.match(
      legislativeGuidance(viewFor(game, 'p0'))!.title,
      /Player 1’s veto/,
    );
  }
});

void test('election reveal waits for all ballots at 5–10 seats and identifies the voted pair after rotation', async () => {
  for (let count = 5; count <= 10; count++) {
    const { game } = fixture(count);
    applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
    game.revision++;
    const voting = viewFor(game, 'p0');
    for (let i = 0; i < count - 1; i++) {
      applyAction(game, `p${i}`, { type: 'vote', yes: i % 2 === 0 });
      game.revision++;
      const partial = viewFor(game, 'p0');
      assert.equal(electionResult(partial), null);
      assert.equal(newElectionResult(voting, partial), null);
    }
    applyAction(game, `p${count - 1}`, {
      type: 'vote',
      yes: (count - 1) % 2 === 0,
    });
    game.revision++;
    const after = viewFor(game, 'p0');
    const result = newElectionResult(voting, after)!;
    assert.equal(result.yes, Math.ceil(count / 2));
    assert.equal(result.no, Math.floor(count / 2));
    assert.equal(result.passed, count % 2 === 1);
    assert.equal(result.president, 'Player 0');
    assert.equal(result.chancellor, 'Player 1');
    assert.deepEqual(
      result.ballots.map((ballot) => ballot.id),
      game.players.map((player) => player.id),
    );
    assert.equal(
      newElectionResult(after, { ...after, revision: after.revision + 1 }),
      null,
    );
    assert.equal(
      newElectionResult(after, { ...after, revision: after.revision - 1 }),
      null,
    );
    assert.equal(newElectionResult(null, after), null);
    assert.equal(
      newElectionResult(voting, { ...after, code: 'OTHERONE' }),
      null,
    );
    assert.deepEqual(
      newElectionResult(voting, {
        ...after,
        phase: 'nomination',
        president: 'p3',
        chancellor: null,
      }),
      result,
    );
    assert.equal(
      newElectionResult(voting, { ...after, phase: 'voting' }),
      null,
    );
    const secretsChanged = {
      ...after,
      me: {
        ...after.me,
        hand: ['liberal' as const],
        ballot: true,
        role: 'hitler' as const,
        notes: [{ text: 'PRIVATE' }],
      },
    };
    assert.deepEqual(electionResult(secretsChanged), result);
    game.fairness = await createFairness();
    assert.equal(newElectionResult(voting, viewFor(game, 'p0')), null);
    game.phase = 'lobby';
    assert.equal(electionResult(viewFor(game, 'p0')), null);
  }
});

void test('public policy records name the enacting chancellor and president after turn rotation, never the private hand', () => {
  const { game } = fixture();
  applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
  for (const player of game.players)
    applyAction(game, player.id, { type: 'vote', yes: true });
  game.hand = ['liberal', 'fascist', 'liberal'];
  const drawing = structuredClone(viewFor(game, 'p2'));
  assert.equal(policyResult(drawing), null);
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  game.revision++;
  const passed = structuredClone(viewFor(game, 'p2'));
  assert.equal(policyResult(passed), null);
  const handoff = tableCue(drawing, passed)!;
  assert.equal(handoff.kind, 'handoff');
  assert.equal(handoff.detail, 'Player 0 → Player 1');
  assert.ok(!JSON.stringify(handoff).includes('fascist'));
  applyAction(game, 'p1', { type: 'enact', index: 0 });
  game.revision++;
  const after = viewFor(game, 'p2');
  const result = newPolicyResult(passed, after)!;
  assert.deepEqual(game.log.find((entry) => entry.policy)!.policy, {
    kind: 'fascist',
    source: 'government',
    count: 1,
    president: { id: 'p0', name: 'Player 0' },
    chancellor: { id: 'p1', name: 'Player 1' },
  });
  assert.equal(result.round, 1);
  assert.equal(result.chancellor!.id, 'p1');
  assert.equal(policyResultTitle(result), 'Player 1 enacted a Fascist policy');
  for (const player of game.players)
    assert.deepEqual(policyResult(viewFor(game, player.id)), result);
  assert.deepEqual(
    policyResult({
      ...after,
      president: 'p4',
      chancellor: 'p5',
      lastVote: null,
    }),
    result,
  );
  assert.deepEqual(newPolicyResult(drawing, after), result);
  assert.equal(
    newPolicyResult(after, { ...after, revision: after.revision + 1 }),
    null,
  );
  assert.equal(newPolicyResult(null, after), null);
  assert.equal(
    newPolicyResult(after, { ...after, revision: after.revision - 1 }),
    null,
  );
  assert.equal(newPolicyResult(passed, { ...after, code: 'OTHERONE' }), null);
  assert.equal(
    policyResult({
      ...after,
      log: after.log.map(({ policy: _policy, ...entry }) => entry),
    }),
    null,
  );
});

void test('chaos from either failed elections or an agreed veto is never attributed to a player, even on a winning policy', () => {
  for (const viaVeto of [false, true]) {
    const { game } = fixture();
    game.tracker = 2;
    game.fascist = 5;
    game.deck[0] = 'fascist';
    let before = viewFor(game, 'p0');
    if (viaVeto) {
      game.phase = 'veto-response';
      game.chancellor = 'p1';
      game.hand = ['fascist', 'liberal'];
      before = viewFor(game, 'p0');
      applyAction(game, 'p0', { type: 'veto-answer', yes: true });
    } else {
      applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
      before = viewFor(game, 'p0');
      for (const player of game.players)
        applyAction(game, player.id, { type: 'vote', yes: false });
    }
    game.revision++;
    const after = viewFor(game, 'p0');
    const result = newPolicyResult(before, after)!;
    assert.equal(after.phase, 'finished');
    assert.equal(result.source, 'chaos');
    assert.equal(result.count, 6);
    assert.equal(result.president, null);
    assert.equal(result.chancellor, null);
    assert.equal(policyResultTitle(result), 'Chaos enacted a Fascist policy');
    assert.equal(tableCue(before, after)!.kind, 'victory');
    if (!viaVeto) assert.equal(newElectionResult(before, after)!.passed, false);
  }
});

void test('winning government policies retain their public author while a rematch clears all event history', () => {
  const { game } = fixture();
  game.phase = 'chancellor-enact';
  game.chancellor = 'p1';
  game.hand = ['liberal', 'fascist'];
  game.liberal = 4;
  const before = structuredClone(viewFor(game, 'p0'));
  applyAction(game, 'p1', { type: 'enact', index: 0 });
  game.revision++;
  const finished = viewFor(game, 'p0');
  assert.equal(newPolicyResult(before, finished)!.chancellor!.name, 'Player 1');
  assert.equal(newPolicyResult(before, finished)!.count, 5);
  assert.equal(tableCue(before, finished)!.kind, 'victory');
  applyAction(game, 'p0', { type: 'rematch' });
  game.revision++;
  const lobby = viewFor(game, 'p0');
  assert.equal(newPolicyResult(finished, lobby), null);
  assert.equal(policyResult(lobby), null);
  assert.equal(electionResult(lobby), null);
});
