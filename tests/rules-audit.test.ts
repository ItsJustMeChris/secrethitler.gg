// Independent rulebook oracles. Do not derive expectations from engine helpers.
// Sources and bounded coverage are recorded in docs/RULES-AUDIT.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  eligibleChancellors,
  newGame,
  RuleError,
  viewFor,
} from '../lib/game.ts';
import type { Action, Game, Phase, Policy, Power, Role } from '../lib/game.ts';

const L: Policy = 'liberal';
const F: Policy = 'fascist';
const TRACKS: Record<number, (Power | null)[]> = {
  5: [null, null, 'peek', 'execute', 'execute', null],
  6: [null, null, 'peek', 'execute', 'execute', null],
  7: [null, 'investigate', 'special-election', 'execute', 'execute', null],
  8: [null, 'investigate', 'special-election', 'execute', 'execute', null],
  9: [
    'investigate',
    'investigate',
    'special-election',
    'execute',
    'execute',
    null,
  ],
  10: [
    'investigate',
    'investigate',
    'special-election',
    'execute',
    'execute',
    null,
  ],
};
const LIBERALS = [3, 4, 4, 5, 5, 6];

// A deterministic, policy-conserving fixture, independent of start/shuffle.
function table(n = 7): Game {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  game.players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    alive: true,
    ready: true,
    role: (i < LIBERALS[n - 5] ? L : i === n - 1 ? 'hitler' : F) as Role,
  }));
  Object.assign(game, {
    initialCount: n,
    president: 'p0',
    phase: 'nomination',
    round: 1,
  });
  policies(game);
  return game;
}

function policies(
  game: Game,
  liberal = 0,
  fascist = 0,
  top: Policy[] = [],
  remaining?: number,
) {
  game.liberal = liberal;
  game.fascist = fascist;
  const pool: Policy[] = [
    ...Array(6 - liberal).fill(L),
    ...Array(11 - fascist).fill(F),
  ];
  for (const policy of top) {
    const i = pool.indexOf(policy);
    assert.notEqual(i, -1, 'fixture must conserve each policy color');
    pool.splice(i, 1);
  }
  const all = [...top, ...pool];
  game.deck = all.slice(0, remaining ?? all.length);
  game.discard = all.slice(remaining ?? all.length);
  game.hand = [];
  conserved(game);
}

function conserved(game: Game) {
  const cards = [...game.deck, ...game.discard, ...game.hand];
  assert.equal(cards.filter((p) => p === L).length + game.liberal, 6);
  assert.equal(cards.filter((p) => p === F).length + game.fascist, 11);
  assert.ok(game.tracker >= 0 && game.tracker <= 2);
}

function elect(game: Game, target = 'p1', yes = true) {
  applyAction(game, game.president!, { type: 'nominate', target });
  for (const p of game.players.filter((p) => p.alive))
    applyAction(game, p.id, { type: 'vote', yes });
}

function reject(game: Game, actor: string, action: Action) {
  const before = structuredClone(game);
  assert.throws(() => applyAction(game, actor, action), RuleError);
  assert.deepEqual(
    game,
    before,
    `rejected ${action.type} must leave state unchanged`,
  );
}

void test('R01: eligibility exhausts seats, zero-to-two deaths and previous elected pairs at every size', (t) => {
  let cases = 0;
  for (let n = 5; n <= 10; n++) {
    const game = table(n);
    // Two executions maximum; Hitler cannot be dead in a continuing match.
    for (let mask = 0; mask < 2 ** (n - 1); mask++) {
      if (mask.toString(2).replaceAll('0', '').length > 2) continue;
      game.players.forEach((p, i) => {
        p.alive = !(mask & (1 << i));
      });
      const alive = game.players.filter((p) => p.alive).map((p) => p.id);
      const prior: [string | null, string | null][] = [[null, null]];
      for (const p of game.players)
        for (const c of game.players)
          if (p.id !== c.id) prior.push([p.id, c.id]);
      for (const president of alive)
        for (const [lastPresident, lastChancellor] of prior) {
          Object.assign(game, { president, lastPresident, lastChancellor });
          const forbidden = new Set([president, lastChancellor]);
          if (alive.length > 5) forbidden.add(lastPresident);
          const expected = alive.filter((id) => !forbidden.has(id));
          assert.deepEqual(eligibleChancellors(game), expected);
          cases++;
        }
    }
  }
  t.diagnostic(
    `${cases} eligibility states checked against independent set subtraction`,
  );
});

