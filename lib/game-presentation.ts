import type { GameView, Policy } from './game.ts';

export type TableCue = {
  id: string;
  kind:
    | 'deal'
    | 'policy'
    | 'election'
    | 'handoff'
    | 'execution'
    | 'turn'
    | 'victory';
  title: string;
  detail: string;
  party?: Policy;
};

export function legislativeGuidance(game: GameView) {
  const president =
    game.players.find((p) => p.id === game.president)?.name ?? 'The president';
  const chancellor =
    game.players.find((p) => p.id === game.chancellor)?.name ??
    'the chancellor';
  const isPresident = game.me.id === game.president;
  const isChancellor = game.me.id === game.chancellor;
  if (game.phase === 'president-discard')
    return {
      title: isPresident
        ? 'Discard one policy in secret.'
        : `${president} is reviewing three policies.`,
      description: isPresident
        ? `Pass the remaining two policies to ${chancellor}. Stay silent.`
        : `${president} will pass two policies to ${chancellor}. The government must stay silent.`,
    };
  if (game.phase === 'chancellor-enact')
    return {
      title: isChancellor
        ? 'Choose a policy to enact.'
        : `${chancellor} is choosing a policy.`,
      description: isChancellor
        ? game.vetoDenied
          ? `${president} passed you these two policies and refused the veto. Enact one; the other is discarded. Stay silent.`
          : `${president} passed you these two policies. Enact one; the other is discarded. Stay silent.`
        : `${president} passed two policies to ${chancellor}. The enacted policy will be revealed to everyone.`,
    };
  if (game.phase === 'veto-response')
    return {
      title: isPresident
        ? `Do you agree to ${chancellor}’s veto?`
        : `${president} is considering ${chancellor}’s veto.`,
      description:
        'If both leaders agree, the policies are discarded and the election tracker advances.',
    };
  return null;
}

// Election recaps use the completed record, never the partial live tally.
export function electionResult(game: GameView) {
  const vote = game.lastVote;
  if (!vote || game.phase === 'lobby') return null;
  const playerName = (id: string) =>
    game.players.find((p) => p.id === id)?.name ?? 'Departed player';
  const ballots = Object.entries(vote.votes)
    .map(([id, yes]) => ({
      id,
      name: playerName(id),
      yes,
      seat: game.players.findIndex((p) => p.id === id),
    }))
    .sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id));
  return {
    id: `${game.code}:${game.fairness?.id ?? 'legacy'}:${vote.round}`,
    round: vote.round,
    passed: vote.passed,
    president: playerName(vote.president),
    chancellor: playerName(vote.chancellor),
    yes: ballots.filter((ballot) => ballot.yes).length,
    no: ballots.filter((ballot) => !ballot.yes).length,
    ballots,
  };
}

export type ElectionResult = NonNullable<ReturnType<typeof electionResult>>;

export function policyResult(game: GameView) {
  if (game.phase === 'lobby') return null;
  const entry = [...game.log].reverse().find((item) => item.policy);
  return entry?.policy
    ? {
        ...entry.policy,
        id: `${game.code}:${game.fairness?.id ?? 'legacy'}:policy:${entry.id}`,
        round: entry.round,
      }
    : null;
}

export type PolicyResult = NonNullable<ReturnType<typeof policyResult>>;

export function newPolicyResult(before: GameView | null, after: GameView) {
  if (
    !before ||
    before.code !== after.code ||
    before.fairness?.id !== after.fairness?.id ||
    after.revision <= before.revision
  )
    return null;
  const result = policyResult(after);
  return result && result.id !== policyResult(before)?.id ? result : null;
}

export function policyResultTitle(result: PolicyResult) {
  const party = result.kind === 'liberal' ? 'Liberal' : 'Fascist';
  return result.source === 'chaos'
    ? `Chaos enacted a ${party} policy`
    : `${result.chancellor?.name ?? 'The chancellor'} enacted a ${party} policy`;
}

export function newElectionResult(before: GameView | null, after: GameView) {
  if (
    !before ||
    before.code !== after.code ||
    before.fairness?.id !== after.fairness?.id ||
    after.revision <= before.revision ||
    after.phase === 'voting'
  )
    return null;
  const result = electionResult(after);
  return result && result.id !== electionResult(before)?.id ? result : null;
}

export function playerOffice(game: GameView, playerId: string) {
  if (
    ['lobby', 'finished'].includes(game.phase) ||
    !game.players.find((player) => player.id === playerId)?.alive
  )
    return null;
  if (game.president === playerId)
    return {
      kind: 'president',
      label: 'President',
      shortLabel: 'Pres.',
    } as const;
  if (game.chancellor === playerId)
    return {
      kind: 'chancellor',
      label: 'Chancellor',
      shortLabel: 'Chanc.',
    } as const;
  return null;
}

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

// The floor offers only actions permitted by the player's existing server projection.
export function playerSelection(game: GameView) {
  const actor = game.players.find((p) => p.id === game.me.id);
  if (!actor?.alive || actor.departed || game.president !== actor.id)
    return null;
  const kind =
    game.phase === 'nomination'
      ? 'nominate'
      : game.phase === 'executive' && game.power && game.power !== 'peek'
        ? game.power
        : null;
  if (!kind) return null;
  return {
    kind,
    options: game.players.flatMap((player, index) => {
      if (!player.alive || player.id === actor.id) return [];
      const disabledReason =
        kind === 'nominate' && !game.eligible.includes(player.id)
          ? 'Term-limited'
          : kind === 'investigate' && game.investigated.includes(player.id)
            ? 'Already investigated'
            : null;
      return [{ player, seat: index + 1, disabledReason }];
    }),
  };
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
  if (
    before.phase === 'president-discard' &&
    after.phase === 'chancellor-enact' &&
    before.round === after.round &&
    before.president === after.president &&
    before.chancellor === after.chancellor
  )
    return {
      id,
      kind: 'handoff',
      title: 'Policies passed',
      detail: `${after.players.find((p) => p.id === after.president)?.name ?? 'President'} → ${after.players.find((p) => p.id === after.chancellor)?.name ?? 'Chancellor'}`,
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
