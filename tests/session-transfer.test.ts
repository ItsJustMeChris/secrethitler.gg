import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  claimTransfer,
  issueTransfer,
  revokeTransfer,
  TRANSFER_TTL_MS,
} from '../lib/session-transfer.ts';

const now = 1_000_000;
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const migration of ['0000_real_mad_thinker', '0001_websocket_rooms'])
    sql.exec(
      readFileSync(
        new URL(`../drizzle/${migration}.sql`, import.meta.url),
        'utf8',
      ),
    );
  sql
    .prepare(
      'INSERT INTO sessions (hash,id,expires,last_seen) VALUES (?,?,?,?)',
    )
    .run('old-cookie', 'alice', now + 2 * TRANSFER_TTL_MS, now);
  sql
    .prepare(
      'INSERT INTO rooms (code,state,revision,updated_at,close_at) VALUES (?,?,0,?,?)',
    )
    .run(
      'ABCDEFGH',
      JSON.stringify({ players: [{ id: 'alice' }] }),
      now,
      now + 2 * TRANSFER_TTL_MS,
    );
  sql.exec(
    readFileSync(
      new URL('../drizzle/0002_seat_transfer.sql', import.meta.url),
      'utf8',
    ),
  );
  const db = {
    prepare(query: string) {
      return {
        bind(...args: (string | number)[]) {
          return {
            async first() {
              return sql.prepare(query).get(...args) ?? null;
            },
            async run() {
              return sql.prepare(query).run(...args);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { sql, db };
}

void test('migration preserves seats; claiming rotates the cookie exactly once without changing room state', async () => {
  const { sql, db } = fixture();
  try {
    const room = sql.prepare('SELECT * FROM rooms').get();
    assert.equal(
      (await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'secret-hash', now))
        ?.expires,
      now + TRANSFER_TTL_MS,
    );
    const results = await Promise.all([
      claimTransfer(db, 'secret-hash', 'ABCDEFGH', 'new-cookie', now + 1),
      claimTransfer(db, 'secret-hash', 'ABCDEFGH', 'racing-cookie', now + 1),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const session = sql.prepare('SELECT * FROM sessions').get()!;
    assert.equal(session.id, 'alice');
    assert.equal(session.hash, 'new-cookie');
    assert.equal(session.transfer_hash, null);
    assert.equal(session.transfer_code, null);
    assert.equal(session.transfer_expires, null);
    assert.deepEqual(sql.prepare('SELECT * FROM rooms').get(), room);
    assert.equal(
      await issueTransfer(
        db,
        'old-cookie',
        'ABCDEFGH',
        'old-device-grant',
        now + 2,
      ),
      null,
    );
  } finally {
    sql.close();
  }
});

void test('replacement and cancellation invalidate previous transfer links', async () => {
  const { sql, db } = fixture();
  try {
    await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'first', now);
    await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'second', now + 1);
    assert.equal(
      await claimTransfer(db, 'first', 'ABCDEFGH', 'new', now + 2),
      null,
    );
    await revokeTransfer(db, 'unrelated-cookie');
    assert.equal(
      sql.prepare('SELECT transfer_hash FROM sessions').get()!.transfer_hash,
      'second',
    );
    await revokeTransfer(db, 'old-cookie');
    assert.equal(
      await claimTransfer(db, 'second', 'ABCDEFGH', 'new', now + 2),
      null,
    );
  } finally {
    sql.close();
  }
});

void test('expired links, expired sessions, wrong room and wrong token cannot claim a seat', async () => {
  const { sql, db } = fixture();
  try {
    await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'secret', now);
    assert.equal(
      await claimTransfer(db, 'forged', 'ABCDEFGH', 'new', now),
      null,
    );
    assert.equal(
      await claimTransfer(db, 'secret', 'BCDEFGHJ', 'new', now),
      null,
    );
    assert.equal(
      await claimTransfer(
        db,
        'secret',
        'ABCDEFGH',
        'new',
        now + TRANSFER_TTL_MS,
      ),
      null,
    );
    sql.prepare('UPDATE sessions SET expires=?').run(now);
    assert.equal(
      await claimTransfer(db, 'secret', 'ABCDEFGH', 'new', now),
      null,
    );
    assert.equal(
      await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'another', now),
      null,
    );
  } finally {
    sql.close();
  }
});

for (const unavailable of ['closed', 'removed', 'departed', 'bot']) {
  void test(`${unavailable} seats cannot be restored through a transfer`, async () => {
    const { sql, db } = fixture();
    try {
      await issueTransfer(db, 'old-cookie', 'ABCDEFGH', 'secret', now);
      if (unavailable === 'closed')
        sql.prepare('UPDATE rooms SET close_at=?').run(now);
      else
        sql
          .prepare('UPDATE rooms SET state=?')
          .run(
            JSON.stringify({
              players:
                unavailable === 'removed'
                  ? []
                  : [{ id: 'alice', [unavailable]: true }],
            }),
          );
      assert.equal(
        await claimTransfer(db, 'secret', 'ABCDEFGH', 'new', now),
        null,
      );
      assert.equal(
        sql.prepare('SELECT hash FROM sessions').get()!.hash,
        'old-cookie',
      );
    } finally {
      sql.close();
    }
  });
}