void test('R02: every ballot pattern at 5–10 initial seats and zero-to-two executions uses strict majority', (t) => {
  let cases = 0;
  for (let n = 5; n <= 10; n++)
    for (let deaths = 0; deaths <= 2; deaths++) {
      const base = table(n);
      for (let d = 0; d < deaths; d++) base.players[n - 2 - d].alive = false;
      const living = base.players.filter((p) => p.alive);
      for (let mask = 0; mask < 2 ** living.length; mask++) {
        const game = structuredClone(base);
        game.tracker = 1;
        game.lastPresident = `p${n - 2}`;
        game.lastChancellor = `p${n - 1}`;
        applyAction(game, 'p0', { type: 'nominate', target: 'p1' });
        const ballots: Record<string, boolean> = {};
        living.forEach((p, i) => {
          ballots[p.id] = !!(mask & (1 << i));
          applyAction(game, p.id, { type: 'vote', yes: ballots[p.id] });
          if (i < living.length - 1) {
            assert.equal(
              game.phase,
              'voting',
              'even a decisive partial tally waits for everyone',
            );
            assert.equal(viewFor(game, living[i + 1].id).lastVote, null);
            assert.deepEqual(viewFor(game, living[i + 1].id).ballots, ballots);
          }
        });
        const yes = Object.values(ballots).filter(Boolean).length;
        const passed = yes >= Math.floor(living.length / 2) + 1;
        assert.equal(game.lastVote?.passed, passed);
        assert.deepEqual(game.lastVote?.votes, ballots);
        assert.equal(game.phase, passed ? 'president-discard' : 'nomination');
        assert.equal(game.tracker, passed ? 1 : 2);
        assert.equal(game.lastPresident, passed ? 'p0' : `p${n - 2}`);
        assert.equal(game.lastChancellor, passed ? 'p1' : `p${n - 1}`);
        assert.equal(game.president, passed ? 'p0' : 'p1');
        assert.equal(game.hand.length, passed ? 3 : 0);
        conserved(game);
        cases++;
      }
    }
  t.diagnostic(
    `${cases} complete elections; all 3–10 survivor-count ballot patterns included`,
  );
});

void test('R03: all ordered hands and discard/enact choices conserve cards and dispatch the printed power tracks', (t) => {
  let cases = 0;
  for (let n = 5; n <= 10; n++)
    for (let fascist = 0; fascist <= 5; fascist++)
      for (let mask = 0; mask < 8; mask++)
        for (let discard = 0; discard < 3; discard++)
          for (let enact = 0; enact < 2; enact++) {
            const game = table(n);
            const hand: Policy[] = [0, 1, 2].map((i) =>
              mask & (1 << i) ? F : L,
            );
            policies(game, 0, fascist, hand);
            // Track is fixed by starting size even after an execution.
            if (fascist >= 4) game.players[n - 2].alive = false;
            const top = [...game.deck];
            game.tracker = 2;
            elect(game);
            assert.deepEqual(game.hand, hand);
            assert.deepEqual(game.deck, top.slice(3));
            applyAction(game, 'p0', { type: 'discard', index: discard });
            const passed = hand.filter((_, i) => i !== discard);
            assert.deepEqual(game.hand, passed, 'passing must preserve order');
            applyAction(game, 'p1', { type: 'enact', index: enact });
            const chosen = passed[enact];
            assert.equal(game.liberal, chosen === L ? 1 : 0);
            assert.equal(game.fascist, fascist + (chosen === F ? 1 : 0));
            assert.deepEqual(game.discard, [hand[discard], passed[1 - enact]]);
            assert.equal(game.tracker, 0);
            assert.deepEqual(game.hand, []);
            const power: Power | null =
              chosen === F ? TRACKS[n][fascist] : null;
            const wins: boolean = chosen === F && fascist === 5;
            assert.equal(game.power, power);
            assert.equal(
              game.phase,
              wins ? 'finished' : power ? 'executive' : 'nomination',
            );
            assert.equal(game.winner, wins ? F : null);
            conserved(game);
            cases++;
          }
  t.diagnostic(
    `${cases} legislative paths, independent expectations for all six printed tracks`,
  );
});

