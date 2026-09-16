// Demonstrate that the independent audit detects deliberately incorrect rules.
// Each mutant runs in its own temporary copy; repository source is never changed.
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, 'lib/game.ts'), 'utf8');
const mutations = [
  [
    'chaos before veto replenishment',
    'replenish(game);\n        inactiveGovernment(game);',
    'inactiveGovernment(game);\n        replenish(game);',
  ],
  [
    'executions reveal teammates to Hitler',
    "(me.role === 'hitler' && game.initialCount <= 6)",
    "(me.role === 'hitler' && living(game).length <= 6)",
  ],
  [
    'ties pass',
    'yes > living(game).length / 2',
    'yes >= living(game).length / 2',
  ],
  [
    'reveal partial election',
    'living(game).every((p) => p.id in game.votes)',
    'Object.keys(game.votes).length >= Math.ceil(living(game).length / 2)',
  ],
  ['ignore last chancellor', 'p.id !== game.lastChancellor &&', 'true &&'],
  [
    'relax terms at six',
    'living(game).length <= 5',
    'living(game).length <= 6',
  ],
  ['permit self nomination', 'p.id !== game.president &&', 'true &&'],
  ['draw bottom three', 'game.deck.splice(0, 3)', 'game.deck.splice(-3, 3)'],
  [
    'discard wrong index',
    'game.hand.splice(action.index, 1)[0]',
    'game.hand.splice(0, 1)[0]',
  ],
  [
    'enact wrong index',
    'const policy = game.hand.splice(action.index, 1)[0]',
    'const policy = game.hand.splice(1 - action.index, 1)[0]',
  ],
  ['four Liberal policies win', 'game.liberal === 5', 'game.liberal === 4'],
  ['five Fascist policies win', 'game.fascist === 6', 'game.fascist === 5'],
  [
    'Hitler needs four policies',
    'game.fascist >= 3 &&\n          game.players',
    'game.fascist >= 4 &&\n          game.players',
  ],
  [
    'retain chaos term limits',
    'game.lastChancellor = null;',
    'game.lastChancellor = game.lastChancellor;',
  ],
  [
    'chaos grants powers',
    "!chaos && policy === 'fascist'",
    "policy === 'fascist'",
  ],
  [
    'shuffle at three remaining',
    'game.deck.length < 3',
    'game.deck.length <= 3',
  ],
  [
    'drop leftover policies at shuffle',
    '[...game.deck, ...game.discard]',
    '[...game.discard]',
  ],
  [
    'wrong small-table power',
    "[null, null, 'peek', 'execute', 'execute', null]",
    "[null, null, 'investigate', 'execute', 'execute', null]",
  ],
  [
    'forget special-election return',
    'game.specialReturn ?? game.president!',
    'game.president!',
  ],
  [
    'reverse policy peek',
    'policies: game.deck.slice(0, 3)',
    'policies: game.deck.slice(0, 3).reverse()',
  ],
  [
    'allow repeated investigation',
    '!game.investigated.includes(target.id)',
    'true',
  ],
  [
    'reveal Hitler in investigation',
    "party: target.role === 'liberal' ? 'liberal' : 'fascist'",
    'party: target.role',
  ],
  [
    'execution leaves player alive',
    'target.alive = false;',
    'target.alive = true;',
  ],
  ['veto unlocks too early', 'game.fascist >= 5 &&', 'game.fascist >= 4 &&'],
  ['allow repeat veto after refusal', '!game.vetoDenied,', 'true,'],
  ['tracker never resets', 'game.tracker = 0;', 'game.tracker = game.tracker;'],
  [
    'expose legislative hands',
    'hand: seesHand ? game.hand : []',
    'hand: game.hand',
  ],
  [
    'hide submitted public ballots',
    "ballots: game.phase === 'voting' ? { ...game.votes } : {}",
    'ballots: {}',
  ],
  [
    'expose private notes',
    'notes: game.notes[viewerId] ?? []',
    'notes: Object.values(game.notes).flat()',
  ],
  [
    'Hitler always sees teammates',
    "(me.role === 'hitler' && game.initialCount <= 6)",
    "(me.role === 'hitler')",
  ],
];

const workspace = mkdtempSync(join(tmpdir(), 'secret-hitler-rules-'));
function run(name, code) {
  const folder = join(workspace, name);
  mkdirSync(join(folder, 'lib'), { recursive: true });
  mkdirSync(join(folder, 'tests'));
  writeFileSync(join(folder, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(folder, 'lib/game.ts'), code);
  for (const file of [
    'lib/fairness.ts',
    'lib/portraits.ts',
    'tests/rules-audit.test.ts',
  ])
    copyFileSync(join(root, file), join(folder, file));
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--test',
      '--test-reporter=tap',
      'tests/rules-audit.test.ts',
    ],
    {
      cwd: folder,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  assert.equal(
    result.error,
    undefined,
    `runner failure for ${name}: ${result.error}`,
  );
  assert.equal(result.signal, null, `runner interrupted for ${name}`);
  return result;
}

try {
  const baseline = run('baseline', source);
  assert.equal(
    baseline.status,
    0,
    `unmodified baseline failed:\n${baseline.stdout}\n${baseline.stderr}`,
  );
  console.log('PASS: unmodified engine passes the independent rules audit.');
  for (const [index, [name, before, after]] of mutations.entries()) {
    const normalized = source.replaceAll('\r\n', '\n');
    // Some expressions appear more than once; explicitly mutate the first occurrence.
    assert.ok(
      normalized.includes(before),
      `mutation anchor disappeared: ${name}`,
    );
    const result = run(`mutant-${index}`, normalized.replace(before, after));
    assert.notEqual(result.status, 0, `SURVIVED: ${name}`);
    // A syntax/import failure is not evidence that an assertion detected the defect.
    assert.match(
      result.stdout,
      /ERR_ASSERTION/,
      `no assertion failure for ${name}:\n${result.stdout}\n${result.stderr}`,
    );
    assert.match(
      result.stdout,
      /# tests 11\b/,
      `audit did not load completely for ${name}`,
    );
    console.log(`DETECTED: ${name}`);
  }
  console.log(
    `PASS: all ${mutations.length} deliberately incorrect rule implementations were detected.`,
  );
} finally {
  const withinTemp = relative(tmpdir(), workspace);
  assert.ok(
    withinTemp && !isAbsolute(withinTemp) && !withinTemp.startsWith('..'),
    'cleanup must stay within the OS temporary directory',
  );
  assert.ok(workspace.includes('secret-hitler-rules-'));
  rmSync(workspace, { recursive: true, force: true });
}
