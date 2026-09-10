import { applyAction, randomInt, RuleError, viewFor } from './game.ts';
import type { Action, BotMemory, Game, GameView, Policy } from './game.ts';
import { DIALOGUE } from './bot-dialogue.ts';
import type { DialogueTopic } from './bot-dialogue.ts';

export const freshMemory = (): BotMemory => ({
  trust: {},
  seenLog: 0,
  confirmedNotHitler: [],
  usedLines: [],
});
type Random = (max: number) => number;
type Plan = { action: Action; topic?: DialogueTopic };
const legislative = (view: GameView) =>
  ['president-discard', 'chancellor-enact', 'veto-response'].includes(
    view.phase,
  );
export function canSpeak(view: GameView) {
  return (
    view.players.some((p) => p.id === view.me.id && p.alive) &&
    !(
      legislative(view) &&
      [view.president, view.chancellor].includes(view.me.id)
    )
  );
}

// This function receives precisely the same projection as a human browser.
// It never receives another seat's role, hand, sealed ballot, or private notes.
export function observe(view: GameView, memory: BotMemory) {
  for (const entry of view.log.filter((e) => e.id > memory.seenLog)) {
    if (
      entry.text.startsWith('The government enacted') &&
      view.lastVote?.round === entry.round
    ) {
      const change = entry.text.includes('a liberal policy') ? 1.4 : -0.8;
      for (const id of [view.lastVote.president, view.lastVote.chancellor])
        memory.trust[id] = Math.max(
          -5,
          Math.min(5, (memory.trust[id] ?? 0) + change),
        );
    }
    for (const player of view.players) {
      if (
        entry.text === `${player.name} is confirmed not to be Hitler.` &&
        !memory.confirmedNotHitler.includes(player.id)
      )
        memory.confirmedNotHitler.push(player.id);
    }
    memory.seenLog = Math.max(memory.seenLog, entry.id);
  }
  for (const note of view.me.notes) {
    if (note.targetId && note.party)
      memory.trust[note.targetId] = note.party === 'liberal' ? 6 : -6;
  }
}

function affinity(view: GameView, memory: BotMemory, id: string) {
  if (id === view.me.id) return 8;
  const teammate = view.me.teammates.find((p) => p.id === id);
  if (teammate) return teammate.role === 'hitler' && view.fascist >= 3 ? 20 : 8;
  let score = memory.trust[id] ?? 0;
  if (view.me.role === 'hitler' && Math.abs(score) === 6)
    score = score < 0 ? 8 : -4;
  if (view.me.role === 'fascist') score = -score; // Favor allies, not the public's most credible opponents.
  if (
    view.me.role === 'liberal' &&
    view.fascist >= 3 &&
    memory.confirmedNotHitler.includes(id)
  )
    score += 4;
  return score;
}
function ranked(
  view: GameView,
  memory: BotMemory,
  candidates: string[],
  random: Random,
  execution = false,
) {
  return candidates
    .map((id) => {
      let score = affinity(view, memory, id);
      if (execution) {
        const teammate = view.me.teammates.find((p) => p.id === id);
        if (teammate) score = teammate.role === 'hitler' ? -1000 : -100;
        else if (view.me.role === 'liberal')
          score =
            -(memory.trust[id] ?? 0) -
            (memory.confirmedNotHitler.includes(id) ? 5 : 0);
        else score = memory.trust[id] ?? 0;
      }
      return { id, score: score + random(100) / 45 };
    })
    .sort((a, b) => b.score - a.score)[0]?.id;
}
function wantsFascist(view: GameView, random: Random) {
  if (view.me.role === 'liberal') return false;
  if (view.fascist === 5 || view.liberal === 4) return true;
  if (view.fascist >= 3) return random(100) < 88;
  // Hitler seeks credibility before the election win is available.
  return random(100) < (view.me.role === 'hitler' ? 22 : 60);
}