void test('R04: chaos enacts the exact top card, ignores every power, clears limits, and can win for either party', () => {
  for (let n = 5; n <= 10; n++)
    for (const color of ['liberal', 'fascist'] as const) {
      const policy: Policy = color;
      for (let enacted = 0; enacted < (policy === L ? 5 : 6); enacted++) {
        const game = table(n);
        policies(game, policy === L ? enacted : 0, policy === F ? enacted : 0, [
          policy,
        ]);
        const before = [...game.deck];
        game.tracker = 2;
        game.lastPresident = 'p2';
        game.lastChancellor = 'p3';
        // Even nominating Hitler in the danger zone cannot win on a failed election.
        elect(game, `p${n - 1}`, false);
        assert.equal(game[policy], enacted + 1);
        assert.deepEqual(game.deck, before.slice(1));
        assert.equal(game.tracker, 0);
        assert.equal(game.power, null);
        assert.equal(game.lastPresident, null);
        assert.equal(game.lastChancellor, null);
        assert.equal(
          game.winner,
          enacted + 1 === (policy === L ? 5 : 6) ? policy : null,
        );
        conserved(game);
      }
    }
});

void test('R05: Hitler wins only on election as chancellor at 3+ fascist policies, before drawing', () => {
  for (let n = 5; n <= 10; n++)
    for (let fascist = 0; fascist <= 5; fascist++)
      for (const office of ['president', 'chancellor'] as const) {
        const game = table(n);
        policies(game, 0, fascist);
        if (office === 'president') game.president = `p${n - 1}`;
        const before = [...game.deck];
        elect(game, office === 'chancellor' ? `p${n - 1}` : 'p1');
        const wins = office === 'chancellor' && fascist >= 3;
        assert.equal(game.winner, wins ? F : null);
        assert.equal(game.phase, wins ? 'finished' : 'president-discard');
        assert.deepEqual(game.deck, wins ? before : before.slice(3));
        assert.equal(game.hand.length, wins ? 0 : 3);
        if (fascist >= 3 && !wins)
          assert.ok(
            game.log.some(
              (e) => e.text === 'Player 1 is confirmed not to be Hitler.',
            ),
          );
        conserved(game);
      }
  for (let n = 5; n <= 10; n++) {
    const game = table(n);
    policies(game, 4, 0, [L, F, L]);
    elect(game);
    applyAction(game, 'p0', { type: 'discard', index: 1 });
    applyAction(game, 'p1', { type: 'enact', index: 0 });
    assert.equal(game.winner, L);
    assert.equal(game.liberal, 5);
    assert.equal(game.phase, 'finished');
    conserved(game);
  }
});

void test('R06: reshuffle boundaries include leftovers and both discards before a policy peek', () => {
  for (let remaining = 0; remaining <= 3; remaining++) {
    const game = table(5);
    policies(game, 0, 2, [F, F, F], remaining + 3);
    const expected: Policy[] = [
      ...game.deck.slice(3),
      ...game.discard,
      F,
      F,
    ].sort();
    const oldDeck = game.deck.slice(3);
    elect(game);
    applyAction(game, 'p0', { type: 'discard', index: 0 });
    applyAction(game, 'p1', { type: 'enact', index: 0 });
    assert.equal(game.power, 'peek');
    if (remaining < 3) {
      assert.equal(game.discard.length, 0);
      assert.deepEqual([...game.deck].sort(), expected);
    } else {
      assert.deepEqual(game.deck, oldDeck);
      assert.ok(game.discard.length > 0);
    }
    const before = [...game.deck];
    applyAction(game, 'p0', { type: 'power' });
    assert.deepEqual(game.deck, before);
    assert.deepEqual(
      viewFor(game, 'p0').me.notes[0].policies,
      before.slice(0, 3),
    );
    for (const p of game.players.slice(1))
      assert.deepEqual(viewFor(game, p.id).me.notes, []);
    conserved(game);
  }
  for (const remaining of [3, 4]) {
    const game = table(5);
    policies(game, 0, 0, [F], remaining);
    game.tracker = 2;
    const all = [...game.deck.slice(1), ...game.discard].sort();
    elect(game, 'p1', false);
    assert.equal(game.fascist, 1);
    assert.equal(game.deck.length, remaining === 3 ? 16 : 3);
    if (remaining === 3) assert.deepEqual([...game.deck].sort(), all);
    conserved(game);
  }
});

