# Security design and boundaries

The rules engine treats every client request as untrusted. Roles, deck order and hands are kept in server-only D1 state. Public player identifiers are never accepted as authentication; the session cookie determines the actor. Each response is an explicit per-seat projection. A participant can see only information permitted by the original rules.

Every action validates membership, phase, actor eligibility, and action parameters before a revision-conditional SQL write. Concurrent actions retry against fresh state. A request ID is scoped to the authenticated seat; already-processed IDs cannot replay a move. Round/phase stamps stop delayed requests from applying to later turns. Votes stay private until the final living player votes.

The application rejects cross-origin mutations, oversized/invalid JSON and invalid display/chat text, and applies D1-backed request and chat rate limits. Cookies use 256 bits of entropy, HttpOnly, SameSite=Strict and Secure on HTTPS. The database stores their SHA-256 hashes, not raw bearer credentials. Responses with player information use `Cache-Control: no-store, private`. Client storage contains only the display name and room code. The application does not log game state or session tokens.

The standard third-party framework runtime is included in dependency audits. The generated component catalog is excluded from project lint rather than edited; the used primitives retain their upstream implementations. Images are already optimized WebP, so Next image-transform lint is intentionally disabled. The deprecated esbuild dependency of the schema generation tool and local image-processing library are patched via explicit dependency overrides.

## Limits

This protects against modified clients, secret-state inspection by other players, unauthorized moves, duplicate/replayed actions, and lost updates under contention. It does not establish a unique human identity. One browser profile can occupy one seat in each room, but alternate browsers/devices are possible. The host cannot inspect other players' secrets, but a trusted server operator with database access can. No cryptographic fairness proof to distrust the operator is claimed.

Out-of-band coordination, screenshots, voice signals, deliberate disconnection, and participants opening multiple profiles cannot be reliably prevented by this implementation. There is no intrusive device fingerprinting, identity verification, or invented "cheat detection score." Private-room invites and trusted groups are the intended audience.

## Verification

`npm test` covers original rules, legal actions, view secrecy and 600 randomized full games with conservation of all 17 policy cards. `npm run test:api` runs against a real local Worker/D1 database and checks ten isolated cookies, concurrency, forged sessions, origin rejection, replay/stale moves, secret hand visibility, complete play, reconnection, and rematch. Neither suite adds a production endpoint or changes game rules.