export function planBot(
  view: GameView,
  memory: BotMemory,
  random: Random = randomInt,
): Plan | null {
  const me = view.players.find((p) => p.id === view.me.id);
  if (!me?.alive || !view.me.role) return null;
  const isPresident = view.president === me.id;
  switch (view.phase) {
    case 'nomination': {
      if (!isPresident) return null;
      const target = ranked(view, memory, view.eligible, random);
      return target
        ? { action: { type: 'nominate', target }, topic: 'nomination' }
        : null;
    }
    case 'voting': {
      if (view.me.ballot !== null) return null;
      const allyHitler = view.me.teammates.find((p) => p.role === 'hitler')?.id;
      let probability =
        70 +
        5 *
          (affinity(view, memory, view.president!) +
            affinity(view, memory, view.chancellor!));
      if (view.tracker === 2) probability = Math.max(probability, 91);
      if (
        view.me.role === 'liberal' &&
        view.fascist >= 3 &&
        !memory.confirmedNotHitler.includes(view.chancellor!)
      )
        probability -= 22;
      if (
        view.fascist >= 3 &&
        (view.chancellor === allyHitler ||
          (view.me.role === 'hitler' && view.chancellor === me.id))
      )
        probability = 100;
      const yes = random(100) < Math.max(12, Math.min(100, probability));
      return { action: { type: 'vote', yes }, topic: yes ? 'yes' : 'no' };
    }
    case 'president-discard': {
      if (!isPresident) return null;
      const unwanted: Policy = wantsFascist(view, random)
        ? 'liberal'
        : 'fascist';
      const index = Math.max(0, view.me.hand.indexOf(unwanted));
      memory.passedHand = view.me.hand.filter((_, i) => i !== index);
      const liberals = view.me.hand.filter((p) => p === 'liberal').length;
      const passed = memory.passedHand.filter((p) => p === 'liberal').length;
      const bluff =
        view.me.role !== 'liberal' &&
        unwanted === 'liberal' &&
        liberals > 0 &&
        passed === 0;
      memory.pendingClaim = bluff
        ? 'My claim: I drew three Fascist policies and had no Liberal policy to pass.'
        : `My claim: I drew ${liberals} Liberal and ${3 - liberals} Fascist policies; I passed ${passed} Liberal and ${2 - passed} Fascist.`;
      return { action: { type: 'discard', index } };
    }
    case 'chancellor-enact': {
      if (view.chancellor !== me.id) return null;
      const desired: Policy = wantsFascist(view, random)
        ? 'fascist'
        : 'liberal';
      if (
        view.fascist >= 5 &&
        !view.vetoDenied &&
        !view.me.hand.includes(desired)
      )
        return { action: { type: 'veto' } };
      const index = Math.max(0, view.me.hand.indexOf(desired));
      const liberals = view.me.hand.filter((p) => p === 'liberal').length;
      const bluff =
        view.me.role !== 'liberal' && desired === 'fascist' && liberals === 1;
      memory.pendingClaim = bluff
        ? 'My claim: I received two Fascist policies, so the enactment was forced.'
        : `My claim: I received ${liberals} Liberal and ${2 - liberals} Fascist policies.`;
      return { action: { type: 'enact', index } };
    }
    case 'veto-response': {
      if (!isPresident) return null;
      // The president remembers what they passed, not a fresh peek at the hand.
      const desired = view.me.role === 'liberal' ? 'liberal' : 'fascist';
      return {
        action: {
          type: 'veto-answer',
          yes: !(memory.passedHand ?? []).includes(desired),
        },
      };
    }
    case 'executive': {
      if (!isPresident) return null;
      if (view.power === 'peek') {
        memory.pendingPeek = true;
        return { action: { type: 'power' } };
      }
      const candidates = view.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== me.id &&
            !(view.power === 'investigate' && view.investigated.includes(p.id)),
        )
        .map((p) => p.id);
      let target: string | undefined;
      if (view.power === 'investigate') {
        const unknown = candidates.filter(
          (id) => !view.me.teammates.some((p) => p.id === id),
        );
        const pool = unknown.length ? unknown : candidates;
        target = pool[random(pool.length)];
      } else
        target = ranked(
          view,
          memory,
          candidates,
          random,
          view.power === 'execute',
        );
      if (target && view.power === 'investigate')
        memory.pendingInvestigation = target;
      return target
        ? {
            action: { type: 'power', target },
            topic:
              view.power === 'execute'
                ? 'execution'
                : view.power === 'investigate'
                  ? 'investigation'
                  : 'nomination',
          }
        : null;
    }
    default:
      return null;
  }
}

export function dialogue(
  topic: DialogueTopic,
  memory: BotMemory,
  random: Random = randomInt,
): string {
  const pool = DIALOGUE[topic].map((text, i) => ({
    text,
    key: `${topic}:${i}`,
  }));
  const unused = pool.filter((line) => !memory.usedLines.includes(line.key));
  const options = unused.length ? unused : pool;
  const line = options[random(options.length)];
  memory.usedLines.push(line.key);
  memory.usedLines = memory.usedLines.slice(-90);
  return line.text;
}
function replyTopic(text: string, view: GameView): DialogueTopic {
  const words = text.toLowerCase();
  if (/investigat|membership|checked/.test(words)) return 'investigation';
  if (/execut|shoot|kill/.test(words)) return 'execution';
  if (/veto|chaos|tracker|hitler/.test(words)) return 'danger';
  if (/red|fascist|forced/.test(words)) return 'fascist';
  if (/blue|liberal policy/.test(words)) return 'liberal';
  if (/nominat|chancellor/.test(words))
    return view.fascist >= 3 ? 'danger' : 'reply';
  return 'reply';
}

