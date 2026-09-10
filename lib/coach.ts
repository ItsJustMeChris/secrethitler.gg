import type { GameView } from './game';

// Advice is derived solely from the requesting player's permitted view. It
// explains rules, never labels unknown roles or presents bot claims as facts.
export function coachTip(game: GameView) {
  const me = game.players.find((p) => p.id === game.me.id);
  if (game.phase === 'finished')
    return {
      title: 'Review the reveal',
      text: 'All roles are now public. Compare the policy results, votes, and claims in the game log. A believable story was not necessarily true. Open a rematch to try a new role.',
    };
  if (game.phase === 'lobby')
    return {
      title: 'Build your table',
      text: 'Use 5–10 players in any mix of people and AI. The host can add or remove AI before dealing. Each human must mark ready. Roles and policies are still shuffled normally.',
    };
  if (!me?.alive)
    return {
      title: 'Watch the deduction finish',
      text: 'Executed players cannot vote or speak. The AI will continue when no living human needs to act. At the end, every role will be revealed.',
    };
  if (game.phase === 'nomination')
    return {
      title:
        game.president === game.me.id
          ? 'Choose an eligible partner'
          : 'Evaluate the proposed government',
      text:
        'The previous elected chancellor is term-limited. With more than five living players, the previous elected president is also barred from chancellor. Eligible seats are marked in Players.' +
        (game.fascist >= 3
          ? ' Hitler elected chancellor now means an immediate Fascist win.'
          : ' A blue policy builds credibility but does not prove a Liberal role.'),
    };
  if (game.phase === 'voting')
    return {
      title:
        game.me.ballot === null
          ? 'Ja approves both officials'
          : 'Your vote is locked',
      text:
        'A strict majority of living players must vote Ja; a tie fails. Ballots reveal together after everyone votes.' +
        (game.tracker === 2
          ? ' One more failed government causes chaos: the top policy is enacted, its power is skipped, and term limits reset.'
          : ' Failed elections advance the tracker. Electing a government alone does not reset it.'),
    };
  if (game.phase === 'president-discard')
    return {
      title: 'Three policies become two',
      text:
        game.president === game.me.id
          ? 'Choose one card to discard. The other two pass privately to your chancellor. You must remain silent during legislation. You may discuss or bluff about your draw after the session ends.'
          : 'Only the president sees these three cards. The president and chancellor must stay silent until legislation finishes. Nobody else can verify their later hand claims.',
    };
  if (game.phase === 'chancellor-enact')
    return {
      title: 'One policy becomes law',
      text:
        'The chancellor enacts one of the two policies and discards the other. An enacted policy resets the election tracker.' +
        (game.fascist >= 5
          ? ' Veto is unlocked: the chancellor may request it, but the president must agree. An agreed veto advances the tracker instead.'
          : ' Veto becomes available after the fifth Fascist policy.'),
    };
  if (game.phase === 'veto-response')
    return {
      title: 'A veto needs agreement',
      text: 'If the president agrees, both policies are discarded and the tracker advances, which can trigger chaos. If the president refuses, the chancellor must enact a policy and cannot request another veto this session.',
    };
  const powers = {
    investigate:
      'Only the president learns the target’s party. Hitler has Fascist membership, so this does not identify the exact role. The president may lie about the result.',
    peek: 'Only the president sees the next three policies in their current draw order. The cards are neither removed nor reordered. Read the result in the secret dossier.',
    'special-election':
      'The president chooses another living player to lead one election. Afterward, normal rotation resumes after the president who called the special election.',
    execute:
      'The president must remove another living player. Executing Hitler wins for the Liberals immediately. Other executed players keep their party secret until the game ends.',
  };
  return {
    title: 'Use the executive power',
    text: game.power
      ? powers[game.power]
      : 'Follow the current action on the table. The game log records confirmed public events.',
  };
}
