import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, joinGame, applyAction, viewFor } from '../lib/game.ts';
import { isYourTurn, tableCue } from '../lib/game-presentation.ts';

function fixture() {
  const game = newGame('ABCDEFGH', 'p0', 'Player 0');
  for (let i = 1; i < 7; i++) joinGame(game, `p${i}`, `Player ${i}`);
  for (const p of game.players) applyAction(game, p.id, { type: 'ready' });
  const lobby = viewFor(game, 'p0');
  applyAction(game, 'p0', { type: 'start' });
  game.revision = 1;
  game.president = 'p0';
  return { game, lobby, view: viewFor(game, 'p0') };
}

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
