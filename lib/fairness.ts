// Shared, deterministic shuffle receipt. Secrets are projected only after a match.
export type ShuffleEvent = {
  kind: 'roles' | 'policies' | 'president' | 'reshuffle';
  round: number;
  input: string[];
  output: string[];
};
export type Fairness = {
  id: string;
  commitment: string;
  seed: string;
  words: number[];
  cursor: number;
  events: ShuffleEvent[];
  seats: { id: string; name: string; role: string }[];
};
export type FairnessView = {
  id: string;
  commitment: string;
  shuffleCount: number;
  reveal: null | Pick<Fairness, 'seed' | 'events' | 'seats'>;
};
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function seedCommitment(id: string, seed: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(['sh-shuffle-v1', id, seed])),
      ),
    ),
  );
}
async function randomWords(seed: string) {
  if (!/^[a-f0-9]{64}$/.test(seed)) throw new Error('Invalid receipt seed.');
  const bytes = Uint8Array.from(seed.match(/../g)!, (s) => parseInt(s, 16));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-CTR', false, [
    'encrypt',
  ]);
  // A fresh 256-bit key for each match; counter zero, big-endian 32-bit words.
  const stream = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
    key,
    new Uint8Array(16384),
  );
  const view = new DataView(stream);
  return Array.from({ length: stream.byteLength / 4 }, (_, i) =>
    view.getUint32(i * 4),
  );
}
export async function createFairness(): Promise<Fairness> {
  const seed = hex(crypto.getRandomValues(new Uint8Array(32)));
  const id = crypto.randomUUID();
  return {
    id,
    seed,
    commitment: await seedCommitment(id, seed),
    words: await randomWords(seed),
    cursor: 0,
    events: [],
    seats: [],
  };
}
export function receiptInt(
  proof: Pick<Fairness, 'words' | 'cursor'>,
  max: number,
) {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000)
    throw new Error('Invalid random bound.');
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    if (proof.cursor >= proof.words.length)
      throw new Error('Shuffle entropy exhausted.');
    value = proof.words[proof.cursor++];
  } while (value >= limit);
  return value % max;
}
export function receiptShuffle<T extends string>(
  proof: Fairness,
  kind: ShuffleEvent['kind'],
  round: number,
  input: T[],
): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i--) {
    const j = receiptInt(proof, i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  proof.events.push({ kind, round, input: [...input], output: [...output] });
  return output;
}
export function fairnessView(
  proof: Fairness | undefined,
  finished: boolean,
): FairnessView | null {
  if (!proof) return null;
  return {
    id: proof.id,
    commitment: proof.commitment,
    shuffleCount: proof.events.length,
    reveal: finished
      ? { seed: proof.seed, events: proof.events, seats: proof.seats }
      : null,
  };
}
export async function verifyFairness(
  proof: FairnessView,
  savedCommitment: string,
) {
  const reveal = proof.reveal;
  if (!reveal) throw new Error('The seed is private until the match ends.');
  if (
    proof.commitment !== savedCommitment ||
    (await seedCommitment(proof.id, reveal.seed)) !== savedCommitment
  )
    throw new Error('The seed does not match the saved commitment.');
  const replay: Fairness = {
    ...proof,
    seed: reveal.seed,
    words: await randomWords(reveal.seed),
    cursor: 0,
    events: [],
    seats: reveal.seats,
  };
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const count = reveal.seats.length;
  if (
    count < 5 ||
    count > 10 ||
    new Set(reveal.seats.map((s) => s.id)).size !== count
  )
    throw new Error('Invalid seating record.');
  if (reveal.events.length < 3 || reveal.events.length !== proof.shuffleCount)
    throw new Error('Incomplete shuffle record.');
  const fascists = Math.floor((count - 3) / 2);
  const initialRoles = [
    ...Array(count - fascists - 1).fill('liberal'),
    ...Array(fascists).fill('fascist'),
    'hitler',
  ];
  const initialPolicies = [
    ...Array(6).fill('liberal'),
    ...Array(11).fill('fascist'),
  ];
  for (const [i, event] of reveal.events.entries()) {
    const expectedKind =
      i === 0
        ? 'roles'
        : i === 1
          ? 'policies'
          : i === 2
            ? 'president'
            : 'reshuffle';
    if (
      event.kind !== expectedKind ||
      event.input.length > 17 ||
      event.input.length < 1
    )
      throw new Error('Invalid shuffle sequence.');
    if (
      (i === 0 && !same(event.input, initialRoles)) ||
      (i === 1 && !same(event.input, initialPolicies)) ||
      (i === 2 &&
        !same(
          event.input,
          reveal.seats.map((s) => s.id),
        ))
    )
      throw new Error('The starting distribution does not match the rules.');
    const result = receiptShuffle(replay, event.kind, event.round, event.input);
    if (!same(result, event.output))
      throw new Error(`Shuffle ${i + 1} failed verification.`);
  }
  if (
    !same(
      reveal.events[0].output,
      reveal.seats.map((s) => s.role),
    )
  )
    throw new Error('The revealed roles do not match the shuffle.');
  return {
    shuffles: reveal.events.length,
    players: count,
    firstPresident: reveal.events[2].output[0],
  };
}
