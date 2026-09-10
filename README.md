# Secret Hitler — The Table

A noncommercial, unofficial online adaptation of the original 5–10 player game. One responsive web app supports desktop, tablet, and phone players at the same table.

## Play

Create a table, share its eight-character code or invite URL, and have every player mark ready. The host deals the roles. Each player uses a separate browser/device. The same browser cookie restores a seat after refresh or disconnection. No spectator roles or house rules are enabled.

Includes the three original power tracks, exact roles and 17-policy deck, simultaneous ballot reveal, term limits based on surviving players, election chaos, private legislation, vetoes, investigation, policy peek, special-election rotation, execution, and all four win conditions. Table text chat enforces the government’s legislative silence and eliminated players’ silence. A rematch returns everyone to the lobby with new readiness and fresh roles.

On phones, Table / Players / Chat & role navigation separates the working areas, policy slots replace tiny printed-board text, and current actions appear before the tracks. Inputs avoid iOS focus zoom, touch controls have expanded targets, dialogs scroll within the viewport, and bottom navigation accounts for safe-area insets. This is a mobile web app, not a native app-store binary.

## Local development

Requires Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run db:local
npm run dev
```

Open http://localhost:3000 . The Vite Cloudflare worker and Wrangler migration command share `.wrangler/state/v3/d1`. No account secrets are needed locally. Bind the D1 database as `DB` when hosting. Sites builds package the generated Drizzle migrations automatically.

```sh
npm test                 # Rules, secrecy boundaries, 600 complete game simulations
npm run test:api         # Real local HTTP/D1 multiplayer tests; dev server must be running
npm run typecheck
npm run lint
npm run build
npm audit
```

The integration suite creates its own test room. It exercises 10 independent cookies, concurrent writes and ballots, session forgery, cross-origin rejection, stale/repeated actions, illegal actions, role and hand isolation, an entire game, reconnect, and rematch. Game simulations do not change production rules or provide bots to real games.

## Architecture and fair play

- The server is the only authority. `lib/game.ts` is the rules state machine; `lib/server.ts` authenticates HTTP requests and persists state in D1.
- Client payloads contain move intentions, never roles, policy values, results, RNG seeds, or player identities used for authentication.
- `viewFor` explicitly selects public fields and the requesting player’s allowed secrets. No complete game state is embedded in HTML or client storage.
- A cryptographically random 256-bit token lives in an HttpOnly, SameSite=Strict cookie (Secure over HTTPS). Only its SHA-256 hash is stored server-side. Public player IDs cannot authenticate requests.
- Each move commits through a conditional database update by revision, retrying contention. Request IDs suppress duplicate actions. Phase and monotonically advancing round checks reject stale moves.
- Shuffle uses the platform CSPRNG and unbiased rejection sampling. The initial president is uniformly random.
- Room/session state survives worker restarts and disconnects. Refresh/polling fetches a personalized view roughly every 1.5 seconds, with no background-tab polling. Presence expires after 45 seconds; game actions wait for players without imposing unrequested turn timers.
- Request bodies are capped at 4 KiB. Origin checks, text validation, rate limits, security headers, no-store responses, and escaped React text protect the request surface. Rate limits are persisted across worker instances.
- Room state expires after 7 days without a game action; sessions expire after 7 days without use. Expired rows are cleaned during table creation. No IP address is stored in plaintext in rate-limit records.

### Limits

Anti-cheat protects server authority and secret distribution. It cannot stop screenshot sharing, off-platform collusion, a person using multiple browsers, or an operator with database access. Anonymous seats are not verified human identities. Losing the cookie loses that seat. A disconnected player must return to continue their turn; the host cannot override a vote, replace a live-game player, or inspect their role. There is no built-in voice chat or public matchmaking.

## Deployment

`npm run build` produces a Cloudflare Worker in `dist/server` plus static assets. This checkout is registered with Sites; `.openai/hosting.json` contains the project ID and logical D1 binding. Deploy the exact built source and migrations through Sites. The Site’s outer access policy must admit friends before they can use room invites; a room code does not bypass private Site access.

Production source contains no test backdoors or debug role endpoints. `wrangler.local.jsonc` is only for local migrations. Local SQLite state, environment files, build output, and temporary audit artifacts are excluded from version control.

## Attribution

Original game and artwork: Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert, [secrethitler.com](https://www.secrethitler.com/). The original release also credits Max Temkin. Adapted official assets and this implementation are licensed under [CC BY-NC-SA 4.0](LICENSE.md). See [asset sources](docs/ASSETS.md). This project is unaffiliated with the original creators.
