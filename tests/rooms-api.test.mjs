import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { liveClient } from './live-client.mjs';

const base = process.env.TEST_URL || 'http://localhost:3000';
const ip = `room-lifecycle-${randomUUID()}`;
async function create(name) {
  const response = await fetch(`${base}/api/table`, {
    method: 'POST',
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify({ operation: 'create', name }),
  });
  assert.equal(response.status, 201);
  const game = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('sh_session='))
    .split(';')[0];
  return { code: game.code, cookie };
}
const empty = await create('Closing room');
const occupied = await create('Occupied room');
const emptyLive = liveClient(base, empty.cookie, empty.code);
const occupiedLive = liveClient(base, occupied.cookie, occupied.code);
let returned;
try {
  await Promise.all([
    emptyLive.wait((m) => m.type === 'state'),
    occupiedLive.wait((m) => m.type === 'state'),
  ]);
  emptyLive.close();
  returned = liveClient(base, empty.cookie, empty.code);
  await returned.wait((m) => m.type === 'state');
  returned.close();
  console.log(
    'PASS: reconnect during grace restores the room. Checking real expiry and occupied-room lease renewal…',
  );
  await delay(32_000);
  await delay(32_000);
  const get = (room) =>
    fetch(`${base}/api/table?code=${room.code}`, {
      headers: { Cookie: room.cookie },
    });
  const closed = await get(empty);
  assert.equal(closed.status, 404);
  const message = await closed.json();
  assert.match(message.error, /closed|expired/);
  const stillOpen = await get(occupied);
  assert.equal(stillOpen.status, 200);
  await stillOpen.json();
  assert.ok(
    occupiedLive.messages.filter((m) => m.type === 'state').length >= 3,
  );
  console.log(
    'PASS: last socket disconnect closes its room; another occupied room survives heartbeat renewal and socket rotation.',
  );
} finally {
  emptyLive.close();
  occupiedLive.close();
  returned?.close();
}
