// Pure server-authoritative rules engine. Never send Game directly to a client.
import { fairnessView, receiptShuffle } from './fairness.ts';
import type { Fairness, FairnessView, ShuffleEvent } from './fairness.ts';
export type Policy = 'liberal' | 'fascist';
export type Role = Policy | 'hitler';
export type Power = 'investigate' | 'special-election' | 'peek' | 'execute';
export type Phase =
  | 'lobby'
  | 'nomination'
  | 'voting'
  | 'president-discard'
  | 'chancellor-enact'
  | 'veto-response'
  | 'executive'
  | 'finished';
export type Player = {
  id: string;
  name: string;
  alive: boolean;
  ready: boolean;
  role?: Role;
  bot?: boolean;
  departed?: boolean;
};
export type BotMemory = {
  trust: Record<string, number>;
  seenLog: number;
  confirmedNotHitler: string[];
  usedLines: string[];
  pendingClaim?: string;
  lastDiscussion?: string;
  passedHand?: Policy[];
  pendingInvestigation?: string;
  pendingPeek?: boolean;
};
export type Practice = {
  paused: boolean;
  pace: 'normal' | 'fast';
  nextAt: number;
  lastTalkAt: number;
  lastReplyId: string;
  memory: Record<string, BotMemory>;
  lastReaction?: number;
};
export type Entry = { id: number; round: number; text: string };
export type Message = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  time: number;
};
export type PrivateNote = {
  text: string;
  policies?: Policy[];
  targetId?: string;
  party?: Policy;
};
export type Game = {
  fairness?: Fairness;
  previousFairness?: FairnessView | null;
  practice?: Practice;
  code: string;
  hostId: string;
  players: Player[];
  phase: Phase;
  round: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  president: string | null;
  chancellor: string | null;
  lastPresident: string | null;
  lastChancellor: string | null;
  specialReturn: string | null;
  liberal: number;
  fascist: number;
  tracker: number;
  initialCount: number;
  deck: Policy[];
  discard: Policy[];
  hand: Policy[];
  votes: Record<string, boolean>;
  lastVote: {
    president: string;
    chancellor: string;
    votes: Record<string, boolean>;
    passed: boolean;
    round: number;
  } | null;
  power: Power | null;
  investigated: string[];
  notes: Record<string, PrivateNote[]>;
  vetoDenied: boolean;
  winner: Policy | null;
  winReason: string | null;
  log: Entry[];
  logSequence: number;
  messages: Message[];
  processed: string[];
};
export type Action =
  | { type: 'add-bot' }
  | { type: 'fill-bots' }
  | { type: 'practice-settings'; paused?: boolean; pace?: 'normal' | 'fast' }
  | { type: 'ready' }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'rematch' }
  | { type: 'kick'; target: string }
  | { type: 'nominate'; target: string }
  | { type: 'vote'; yes: boolean }
  | { type: 'discard'; index: number }
  | { type: 'enact'; index: number }
  | { type: 'veto' }
  | { type: 'veto-answer'; yes: boolean }
  | { type: 'power'; target?: string }
  | { type: 'chat'; text: string };

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
export function randomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= limit);
  return value % max;
}
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function distribution(count: number) {
  requireRule(
    Number.isInteger(count) && count >= 5 && count <= 10,
    'A game needs 5–10 players.',
  );
  const fascists = Math.floor((count - 3) / 2);
  return { liberal: count - fascists - 1, fascist: fascists, hitler: 1 };
}
export function powerTrack(count: number): (Power | null)[] {
  if (count <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (count <= 8)
    return [
      null,
      'investigate',
      'special-election',
      'execute',
      'execute',
      null,
    ];
  return [
    'investigate',
    'investigate',
    'special-election',
    'execute',
    'execute',
    null,
  ];
}
export function newGame(code: string, hostId: string, name: string): Game {
  return {
    fairness: undefined,
    code,
    hostId,
    players: [{ id: hostId, name, alive: true, ready: false }],
    phase: 'lobby',
    round: 0,
    revision: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    president: null,
    chancellor: null,
    lastPresident: null,
    lastChancellor: null,
    specialReturn: null,
    liberal: 0,
    fascist: 0,
    tracker: 0,
    initialCount: 0,
    deck: [],
    discard: [],
    hand: [],
    votes: {},
    lastVote: null,
    power: null,
    investigated: [],
    notes: {},
    vetoDenied: false,
    winner: null,
    winReason: null,
    log: [],
    logSequence: 0,
    messages: [],
    processed: [],
  };
}
export function validName(name: unknown): string {
  requireRule(typeof name === 'string', 'Enter a display name.');
  const clean = name.trim().replace(/\s+/g, ' ');
  requireRule(
    clean.length >= 2 && clean.length <= 24 && !/[\p{Cc}\p{Cf}]/u.test(clean),
    'Use a name of 2–24 visible characters.',
  );
  return clean;
}
export function joinGame(game: Game, id: string, name: string) {
  const seated = game.players.find((p) => p.id === id);
  if (seated) {
    seated.departed = false;
    if (!game.hostId) game.hostId = id;
    return;
  }
  requireRule(
    game.phase === 'lobby',
    'This game has started. Only seated players can reconnect.',
  );
  requireRule(game.players.length < 10, 'This table is full.');
  const clean = validName(name);
  requireRule(
    !game.players.some(
      (p) => p.name.toLocaleLowerCase() === clean.toLocaleLowerCase(),
    ),
    'That name is already seated. Choose another.',
  );
  game.players.push({ id, name: clean, ready: false, alive: true });
  if (!game.hostId) game.hostId = id;
}
const BOT_NAMES = [
  'Ada',
  'Bruno',
  'Clara',
  'Dieter',
  'Emilia',
  'Felix',
  'Greta',
  'Hugo',
  'Ingrid',
  'Jonas',
];
export function addBot(game: Game) {
  requireRule(
    game.phase === 'lobby',
    'AI players can only join before the deal.',
  );
  requireRule(game.players.length < 10, 'This table is full.');
  const name =
    BOT_NAMES.find(
      (n) =>
        !game.players.some((p) => p.name.toLowerCase() === n.toLowerCase()),
    ) ?? `AI ${game.players.length}`;
  game.players.push({
    id: crypto.randomUUID(),
    name,
    alive: true,
    ready: true,
    bot: true,
  });
  for (const player of game.players) if (!player.bot) player.ready = false;
  game.practice ??= {
    paused: false,
    pace: 'normal',
    nextAt: 0,
    lastTalkAt: 0,
    lastReplyId: '',
    memory: {},
  };
}
function log(game: Game, text: string) {
  game.log.push({ id: ++game.logSequence, round: game.round, text });
  game.log = game.log.slice(-240);
}
function nameOf(game: Game, id: string | null) {
  return game.players.find((p) => p.id === id)?.name ?? 'Player';
}
function living(game: Game) {
  return game.players.filter((p) => p.alive);
}
export function eligibleChancellors(game: Game) {
  return living(game)
    .filter(
      (p) =>
        p.id !== game.president &&
        p.id !== game.lastChancellor &&
        (living(game).length <= 5 || p.id !== game.lastPresident),
    )
    .map((p) => p.id);
}
function nextLiving(game: Game, after: string) {
  const index = game.players.findIndex((p) => p.id === after);
  for (let step = 1; step <= game.players.length; step++) {
    const p = game.players[(index + step) % game.players.length];
    if (p.alive) return p.id;
  }
  throw new Error('No living player');
}
function replenish(game: Game) {
  if (game.deck.length < 3) {
    game.deck = gameShuffle(game, 'reshuffle', [...game.deck, ...game.discard]);
    game.discard = [];
    log(
      game,
      'The remaining policies and discard pile were shuffled together.',
    );
  }
}
function gameShuffle<T extends string>(
  game: Game,
  kind: ShuffleEvent['kind'],
  items: T[],
): T[] {
  return game.fairness
    ? receiptShuffle(game.fairness, kind, game.round, items)
    : shuffle(items);
}
function finish(game: Game, winner: Policy, reason: string) {
  game.phase = 'finished';
  game.winner = winner;
  game.winReason = reason;
  game.power = null;
  log(game, `${winner === 'liberal' ? 'Liberals' : 'Fascists'} win. ${reason}`);
}
function nextRound(game: Game) {
  const after = game.specialReturn ?? game.president!;
  game.specialReturn = null;
  game.president = nextLiving(game, after);
  beginNomination(game);
}
function beginNomination(game: Game) {
  game.round++;
  game.phase = 'nomination';
  game.chancellor = null;
  game.votes = {};
  game.hand = [];
  game.power = null;
  game.vetoDenied = false;
  log(game, `${nameOf(game, game.president)} is the presidential candidate.`);
}
function enactPolicy(game: Game, policy: Policy, chaos = false) {
  game[policy]++;
  game.tracker = 0;
  log(
    game,
    `${chaos ? 'Chaos enacted' : 'The government enacted'} a ${policy} policy.`,
  );
  if (game.liberal === 5)
    return finish(game, 'liberal', 'Five liberal policies were enacted.');
  if (game.fascist === 6)
    return finish(game, 'fascist', 'Six fascist policies were enacted.');
  replenish(game);
  if (!chaos && policy === 'fascist') {
    game.power = powerTrack(game.initialCount)[game.fascist - 1];
    if (game.power) {
      game.phase = 'executive';
      return;
    }
  }
  nextRound(game);
}
function inactiveGovernment(game: Game) {
  game.tracker++;
  if (game.tracker === 3) {
    game.lastPresident = null;
    game.lastChancellor = null;
    if (!game.deck.length) replenish(game);
    enactPolicy(game, game.deck.shift()!, true);
  } else nextRound(game);
}
function addNote(game: Game, id: string, note: PrivateNote) {
  (game.notes[id] ??= []).push(note);
}
export function applyAction(game: Game, actorId: string, action: Action) {
  const actor = game.players.find((p) => p.id === actorId);
  requireRule(actor, 'You are not seated at this table.');
  requireRule(
    !actor.departed || action.type === 'leave',
    'Rejoin your reserved seat before playing.',
  );
  if (action.type === 'add-bot' || action.type === 'fill-bots') {
    requireRule(actorId === game.hostId, 'Only the host can add AI players.');
    addBot(game);
    if (action.type === 'fill-bots')
      while (game.players.length < 10) addBot(game);
    return;
  }
  if (action.type === 'practice-settings') {
    requireRule(
      actorId === game.hostId && game.practice,
      'Only the host can change the AI pace.',
    );
    requireRule(
      action.paused === undefined || typeof action.paused === 'boolean',
      'Invalid pause setting.',
    );
    requireRule(
      action.pace === undefined ||
        action.pace === 'normal' ||
        action.pace === 'fast',
      'Invalid AI pace.',
    );
    if (action.paused !== undefined) game.practice.paused = action.paused;
    if (action.pace !== undefined) game.practice.pace = action.pace;
    game.practice.nextAt = Date.now() + 1200;
    return;
  }
  if (action.type === 'chat') {
    requireRule(
      actor.alive || game.phase === 'finished',
      'Executed players may not speak until the game ends.',
    );
    requireRule(
      !(
        ['president-discard', 'chancellor-enact', 'veto-response'].includes(
          game.phase,
        ) &&
        (actorId === game.president || actorId === game.chancellor)
      ),
      'The government must remain silent during legislation.',
    );
    requireRule(typeof action.text === 'string', 'Enter a message.');
    const text = action.text.trim();
    requireRule(
      text.length > 0 && text.length <= 400 && !/[\p{Cc}\p{Cf}]/u.test(text),
      'Messages must contain 1–400 visible characters.',
    );
    game.messages.push({
      id: crypto.randomUUID(),
      playerId: actorId,
      name: actor.name,
      text,
      time: Date.now(),
    });
    game.messages = game.messages.slice(-100);
    return;
  }
  if (action.type === 'rematch') {
    requireRule(
      game.phase === 'finished' && actorId === game.hostId,
      'Only the host can open a rematch after the game.',
    );
    const players = game.players
      .filter((p) => !p.departed)
      .map((p) => ({
        id: p.id,
        name: p.name,
        alive: true,
        ready: !!p.bot,
        ...(p.bot ? { bot: true } : {}),
      }));
    const practice = game.practice
      ? {
          ...game.practice,
          memory: {},
          nextAt: 0,
          lastTalkAt: 0,
          lastReplyId: '',
          lastReaction: 0,
        }
      : undefined;
    const fresh = newGame(game.code, game.hostId, actor.name);
    const previousFairness =
      fairnessView(game.fairness, true) ?? game.previousFairness;
    Object.assign(game, fresh, {
      previousFairness,
      players,
      revision: game.revision,
      processed: game.processed,
      round: game.round + 1,
      practice,
    });
    return;
  }
  if (action.type === 'leave' || action.type === 'kick') {
    requireRule(
      action.type === 'leave' || game.phase === 'lobby',
      'Players can only be removed by the host in the lobby.',
    );
    const target = action.type === 'leave' ? actorId : action.target;
    if (action.type === 'kick')
      requireRule(
        actorId === game.hostId && target !== actorId,
        'Only the host can remove another player.',
      );
    requireRule(
      game.players.some((p) => p.id === target),
      'Player not found.',
    );
    if (game.phase === 'lobby' || game.phase === 'finished') {
      game.players = game.players.filter((p) => p.id !== target);
      if (game.phase === 'lobby')
        for (const p of game.players) if (!p.bot) p.ready = false;
    } else {
      actor.departed = true;
      log(
        game,
        `${actor.name} left the table. Their seat is reserved until this match ends.`,
      );
    }
    if (game.hostId === target)
      game.hostId = game.players.find((p) => !p.bot && !p.departed)?.id ?? '';
    if (!game.players.some((p) => p.bot)) delete game.practice;
    return;
  }
  if (action.type === 'ready') {
    requireRule(game.phase === 'lobby', 'The game has already started.');
    actor.ready = !actor.ready;
    return;
  }
  if (action.type === 'start') {
    requireRule(
      game.phase === 'lobby' && actorId === game.hostId,
      'Only the host can start a waiting table.',
    );
    const count = game.players.length;
    const roles = distribution(count);
    requireRule(
      game.players.every((p) => p.ready),
      'Every player must be ready.',
    );
    const deck: Role[] = gameShuffle(game, 'roles', [
      ...Array(roles.liberal).fill('liberal'),
      ...Array(roles.fascist).fill('fascist'),
      'hitler',
    ]);
    game.players.forEach((p, i) => {
      p.role = deck[i];
      p.alive = true;
    });
    game.initialCount = count;
    game.deck = gameShuffle(game, 'policies', [
      ...Array(6).fill('liberal'),
      ...Array(11).fill('fascist'),
    ]);
    game.president = gameShuffle(
      game,
      'president',
      game.players.map((p) => p.id),
    )[0];
    if (game.fairness)
      game.fairness.seats = game.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role!,
      }));
    log(
      game,
      `${count} players were dealt their secret roles. The first president was chosen at random.`,
    );
    beginNomination(game);
    return;
  }
  requireRule(
    actor.alive && game.phase !== 'finished',
    'You cannot act in this game.',
  );
  switch (action.type) {
    case 'nominate': {
      requireRule(
        game.phase === 'nomination' && actorId === game.president,
        'Only the presidential candidate can nominate now.',
      );
      requireRule(
        eligibleChancellors(game).includes(action.target),
        'That player is not eligible for chancellor.',
      );
      game.chancellor = action.target;
      game.phase = 'voting';
      game.votes = {};
      log(
        game,
        `${actor.name} nominated ${nameOf(game, action.target)} as chancellor.`,
      );
      break;
    }
    case 'vote': {
      requireRule(
        game.phase === 'voting' && typeof action.yes === 'boolean',
        'Voting is not available.',
      );
      requireRule(!(actorId in game.votes), 'Your ballot is already sealed.');
      game.votes[actorId] = action.yes;
      if (living(game).every((p) => p.id in game.votes)) {
        const yes = Object.values(game.votes).filter(Boolean).length;
        const passed = yes > living(game).length / 2;
        game.lastVote = {
          president: game.president!,
          chancellor: game.chancellor!,
          votes: { ...game.votes },
          passed,
          round: game.round,
        };
        log(
          game,
          `Election ${passed ? 'passed' : 'failed'}: ${yes} Ja, ${living(game).length - yes} Nein.`,
        );
        if (!passed) {
          inactiveGovernment(game);
          break;
        }
        game.lastPresident = game.president;
        game.lastChancellor = game.chancellor;
        if (
          game.fascist >= 3 &&
          game.players.find((p) => p.id === game.chancellor)!.role === 'hitler'
        ) {
          finish(
            game,
            'fascist',
            'Hitler was elected chancellor after three fascist policies.',
          );
          break;
        }
        if (game.fascist >= 3)
          log(
            game,
            `${nameOf(game, game.chancellor)} is confirmed not to be Hitler.`,
          );
        game.hand = game.deck.splice(0, 3);
        game.phase = 'president-discard';
        requireRule(game.hand.length === 3, 'The policy deck is inconsistent.');
      }
      break;
    }
    case 'discard': {
      requireRule(
        game.phase === 'president-discard' && actorId === game.president,
        'Only the president may discard now.',
      );
      requireRule(
        Number.isInteger(action.index) && action.index >= 0 && action.index < 3,
        'Choose one of your three policies.',
      );
      game.discard.push(game.hand.splice(action.index, 1)[0]);
      game.phase = 'chancellor-enact';
      break;
    }
    case 'enact': {
      requireRule(
        game.phase === 'chancellor-enact' && actorId === game.chancellor,
        'Only the chancellor may enact now.',
      );
      requireRule(
        Number.isInteger(action.index) && action.index >= 0 && action.index < 2,
        'Choose one of your two policies.',
      );
      const policy = game.hand.splice(action.index, 1)[0];
      game.discard.push(...game.hand);
      game.hand = [];
      enactPolicy(game, policy);
      break;
    }
    case 'veto': {
      requireRule(
        game.phase === 'chancellor-enact' &&
          actorId === game.chancellor &&
          game.fascist >= 5 &&
          !game.vetoDenied,
        'A veto cannot be requested now.',
      );
      game.phase = 'veto-response';
      log(game, `${actor.name} requested a veto.`);
      break;
    }
    case 'veto-answer': {
      requireRule(
        game.phase === 'veto-response' &&
          actorId === game.president &&
          typeof action.yes === 'boolean',
        'Only the president may answer the veto.',
      );
      if (action.yes) {
        game.discard.push(...game.hand);
        game.hand = [];
        log(
          game,
          'The president agreed to the veto. The election tracker advances.',
        );
        replenish(game);
        inactiveGovernment(game);
      } else {
        game.vetoDenied = true;
        game.phase = 'chancellor-enact';
        log(
          game,
          'The president refused the veto. The chancellor must enact a policy.',
        );
      }
      break;
    }
    case 'power': {
      requireRule(
        game.phase === 'executive' && actorId === game.president,
        'Only the president may exercise this power.',
      );
      if (game.power === 'peek') {
        addNote(game, actorId, {
          text: `Round ${game.round}: the next three policies, in draw order.`,
          policies: game.deck.slice(0, 3),
        });
        log(game, `${actor.name} privately inspected the next three policies.`);
        nextRound(game);
        break;
      }
      const target = game.players.find((p) => p.id === action.target);
      requireRule(
        target && target.alive && target.id !== actorId,
        'Choose another living player.',
      );
      if (game.power === 'investigate') {
        requireRule(
          !game.investigated.includes(target.id),
          'This player has already been investigated.',
        );
        game.investigated.push(target.id);
        addNote(game, actorId, {
          text: `Round ${game.round}: ${target.name} has ${target.role === 'liberal' ? 'Liberal' : 'Fascist'} party membership.`,
          targetId: target.id,
          party: target.role === 'liberal' ? 'liberal' : 'fascist',
        });
        log(
          game,
          `${actor.name} investigated ${target.name}. Their party membership remains private.`,
        );
        nextRound(game);
      } else if (game.power === 'special-election') {
        game.specialReturn = actorId;
        game.president = target.id;
        log(
          game,
          `${actor.name} called a special election with ${target.name} as president.`,
        );
        beginNomination(game);
      } else if (game.power === 'execute') {
        target.alive = false;
        log(game, `${actor.name} executed ${target.name}.`);
        if (target.role === 'hitler')
          finish(game, 'liberal', 'Hitler was executed.');
        else {
          log(
            game,
            `${target.name} was not Hitler. Their party membership is not revealed.`,
          );
          nextRound(game);
        }
      }
      break;
    }
    default:
      throw new RuleError('Unknown action.');
  }
}

