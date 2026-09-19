export const TRANSFER_TTL_MS = 10 * 60_000;

// Only credential hashes cross this storage boundary. Replacing a link and
// claiming it both compare the current session hash, so old devices cannot
// issue another link after a transfer. No room state or player IDs change.
export async function issueTransfer(
  db: D1Database,
  sessionHash: string,
  code: string,
  transferHash: string,
  now = Date.now(),
) {
  return db
    .prepare(
      `UPDATE sessions SET transfer_hash=?, transfer_code=?, transfer_expires=?
     WHERE hash=? AND expires>? RETURNING transfer_expires AS expires`,
    )
    .bind(transferHash, code, now + TRANSFER_TTL_MS, sessionHash, now)
    .first<{ expires: number }>();
}

export async function revokeTransfer(db: D1Database, sessionHash: string) {
  await db
    .prepare(
      'UPDATE sessions SET transfer_hash=NULL, transfer_code=NULL, transfer_expires=NULL WHERE hash=?',
    )
    .bind(sessionHash)
    .run();
}

export async function claimTransfer(
  db: D1Database,
  transferHash: string,
  code: string,
  newSessionHash: string,
  now = Date.now(),
) {
  // One atomic statement consumes the grant and rotates authentication. The
  // room and membership checks are part of that same statement: a stale link
  // cannot revive a closed table or a removed/departed seat.
  return db
    .prepare(
      `UPDATE sessions SET hash=?, expires=?, last_seen=?,
       transfer_hash=NULL, transfer_code=NULL, transfer_expires=NULL
     WHERE transfer_hash=? AND transfer_code=? AND transfer_expires>?
       AND expires>? AND EXISTS (
         SELECT 1 FROM rooms, json_each(rooms.state, '$.players') AS player
         WHERE rooms.code=? AND rooms.close_at>? AND rooms.updated_at>?
           AND json_extract(player.value, '$.id')=sessions.id
           AND COALESCE(json_extract(player.value, '$.departed'), 0)=0
           AND COALESCE(json_extract(player.value, '$.bot'), 0)=0
       ) RETURNING id`,
    )
    .bind(
      newSessionHash,
      now + 7 * 86400_000,
      now,
      transferHash,
      code,
      now,
      now,
      code,
      now,
      now - 7 * 86400_000,
    )
    .first<{ id: string }>();
}
