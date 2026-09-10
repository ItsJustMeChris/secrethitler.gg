import type { GameView, Role } from './game.ts';

// Consume only the viewer's allowlisted projection; never infer identity from a picture.
export function playerKnowledge(
  game: GameView,
  playerId: string,
): { label: string; kind: Role; source: 'role' | 'party' } | null {
  const revealed =
    game.phase === 'finished'
      ? game.players.find((p) => p.id === playerId)?.role
      : null;
  const role =
    revealed ??
    (playerId === game.me.id
      ? game.me.role
      : game.me.teammates.find((p) => p.id === playerId)?.role);
  if (role)
    return {
      label:
        role === 'hitler'
          ? 'Hitler'
          : role === 'fascist'
            ? 'Fascist'
            : 'Liberal',
      kind: role,
      source: 'role',
    };
  const party = game.me.notes.find(
    (note) => note.targetId === playerId && note.party,
  )?.party;
  if (party)
    return {
      label: party === 'fascist' ? 'Fascist party' : 'Liberal party',
      kind: party,
      source: 'party',
    };
  return null;
}
