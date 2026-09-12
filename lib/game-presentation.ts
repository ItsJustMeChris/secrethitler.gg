import type { GameView, Policy } from './game.ts';

export type TableCue = {
  id: string;
  kind: 'deal' | 'policy' | 'election' | 'execution' | 'turn' | 'victory';
  title: string;
  detail: string;
  party?: Policy;
};

export function isYourTurn(game: GameView): boolean {
  if (!game.players.find((p) => p.id === game.me.id)?.alive) return false;
  if (game.phase === 'voting') return game.me.ballot === null;
  if (game.phase === 'chancellor-enact') return game.chancellor === game.me.id;
  return (
    ['nomination', 'president-discard', 'veto-response', 'executive'].includes(
      game.phase,
    ) && game.president === game.me.id
  );
}

// Presentation observes only the same permitted view as the player. It never delays a move.
export function tableCue(
  before: GameView | null,
  after: GameView,
): TableCue | null {
  if (
    !before ||
    before.code !== after.code ||
    after.revision <= before.revision ||
    after.phase === 'lobby'
  )
    return null;
  const id = `${after.code}:${after.revision}`;
  if (after.phase === 'finished' && before.phase !== 'finished')
    return {
      id,
      kind: 'victory',
      party: after.winner ?? undefined,
      title: `${after.winner === 'liberal' ? 'Liberal' : 'Fascist'} victory`,
      detail: after.winReason ?? 'The match is complete.',
    };
  if (before.phase === 'lobby')
    return {
      id,
      kind: 'deal',
      title: 'The roles are dealt',
      detail: 'Your allegiance is waiting in your dossier.',
    };
  for (const party of ['liberal', 'fascist'] as const) {
    if (after[party] > before[party])
      return {
        id,
        kind: 'policy',
        party,
        title: `${party === 'liberal' ? 'Liberal' : 'Fascist'} policy enacted`,
        detail:
          party === 'fascist' && after.fascist >= 3
            ? 'Hitler can now win by becoming chancellor.'
            : 'The balance of power shifts.',
      };
  }
  const executed = after.players.find(
    (p) =>
      !p.alive && before.players.some((old) => old.id === p.id && old.alive),
  );
  if (executed)
    return {
      id,
      kind: 'execution',
      title: `${executed.name} was executed`,
      detail: 'Their allegiance remains secret.',
    };
  if (before.phase === 'voting' && after.phase !== 'voting' && after.lastVote)
    return {
      id,
      kind: 'election',
      title: after.lastVote.passed
        ? 'Government elected'
        : 'Government rejected',
      detail: `${Object.values(after.lastVote.votes).filter(Boolean).length} Ja · ${Object.values(after.lastVote.votes).filter((v) => !v).length} Nein`,
    };
  if (after.phase !== before.phase && isYourTurn(after))
    return {
      id,
      kind: 'turn',
      title: 'Your move',
      detail: 'The table is waiting for your decision.',
    };
  return null;
}
