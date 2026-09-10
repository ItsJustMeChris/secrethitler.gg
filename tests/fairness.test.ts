import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createFairness, receiptInt, verifyFairness } from '../lib/fairness.ts';
import { applyAction, joinGame, newGame, viewFor } from '../lib/game.ts';
import { freshMemory, observe, planBot, authorizeTick } from '../lib/bots.ts';

void test('receipt entropy matches AES-256-CTR and rejection discards modulo bias', async () => {
  const proof = await createFairness();
  const cipher = createCipheriv(
    'aes-256-ctr',
    Buffer.from(proof.seed, 'hex'),
    Buffer.alloc(16),
  );
  const expected = cipher.update(Buffer.alloc(16384));
  const expectedWords = new DataView(
    expected.buffer,
    expected.byteOffset,
    expected.byteLength,
  );
  assert.deepEqual(
    proof.words,
    Array.from({ length: 4096 }, (_, i) => expectedWords.getUint32(i * 4)),
  );
  const tape = { words: [0xffffffff, 5], cursor: 0 };
  assert.equal(receiptInt(tape, 3), 2);
  assert.equal(tape.cursor, 2);
  assert.throws(() => receiptInt(tape, 0));
  assert.throws(() => receiptInt(tape, 2));
});

void test('complete 5–10 player matches replay; secrets remain sealed; tampering fails; rematch clears proof', async () => {
  for (let count = 5; count <= 10; count++) {
    const game = newGame('AUDITEST', 'p0', 'Player 0');
    for (let i = 1; i < count; i++) joinGame(game, `p${i}`, `Player ${i}`);
    game.fairness = await createFairness();
    const committed = viewFor(game, 'p0').fairness!.commitment;
    for (const p of game.players) applyAction(game, p.id, { type: 'ready' });
    applyAction(game, 'p0', { type: 'start' });
    const memories = new Map(game.players.map((p) => [p.id, freshMemory()]));
    for (let step = 0; game.phase !== 'finished' && step < 1000; step++) {
      let acted = false;
      for (const p of game.players) {
        const view = viewFor(game, p.id);
        assert.equal(view.fairness!.reveal, null);
        assert.equal(JSON.stringify(view).includes(game.fairness.seed), false);
        assert.deepEqual(Object.keys(view.fairness!), [
          'id',
          'commitment',
          'shuffleCount',
          'reveal',
        ]);
        const memory = memories.get(p.id)!;
        observe(view, memory);
        const plan = planBot(view, memory);
        if (plan) {
          applyAction(game, p.id, plan.action);
          acted = true;
          break;
        }
      }
      assert.ok(acted, `Match stalled in ${game.phase}`);
    }
    assert.equal(game.phase, 'finished');
    const revealed = viewFor(game, 'p0').fairness!;
    const verified = await verifyFairness(revealed, committed);
    assert.equal(verified.players, count);
    assert.equal(verified.shuffles, game.fairness.events.length);
    await assert.rejects(() => verifyFairness(revealed, '0'.repeat(64)));
    const altered = structuredClone(revealed);
    altered.reveal!.events[1].output[0] = 'tampered';
    await assert.rejects(() => verifyFairness(altered, committed));
    const roles = structuredClone(revealed);
    roles.reveal!.seats[0].role = 'tampered';
    await assert.rejects(() => verifyFairness(roles, committed));
    applyAction(game, 'p0', { type: 'rematch' });
    assert.equal(viewFor(game, 'p0').fairness, null);
    game.fairness = await createFairness();
    assert.notEqual(game.fairness.commitment, committed);
  }
});

void test('a departed player cannot drive AI while another player can host', () => {
  const game = newGame('AUDITEST', 'host', 'Host');
  joinGame(game, 'friend', 'Friend');
  applyAction(game, 'host', { type: 'fill-bots' });
  for (const p of game.players.filter((p) => !p.bot))
    applyAction(game, p.id, { type: 'ready' });
  applyAction(game, 'host', { type: 'start' });
  applyAction(game, 'host', { type: 'leave' });
  assert.equal(game.hostId, 'friend');
  assert.throws(() => authorizeTick(game, 'host', false, game.revision));
  assert.equal(authorizeTick(game, 'friend', false, game.revision), true);
});
