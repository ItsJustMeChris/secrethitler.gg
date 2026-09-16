# WebSocket transport and room lifetime

`worker.ts` accepts `/api/table/live` upgrades before the framework handles ordinary HTTP requests. The upgrade requires an exact matching Origin. An unbound connection creates or renews an anonymous session using an HttpOnly cookie set on the upgrade response. Adding `?code=…` restores an existing active human seat before any room snapshot is sent. There are no bearer tokens in URLs. Frames contain only `viewFor` projections, never the room's raw JSON. Each connection has its own player identity.

All browser game traffic uses the socket: session setup, create/join/solo/restore, moves, chat, host controls, manual AI steps, leave, and rematch. The browser receives `ready` or personalized `state` frames and sends `ping`, `sync`, and bounded `command` frames. Commands carry a UUID and receive a correlated `result` or `rejected` acknowledgement. Server validation, rate limits, phase/round checks, and revision-conditional writes are shared with the retained compatibility HTTP API. Commands run serially on each connection, with a bounded queue; different players can act concurrently. Move request IDs are persisted in the game, and recent command IDs are deduplicated on the connection.

The browser never automatically replays a mutation. Disconnects reject pending commands immediately; missing acknowledgements time out after eight seconds and trigger a fresh snapshot. The UI releases its busy state in either case. A committed move whose reply was lost appears in the restored snapshot. If creation commits but its reply is lost, the unknown room expires normally and the player can create another. Pages and static assets still load over HTTP.

## Hosting and consistency

This version uses the existing Sites Worker and D1 binding. No Durable Object or external broker binding is provisioned by the project's hosting configuration. The server checks the shared D1 revision every 750 ms, sending a personalized snapshot on change. Therefore this is a WebSocket client transport with database-backed synchronization, not immediate event-driven fan-out. It preserves correct cross-isolate behavior and compatibility with the existing HTTP API. A future room coordinator can remove these database checks if the hosting platform exposes one.

While a socket is active, the server advances due AI actions through the existing revision-conditional scheduler. Concurrent sockets cannot accelerate pacing or choose bot identities. Automatic work stops when no human connection remains. Server streams rotate after a minute to bound each Worker's request/query budget and refresh authentication; the client reconnects with the same seat. No application state depends on a particular Worker instance.

## Recovery

- The connection is ready only after an authenticated snapshot or an unbound `ready` message, not merely a successful upgrade.
- A five-second heartbeat checks responsiveness. A missing initial snapshot or 20 seconds without a response restarts the connection; retries back off from 500 ms to ten seconds.
- Server heartbeats are withheld if database synchronization stalls for more than 15 seconds, so a live transport cannot conceal stalled table updates.
- Focus, page restoration, and network recovery request an immediate resync. Hidden tabs release their connection and reconnect when shown.
- Closed rooms and expired sessions clear the saved room and reconnect to an unbound socket, so the player can create or join again. Stale responses cannot overwrite a newer room revision.
- Private modal contents hide when the window loses focus. Dismissing a modal immediately removes its overlay and focus lock. Inspection results can be dismissed with the close button, acknowledgement, Escape, or the backdrop.

## Room closure and migration

Each socket owns an independent D1 lease, including multiple tabs with the same cookie. Leases last 45 seconds and renew every 20 seconds. A normal final disconnect gives the room 60 seconds to reconnect. If a Worker or client disappears without delivering a close event, its lease expires first; the room then closes after the same grace period. Other live sockets preserve the room. New rooms have 60 seconds to connect their first socket.

The deadline is enforced on reads, upgrades and writes. Expired rooms cannot be revived. Expired room rows are physically removed on access or subsequent table creation; deleting a room cascades to its connection rows. Unused session cookies retain their existing seven-day expiry.

`drizzle/0001_websocket_rooms.sql` adds the lease table and room deadline and deliberately deletes **all existing rooms**. Session records remain. Apply the migration and this build together. This invalidates old room links and active matches once applied; users create new rooms under the new lifecycle. Applying local migrations affects only the local database. A production migration remains applied even if the application is rolled back; do not rewrite an applied migration or its metadata.

## Production deployment blocker — September 16, 2026

The socket build passed the local Worker integration tests and was published as Sites version 20. Live WebSocket handshakes on both `secrethitler.gg` and the generated Sites domain returned HTTP 500 with a Sites dispatch platform-error page. Ordinary page requests returned 200, and a non-upgrade request to `/api/table/live` correctly returned the application's 426 response. The user Worker logs showed canceled upgrade invocations without an application exception. These observations point to the hosted upgrade path; they do not establish its internal cause.

Production was restored to the previously working version 19. Real production HTTP checks then successfully created, restored, and left a table. **The live application therefore still uses the previous HTTP transport; the WebSocket implementation is saved in Git but is not the active release.** Migration `0001_websocket_rooms` was applied during version 20's successful deployment and remains applied, including its one-time room reset. The previous application tolerates the additional schema.

Do not publish this socket-only build on Sites again without resolving and verifying live upgrade support. A WebSocket-capable deployment path is required; removing the remaining server-side D1 revision checks additionally requires a shared room coordinator. Deployment status alone did not verify that WebSocket traffic worked. Keep using real upgrade/command/reconnect checks for the next rollout.

## Verification

`npm test` includes deterministic reconnect/watchdog tests and SQLite-backed lifecycle/migration tests. `npm run test:websocket` plays a complete match using only socket commands, including anonymous session setup, simultaneous votes, per-seat secrets, invalid/stale commands, duplicate IDs, reconnect, rematch, leave/rejoin, host controls, solo AI steps, and unauthorized origins/seats. `npm run test:rooms-api` uses real elapsed time to verify final-disconnect closure and occupied-room survival through socket rotation. Existing HTTP multiplayer suites hold a real socket while running complete games.

Platform reference: [Cloudflare Workers WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/).