// One persisted step per due tick. Any seated human can wake the room; clients
// cannot supply a bot identity, chosen action, random seed, or privileged state.
// The caller commits this together with the move using the room's revision CAS.
export function tickBots(
  game: Game,
  now = Date.now(),
  manual = false,
  random: Random = randomInt,
): boolean {
  const practice = game.practice;
  if (!practice || ['lobby', 'finished'].includes(game.phase)) return false;
  if ((!manual && practice.paused) || (!manual && now < practice.nextAt))
    return false;
  const bots = game.players.filter((p) => p.bot && p.alive);
  if (!bots.length) return false;
  const snapshots = bots.map((p) => {
    const view = viewFor(game, p.id);
    const memory = (practice.memory[p.id] ??= freshMemory());
    observe(view, memory);
    if (memory.pendingPeek) {
      const peek = [...view.me.notes]
        .reverse()
        .find((n) => n.policies)?.policies;
      if (peek) {
        memory.pendingClaim = `My policy peek claim: the next three policies are ${peek.join(', ')}, in that order.`;
        delete memory.pendingPeek;
      }
    }
    if (memory.pendingInvestigation) {
      const note = view.me.notes.find(
        (n) => n.targetId === memory.pendingInvestigation,
      );
      if (note?.party) {
        const target = view.players.find((p) => p.id === note.targetId);
        const bluff = view.me.role !== 'liberal' && random(100) < 40;
        const party = bluff
          ? note.party === 'liberal'
            ? 'fascist'
            : 'liberal'
          : note.party;
        memory.pendingClaim = `My investigation claim: ${target?.name ?? 'the target'} has ${party === 'liberal' ? 'Liberal' : 'Fascist'} party membership.`;
        delete memory.pendingInvestigation;
      }
    }
    return { player: p, view, memory };
  });
  const schedule = () => {
    practice.nextAt = now + (practice.pace === 'fast' ? 450 : 1700);
  };
  const say = (seat: (typeof snapshots)[number], text: string) => {
    applyAction(game, seat.player.id, { type: 'chat', text });
    practice.lastTalkAt = now;
    schedule();
  };
  // Claims wait until the entire legislative session has ended, including veto.
  if (!legislative(snapshots[0].view)) {
    const claimant = snapshots.find(
      (s) => s.memory.pendingClaim && canSpeak(s.view),
    );
    if (claimant) {
      say(claimant, claimant.memory.pendingClaim!);
      delete claimant.memory.pendingClaim;
      return true;
    }
  }
  const policyEvent = [...snapshots[0].view.log]
    .reverse()
    .find(
      (e) =>
        e.text.startsWith('The government enacted') ||
        e.text.startsWith('Chaos enacted'),
    );
  if (
    policyEvent &&
    policyEvent.id > (practice.lastReaction ?? 0) &&
    !legislative(snapshots[0].view)
  ) {
    const speakers = snapshots.filter((s) => canSpeak(s.view));
    const speaker = speakers[random(speakers.length)];
    if (speaker) {
      say(
        speaker,
        dialogue(
          policyEvent.text.startsWith('Chaos')
            ? 'danger'
            : policyEvent.text.includes('a liberal policy')
              ? 'liberal'
              : 'fascist',
          speaker.memory,
          random,
        ),
      );
      practice.lastReaction = policyEvent.id;
      return true;
    }
  }
  const humanMessage = [...game.messages]
    .reverse()
    .find((m) => game.players.some((p) => p.id === m.playerId && !p.bot));
  if (
    humanMessage &&
    humanMessage.id !== practice.lastReplyId &&
    now - practice.lastTalkAt >= 3500
  ) {
    const speakers = snapshots.filter((s) => canSpeak(s.view));
    const speaker =
      speakers.find((s) =>
        humanMessage.text.toLowerCase().includes(s.player.name.toLowerCase()),
      ) ?? speakers[random(Math.max(1, speakers.length))];
    if (speaker) {
      say(
        speaker,
        dialogue(
          replyTopic(humanMessage.text, speaker.view),
          speaker.memory,
          random,
        ),
      );
      practice.lastReplyId = humanMessage.id;
      return true;
    }
  }
  for (const seat of snapshots) {
    const plan = planBot(seat.view, seat.memory, random);
    if (!plan) continue;
    if (plan.topic && canSpeak(seat.view) && now - practice.lastTalkAt >= 3000)
      say(seat, dialogue(plan.topic, seat.memory, random));
    applyAction(game, seat.player.id, plan.action);
    schedule();
    return true;
  }
  // When waiting for a human, offer one comment per phase, not an endless loop.
  const discussion = `${game.round}:${game.phase}`;
  const speaker = snapshots.find(
    (s) => canSpeak(s.view) && s.memory.lastDiscussion !== discussion,
  );
  if (
    speaker &&
    now - practice.lastTalkAt >= 7000 &&
    !snapshots.some((s) => s.memory.lastDiscussion === discussion)
  ) {
    const topic =
      game.fascist >= 3 ? 'danger' : game.round === 1 ? 'opening' : 'reply';
    say(speaker, dialogue(topic, speaker.memory, random));
    speaker.memory.lastDiscussion = discussion;
    return true;
  }
  return false;
}

export function authorizeTick(
  game: Game,
  actorId: string,
  manual: boolean,
  revision: unknown,
) {
  if (!game.players.some((p) => p.id === actorId && !p.bot))
    throw new RuleError('You are not seated at this table.');
  if (!game.practice) throw new RuleError('This table has no AI players.');
  if (manual && (actorId !== game.hostId || !game.practice.paused))
    throw new RuleError('Only the host can step a table with paused AI.');
  if (manual && revision !== game.revision) return false;
  return true;
}
