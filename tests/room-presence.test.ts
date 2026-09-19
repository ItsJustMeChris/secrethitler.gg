import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  keepRoomOpen,
  releaseRoom,
  ROOM_GRACE_MS,
  SOCKET_LEASE_MS,
} from '../lib/room-presence.ts';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(
    readFileSync(
      new URL('../drizzle/0000_real_mad_thinker.sql', import.meta.url),
      'utf8',
    ),
  );
  sql.exec("INSERT INTO rooms VALUES ('OLDROOM1','{}',0,1000)");
  sql.exec(
    readFileSync(
      new URL('../drizzle/0001_websocket_rooms.sql', import.meta.url),
      'utf8',
    ),
  );
  const db = {
    prepare(query: string) {
      return {
        bind(...args: (string | number)[]) {
          return { query, args };
        },
      };
    },
    async batch(statements: { query: string; args: (string | number)[] }[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map(({ query, args }) => ({
          meta: { changes: sql.prepare(query).run(...args).changes },
        }));
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return {
    sql,
    db,
    deadline: () =>
      Number(
        sql.prepare('SELECT close_at FROM rooms WHERE code=?').get('ABCDEFGH')!
          .close_at,
      ),
  };
}

void test('migration retires existing rooms; last socket closes the room after a reconnect grace period', async () => {
  const { sql, db, deadline } = database();
  try {
    assert.equal(
      sql.prepare('SELECT COUNT(*) AS count FROM rooms').get()!.count,
      0,
    );
    const now = 100_000;
    sql
      .prepare('INSERT INTO rooms VALUES (?,?,0,?,?)')
      .run('ABCDEFGH', '{}', now, now + ROOM_GRACE_MS);
    assert.equal(
      await keepRoomOpen(db, 'ABCDEFGH', 'socket-1', 'player-1', now),
      true,
    );
    assert.equal(
      await keepRoomOpen(db, 'ABCDEFGH', 'socket-2', 'player-2', now + 1000),
      true,
    );
    await releaseRoom(db, 'ABCDEFGH', 'socket-1', now + 2000);
    assert.equal(deadline(), now + 1000 + SOCKET_LEASE_MS + ROOM_GRACE_MS);
    await releaseRoom(db, 'ABCDEFGH', 'socket-2', now + 3000);
    assert.equal(deadline(), now + 3000 + ROOM_GRACE_MS);
    // A legitimate reconnect keeps the same room; expired rooms cannot resurrect.
    assert.equal(
      await keepRoomOpen(db, 'ABCDEFGH', 'socket-3', 'player-1', now + 4000),
      true,
    );
    await releaseRoom(db, 'ABCDEFGH', 'socket-3', now + 5000);
    assert.equal(
      await keepRoomOpen(db, 'ABCDEFGH', 'too-late', 'player-1', deadline()),
      false,
    );
  } finally {
    sql.close();
  }
});

void test('lost close events expire and two tabs for one player keep independent leases', async () => {
  const { sql, db, deadline } = database();
  try {
    const now = 100_000;
    sql
      .prepare('INSERT INTO rooms VALUES (?,?,0,?,?)')
      .run('ABCDEFGH', '{}', now, now + ROOM_GRACE_MS);
    await keepRoomOpen(db, 'ABCDEFGH', 'tab-1', 'same-player', now);
    await keepRoomOpen(db, 'ABCDEFGH', 'tab-2', 'same-player', now + 10_000);
    await releaseRoom(db, 'ABCDEFGH', 'tab-1', now + 10_001);
    const end = now + 10_000 + SOCKET_LEASE_MS + ROOM_GRACE_MS;
    assert.equal(deadline(), end);
    assert.equal(
      await keepRoomOpen(db, 'ABCDEFGH', 'late', 'same-player', end + 1),
      false,
    );
    sql.prepare('DELETE FROM rooms WHERE close_at<=?').run(end);
    assert.equal(
      sql.prepare('SELECT COUNT(*) AS count FROM room_connections').get()!
        .count,
      0,
    );
  } finally {
    sql.close();
  }
});
