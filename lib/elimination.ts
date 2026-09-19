import type { GameView } from './game.ts';

// Only the public roster is needed. No role, party, or private note belongs in
// this notice. A restored dead seat gets the notice too; repeated snapshots do not.
export function shouldShowElimination(
  before: GameView | null,
  after: GameView,
) {
  if (after.phase === 'lobby') return false;
  const me = after.players.find((player) => player.id === after.me.id);
  if (!me || me.alive) return false;
  const sameMatch =
    before?.code === after.code &&
    before.me.id === after.me.id &&
    before.fairness?.id === after.fairness?.id;
  if (!sameMatch) return true;
  if (after.revision < before.revision) return false;
  return (
    before.players.find((player) => player.id === after.me.id)?.alive === true
  );
}
