// A vanished Worker cannot run a close handler, so leases expire as well.
export const SOCKET_LEASE_MS = 45_000;
export const ROOM_GRACE_MS = 60_000;

export async function keepRoomOpen(
  db: D1Database,
  code: string,
  id: string,
  playerId: string,
  now = Date.now(),
) {
  const results = await db.batch([
    db
      .prepare(`INSERT INTO room_connections (id,code,player_id,expires_at)
      SELECT ?,code,?,? FROM rooms WHERE code=? AND close_at>?
      ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at`)
      .bind(id, playerId, now + SOCKET_LEASE_MS, code, now),
    db
      .prepare(
        'UPDATE rooms SET close_at=MAX(close_at,?) WHERE code=? AND close_at>?',
      )
      .bind(now + SOCKET_LEASE_MS + ROOM_GRACE_MS, code, now),
  ]);
  return results[0].meta.changes > 0;
}

export async function releaseRoom(
  db: D1Database,
  code: string,
  id: string,
  now = Date.now(),
) {
  await db.batch([
    db
      .prepare('DELETE FROM room_connections WHERE id=? AND code=?')
      .bind(id, code),
    db
      .prepare(`UPDATE rooms SET close_at=MAX(?,COALESCE(
      (SELECT MAX(expires_at)+? FROM room_connections WHERE code=? AND expires_at>?),?
    )) WHERE code=? AND close_at>?`)
      .bind(
        now + ROOM_GRACE_MS,
        ROOM_GRACE_MS,
        code,
        now,
        now + ROOM_GRACE_MS,
        code,
        now,
      ),
  ]);
}