void test('R07: veto unlock, denial, consent, term limits, chaos and deck exhaustion', () => {
  for (let fascist = 0; fascist <= 5; fascist++) {
    const game = table();
    policies(game, 0, fascist, [L, F, F]);
    elect(game);
    reject(game, 'p0', { type: 'veto' });
    applyAction(game, 'p0', { type: 'discard', index: 0 });
    if (fascist < 5) {
      reject(game, 'p1', { type: 'veto' });
      continue;
    }
    applyAction(game, 'p1', { type: 'veto' });
    const before = [...game.hand];
    reject(game, 'p1', { type: 'veto-answer', yes: false });
    applyAction(game, 'p0', { type: 'veto-answer', yes: false });
    assert.deepEqual(game.hand, before);
    reject(game, 'p1', { type: 'veto' });
    applyAction(game, 'p1', { type: 'enact', index: 0 });
    assert.equal(game.winner, F);
    conserved(game);
  }
  for (let tracker = 0; tracker <= 2; tracker++)
    for (let remaining = 0; remaining <= 3; remaining++) {
      const game = table();
      // With at least three remaining, the next policy is known; otherwise assert
      // conservation and both legal victory outcomes without assuming shuffle order.
      policies(game, 0, 5, [F, F, F, L], remaining + 3);
      game.tracker = tracker;
      elect(game);
      applyAction(game, 'p0', { type: 'discard', index: 0 });
      applyAction(game, 'p1', { type: 'veto' });
      applyAction(game, 'p0', { type: 'veto-answer', yes: true });
      assert.deepEqual(game.hand, []);
      assert.equal(game.tracker, (tracker + 1) % 3);
      if (tracker < 2) {
        assert.equal(game.lastPresident, 'p0');
        assert.equal(game.lastChancellor, 'p1');
        assert.equal(game.fascist, 5);
        assert.equal(game.liberal, 0);
        assert.equal(game.president, 'p1');
      } else {
        assert.equal(game.lastPresident, null);
        assert.equal(game.lastChancellor, null);
        assert.equal(game.liberal + game.fascist, 6);
        if (remaining === 3)
          assert.equal(game.liberal, 1, 'a sufficient deck keeps its top card');
      }
      if (game.phase !== 'finished') assert.ok(game.deck.length >= 3);
      conserved(game);
    }
  // Pin the documented end-of-session-before-chaos timing interpretation.
  // A stream of zero swap indices rotates the input one position left, so
  // replenishing changes the known top Fascist policy to a known Liberal.
  const game = table();
  policies(game, 0, 5, [F, F, F, F], 4);
  game.tracker = 2;
  game.fairness = {
    id: 'audit-only',
    commitment: '',
    seed: '',
    words: Array(64).fill(0),
    cursor: 0,
    events: [],
    seats: [],
  };
  elect(game);
  applyAction(game, 'p0', { type: 'discard', index: 0 });
  applyAction(game, 'p1', { type: 'veto' });
  applyAction(game, 'p0', { type: 'veto-answer', yes: true });
  assert.equal(game.fascist, 5);
  assert.equal(game.liberal, 1);
  assert.equal(game.winner, null);
  assert.equal(game.fairness.events.length, 1);
  assert.equal(game.fairness.events[0].output[0], L);
  conserved(game);
});