// Deliberate allowlist: adding a new secret field to Game cannot expose it here.
export function viewFor(game: Game, viewerId: string) {
  const me = game.players.find((p) => p.id === viewerId);
  requireRule(me, 'You are not seated at this table.');
  const knowsTeam =
    me.role === 'fascist' || (me.role === 'hitler' && game.initialCount <= 6);
  const teammates = knowsTeam
    ? game.players
        .filter((p) => p.id !== viewerId && p.role !== 'liberal')
        .map((p) => ({ id: p.id, name: p.name, role: p.role! }))
    : [];
  const seesHand =
    (game.phase === 'president-discard' && game.president === viewerId) ||
    ((game.phase === 'chancellor-enact' || game.phase === 'veto-response') &&
      game.chancellor === viewerId);
  return {
    code: game.code,
    fairness: fairnessView(game.fairness, game.phase === 'finished'),
    previousFairness: game.previousFairness ?? null,
    hostId: game.hostId,
    phase: game.phase,
    round: game.round,
    revision: game.revision,
    practice: game.practice
      ? { paused: game.practice.paused, pace: game.practice.pace }
      : null,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      ready: p.ready,
      bot: !!p.bot,
      departed: !!p.departed,
      ...(game.phase === 'finished' ? { role: p.role } : {}),
    })),
    president: game.president,
    chancellor: game.chancellor,
    lastPresident: game.lastPresident,
    lastChancellor: game.lastChancellor,
    liberal: game.liberal,
    fascist: game.fascist,
    tracker: game.tracker,
    initialCount: game.initialCount,
    drawCount: game.deck.length,
    discardCount: game.discard.length,
    voted: Object.keys(game.votes),
    lastVote: game.lastVote,
    power: game.power,
    investigated: game.investigated,
    eligible: game.phase === 'nomination' ? eligibleChancellors(game) : [],
    vetoDenied: game.vetoDenied,
    winner: game.winner,
    winReason: game.winReason,
    log: game.log,
    messages: game.messages,
    me: {
      id: me.id,
      role: me.role ?? null,
      teammates,
      hand: seesHand ? game.hand : [],
      ballot: game.votes[viewerId] ?? null,
      notes: game.notes[viewerId] ?? [],
    },
  };
}
export type GameView = ReturnType<typeof viewFor>;