void test('R08: special elections resume after every caller/target pair on rejection, legislation, chaos and execution', (t) => {
  let cases = 0;
  for (let n = 7; n <= 10; n++)
    for (let caller = 0; caller < n; caller++)
      for (let target = 0; target < n; target++)
        if (target !== caller)
          for (const outcome of [
            'rejected',
            'liberal',
            'chaos',
            'execute-caller',
            'execute-successor',
          ]) {
            const game = table(n);
            policies(
              game,
              0,
              3,
              outcome.startsWith('execute') ? [F, F, F] : [L, L, L],
            );
            Object.assign(game, {
              president: `p${caller}`,
              phase: 'executive',
              power: 'special-election',
              lastPresident: `p${caller}`,
              lastChancellor: `p${target}`,
            });
            applyAction(game, `p${caller}`, {
              type: 'power',
              target: `p${target}`,
            });
            assert.equal(
              game.president,
              `p${target}`,
              'term limits never forbid the presidency',
            );
            const candidate = game.players.find(
              (p) =>
                p.id !== game.president &&
                p.id !== game.lastPresident &&
                p.id !== game.lastChancellor &&
                p.role !== 'hitler',
            )!;
            if (outcome === 'chaos') game.tracker = 2;
            elect(
              game,
              candidate.id,
              outcome !== 'rejected' && outcome !== 'chaos',
            );
            if (outcome !== 'rejected' && outcome !== 'chaos') {
              applyAction(game, `p${target}`, { type: 'discard', index: 0 });
              applyAction(game, candidate.id, { type: 'enact', index: 0 });
              if (outcome.startsWith('execute')) {
                const victim =
                  outcome === 'execute-caller' ? caller : (caller + 1) % n;
                if (victim === target) continue; // self execution is forbidden
                applyAction(game, `p${target}`, {
                  type: 'power',
                  target: `p${victim}`,
                });
                if (game.players[victim].role === 'hitler') {
                  assert.equal(game.winner, L);
                  continue;
                }
              }
            }
            let successor = (caller + 1) % n;
            while (!game.players[successor].alive)
              successor = (successor + 1) % n;
            assert.equal(game.president, `p${successor}`);
            assert.equal(game.specialReturn, null);
            assert.equal(game.phase, 'nomination');
            conserved(game);
            cases++;
          }
  t.diagnostic(`${cases} nonterminal special-election paths checked`);
});

void test('R09: investigations distinguish party from role; executions remove rights but keep non-Hitler secrets', () => {
  for (const power of ['investigate', 'execute'] as const)
    for (const identity of ['liberal', 'fascist', 'hitler'] as const) {
      const role: Role = identity;
      const game = table(9);
      const target = game.players.find(
        (p) => p.id !== 'p0' && p.role === role,
      )!;
      Object.assign(game, { phase: 'executive', power });
      reject(game, 'p0', { type: 'power', target: 'p0' });
      reject(game, 'p1', { type: 'power', target: target.id });
      reject(game, 'p0', { type: 'power', target: 'missing' });
      applyAction(game, 'p0', { type: 'power', target: target.id });
      if (power === 'investigate') {
        assert.equal(game.notes.p0[0].party, role === L ? L : F);
        assert.equal('role' in game.notes.p0[0], false);
        assert.deepEqual(game.investigated, [target.id]);
        for (const p of game.players.slice(1))
          assert.deepEqual(viewFor(game, p.id).me.notes, []);
        Object.assign(game, { phase: 'executive', power, president: 'p0' });
        reject(game, 'p0', { type: 'power', target: target.id });
      } else if (role === 'hitler') {
        assert.equal(game.winner, L);
        assert.equal(game.phase, 'finished');
      } else {
        assert.equal(target.alive, false);
        assert.equal(game.winner, null);
        assert.ok(viewFor(game, 'p1').players.every((p) => !('role' in p)));
        reject(game, target.id, { type: 'chat', text: 'My role' });
        reject(game, target.id, { type: 'nominate', target: 'p2' });
        const candidate = game.players.find(
          (p) => p.alive && p.id !== game.president,
        )!;
        applyAction(game, game.president!, {
          type: 'nominate',
          target: candidate.id,
        });
        reject(game, target.id, { type: 'vote', yes: true });
        Object.assign(game, { phase: 'executive', power, president: 'p0' });
        reject(game, 'p0', { type: 'power', target: target.id });
      }
    }
});

void test('R10: unauthorized phase/actor actions reject atomically, and legislative silence covers all three phases', () => {
  const actions: { action: Action; phase: Phase; actor: string }[] = [
    {
      action: { type: 'nominate', target: 'p2' },
      phase: 'nomination',
      actor: 'p0',
    },
    { action: { type: 'vote', yes: true }, phase: 'voting', actor: '*' },
    {
      action: { type: 'discard', index: 0 },
      phase: 'president-discard',
      actor: 'p0',
    },
    {
      action: { type: 'enact', index: 0 },
      phase: 'chancellor-enact',
      actor: 'p1',
    },
    { action: { type: 'veto' }, phase: 'chancellor-enact', actor: 'p1' },
    {
      action: { type: 'veto-answer', yes: true },
      phase: 'veto-response',
      actor: 'p0',
    },
    {
      action: { type: 'power', target: 'p2' },
      phase: 'executive',
      actor: 'p0',
    },
  ];
  const phases: Phase[] = [
    'lobby',
    'nomination',
    'voting',
    'president-discard',
    'chancellor-enact',
    'veto-response',
    'executive',
    'finished',
  ];
  for (const phase of phases)
    for (const { action, phase: allowed, actor } of actions)
      for (const id of ['p0', 'p1', 'p2', 'outsider']) {
        if (
          phase === allowed &&
          (id === actor || (actor === '*' && id !== 'outsider'))
        )
          continue;
        const game = table();
        Object.assign(game, {
          phase,
          chancellor: 'p1',
          power: 'execute',
          fascist: 5,
        });
        reject(game, id, action);
      }
  for (const phase of [
    'president-discard',
    'chancellor-enact',
    'veto-response',
  ] as const) {
    const game = table();
    Object.assign(game, { phase, chancellor: 'p1' });
    reject(game, 'p0', { type: 'chat', text: 'A signal' });
    reject(game, 'p1', { type: 'chat', text: 'A signal' });
    applyAction(game, 'p2', {
      type: 'chat',
      text: 'A public claim, including a bluff, is allowed.',
    });
    assert.equal(game.messages.length, 1);
  }
  for (const phase of ['president-discard', 'chancellor-enact'] as const) {
    const game = table();
    Object.assign(game, { phase, chancellor: 'p1' });
    for (const index of [
      -1,
      0.5,
      NaN,
      Infinity,
      phase === 'president-discard' ? 3 : 2,
    ])
      reject(game, phase === 'president-discard' ? 'p0' : 'p1', {
        type: phase === 'president-discard' ? 'discard' : 'enact',
        index,
      });
  }
});

void test('R11: secret substitutions cannot change an unauthorized serialized view', () => {
  for (let n = 5; n <= 10; n++)
    for (const phase of [
      'nomination',
      'voting',
      'president-discard',
      'chancellor-enact',
      'veto-response',
      'executive',
    ] as const) {
      const game = table(n);
      policies(game, 0, 0, [L, F, L, F, L]);
      Object.assign(game, { phase, chancellor: 'p1', votes: { p1: true } });
      game.hand = game.deck.splice(
        0,
        phase === 'president-discard'
          ? 3
          : ['chancellor-enact', 'veto-response'].includes(phase)
            ? 2
            : 0,
      );
      game.discard = game.deck.splice(0, 2);
      game.notes.p0 = [
        { text: 'A private observation', party: F, targetId: `p${n - 1}` },
      ];
      const changed = structuredClone(game);
      changed.deck.reverse();
      changed.discard.reverse();
      if (changed.hand.length) changed.hand.push(changed.hand.shift()!);
      changed.notes.p0 = [
        {
          text: 'Different private observation',
          party: L,
          targetId: `p${n - 1}`,
        },
      ];
      [changed.players[n - 1].role, changed.players[n - 2].role] = [
        changed.players[n - 2].role,
        changed.players[n - 1].role,
      ];
      // p2 is a Liberal by the printed distribution, with no allowed private knowledge here.
      assert.equal(
        JSON.stringify(viewFor(game, 'p2')),
        JSON.stringify(viewFor(changed, 'p2')),
      );
      for (const p of game.players) {
        const view = viewFor(game, p.id);
        assert.deepEqual(view.voted, Object.keys(game.votes));
        assert.deepEqual(view.ballots, phase === 'voting' ? game.votes : {});
        const expected: { id: string; name: string; role: Role | undefined }[] =
          p.role === F || (p.role === 'hitler' && n <= 6)
            ? game.players
                .filter((other) => other.id !== p.id && other.role !== L)
                .map((other) => ({
                  id: other.id,
                  name: other.name,
                  role: other.role,
                }))
            : [];
        assert.deepEqual(view.me.teammates, expected);
        const holder =
          phase === 'president-discard'
            ? 'p0'
            : ['chancellor-enact', 'veto-response'].includes(phase)
              ? 'p1'
              : null;
        assert.deepEqual(view.me.hand, p.id === holder ? game.hand : []);
        assert.deepEqual(view.me.notes, p.id === 'p0' ? game.notes.p0 : []);
        assert.equal(view.me.ballot, p.id === 'p1' ? true : null);
        assert.ok(view.players.every((other) => !('role' in other)));
      }
      if (n >= 7) {
        game.players[3].alive = false;
        game.players[4].alive = false;
        assert.deepEqual(
          viewFor(game, `p${n - 1}`).me.teammates,
          [],
          'executions must never unlock teammate knowledge for large-table Hitler',
        );
      }
    }
});
