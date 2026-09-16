# Secret Hitler — The Table

A noncommercial, unofficial online adaptation of the original 5–10 player game. One responsive web app supports desktop, tablet, and phone players at the same table.

## Play

Create a table, share its eight-character code or invite URL, and have every human player mark ready. The host can add AI individually or fill all remaining seats, up to 10 total players in any human/AI mix. AI can be removed from the waiting lobby. Adding AI resets human readiness so everyone acknowledges the table before the deal. Each human uses a separate browser/device. The same browser cookie restores a seat after refresh or disconnection. No spectator roles are enabled. Submitted votes are public immediately, a departure from simultaneous ballot reveal.

Includes the three original power tracks, exact roles and 17-policy deck, live public votes, term limits based on surviving players, election chaos, private legislation, vetoes, investigation, policy peek, special-election rotation, execution, and all four win conditions. Table text chat enforces the government’s legislative silence and eliminated players’ silence. A rematch returns everyone to the lobby with new readiness and fresh roles.

The game uses the official website's apricot, paper, and charcoal visual cues with Courier Prime text, geometric Jost headings, familiar Secret Hitler boards, ballots, and role cards. Original transparent illustrated portraits stay in the informational assembly beside the boards on desktop and above them on phones. The two policy boards scale together without cropping. Your seat, invites, fair play, and leaving remain available in the room toolbar. Short screens and enlarged text can scroll without clipping controls.

All turn decisions happen in the “On the floor” area below the boards. Player portraits are selectable there for nominations, investigations, executions, and special elections, followed by an inline confirmation. Policy selection, confirmation, and private policy-peek results stay on the floor. A loyalty investigation automatically opens a private dossier-style popup with the target's avatar and party membership, never their secret role. The result hides when the window loses focus and returns until dismissed; it can be reopened from the floor or the president's secret dossier. Newly received private notes also surface after a recovered response or WebSocket update. Choices use only the server's personal game view; unavailable candidates are explained, and selections reset with their turn context. The assembly has no action buttons. Hosts remove waiting players through “Manage players” in the lobby controls.

Legislation names the president passing the policies and the chancellor receiving them. Each submitted Ja/Nein vote appears above its player's portrait for everyone to see and stays until the election finishes. Completed elections keep those speech bubbles for four seconds, clearing sooner when a policy is enacted or the next election begins. A round-labeled government/tally summary and expandable voter list remain on the floor. Enacted policies identify the chancellor and president in a public event record that survives reconnection, briefly highlight the new board tile, and show an enactment bubble. Chaos policies are explicitly attributed to the election tracker. Event animations never gate actions and respect reduced-motion preferences; no hidden hand is used for these displays.

Chat and the game log stay open in a sidebar on desktop windows at least 1280px wide. Smaller screens use a bottom-left popup; drafts and the selected tab survive resizing. Unread messages remain visible when reading the game log. Temporary notices dismiss after eight seconds, pausing while hovered or focused. Settings group the learning coach, AI pacing, optional sound cues, and an animation toggle. Fullscreen is available when the browser supports it. The coach also has a compact expandable hint next to the current decision. Brief card-deal, policy-placement, roster, and role-reveal transitions use only permitted game views and never delay server actions. System reduced-motion preferences and the manual toggle disable motion, including dialogs. Audio is off until explicitly enabled and plays no cues in background tabs.

Choose one of 30 original transparent cartoon avatars when creating, joining, or starting a solo table: 10 men, 10 women, and 10 animal characters, organized into category tabs. They were created for this app using AI image generation, inspired by the original game's printed character art. The browser remembers the selection. Players can change their own picture in the waiting lobby; it stays fixed during the match and survives reconnection and rematches. AI choose unused pictures before roles are assigned. These cosmetic pictures are independent of role, party, and shuffle randomness.

Players can leave at any phase. Lobby and finished seats are freed; live seats remain reserved to preserve the original rules, so the match may wait for an absent player's turn. Rejoining the same room with the same browser restores that seat. Hosting passes to another present human. Rematches remove departed seats, return to the lobby, and allow friends or AI to fill up to 10 seats. Your role and permitted teammates are labeled directly on their roster cards using the server's role/table-size rules; Hitler sees the Fascist only in 5–6 player games. Private investigations add party membership labels without identifying Hitler. Everyone's exact role is revealed after the match.

President seats use gold and crown markers; chancellor seats use purple and flag markers. The voting panel repeats these colors with explicit office/name labels. “You” is a neutral identity label. Every new deal or restored active match opens the seated player's secret dossier, including multiplayer and rematches. The opening reveal waits for dismissal; switching away hides it and returning brings it back until acknowledged. Later manual peeks still hide on blur or after 30 seconds.

## Verifiable shuffle receipts

Each new lobby publishes a SHA-256 commitment to a fresh 256-bit server seed. The seed stays private through the match; AES-256-CTR generates a deterministic random stream and rejection sampling feeds Fisher–Yates for roles, policies, the first president, and reshuffles. At game end, the browser can replay the recorded shuffles against its saved commitment and download a JSON receipt. The previous completed receipt survives a rematch, including for clients that missed the brief finished phase.

The Fair play panel includes the probability derivation and links to NIST and W3C references. The check verifies seed commitment and shuffle replay, not honest seed selection, actual card delivery, every rule transition, or absence of player collusion. Solo players and late arrivals first observe the commitment after the deal. Older active games keep their existing random process and gain receipts in the next lobby. Tests cover independent AES output, secret isolation, tamper rejection, all player counts, and receipt renewal.

## AI opponents and learning

**Play solo** is a shortcut that deals a normal 5–10 seat game with one human and the remaining seats filled by AI. AI are also available in every ordinary friend lobby. Roles, deck composition, executive powers and win conditions are unchanged. Seating changes happen before the deal; AI never replace a live human midgame.

Computer players use role-aware strategy and their own permitted information: public policy/vote history, their role and allowed teammates, their own hand, and their own investigation/peek notes. Their strategy favors their team's victory while sometimes playing helpful policies for credibility. They nominate, cast public votes, legislate, veto, use every executive power, and make public claims that can be bluffs. They are heuristic game AI, not an external generative chat service; no API key or paid model is needed.

The 300 authored dialogue lines cover nominations, approval, opposition, policy results, danger, investigations, executions, and table discussion. Basic question topics trigger replies. All lines are available to every role, so recognizing an exact phrase cannot identify a role. Recent lines are avoided. Claims about private hands/results are generated only from the speaker's own observations and are explicitly presented as claims. Government and execution silence still apply.

**Coach** explains the current decision using only your permitted view and is optional on every table. **Read AI aloud** uses available browser voices when enabled; at fast pace it finishes the current sentence and may skip intervening lines. Text dialogue remains available on all devices. Hosts can pause/resume AI, select normal/fast pace, or advance one AI step while paused. Human turns remain usable. AI activity pauses when nobody has the table open and resumes on reconnect; each due tick commits at most one AI action or chat step. Eliminated humans may watch the AI finish.

## Local development

Requires Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run db:local
npm run dev
```

Open http://localhost:3000 . The Vite Cloudflare worker and Wrangler migration command share `.wrangler/state/v3/d1`. No account secrets are needed locally. Bind the D1 database as `DB` when hosting. Sites builds package the generated Drizzle migrations automatically.

```sh
npm test                 # Rules, secrecy boundaries, 600 rules + 600 AI games
npm run test:rules       # Independent rulebook oracles and exhaustive bounded cases
npm run test:rules:mutations # Check detection of 30 deliberately altered rule variants
npm run test:websocket   # Socket-only match, room entry, controls, recovery and origin protection
npm run test:rooms-api   # Room closure after last disconnect (takes about 65 seconds)
npm run test:api         # Real local HTTP/D1 multiplayer tests; dev server must be running
npm run test:bots-api    # Mixed human/AI game, solo, capacity, pacing and concurrent steps
npm run typecheck
npm run lint
npm run build
npm audit
```

The integration suites create their own test rooms. They exercise 10 independent human cookies and mixed tables, concurrent writes and ballots, session forgery, cross-origin rejection, stale/repeated actions, illegal actions, role and hand isolation, entire games, reconnect, and rematch. Set `TEST_URL` to exercise a hosted deployment. Tests add no production backdoors or special rules.

The [rules audit](docs/RULES-AUDIT.md) maps the official rulebook and printed boards to implementation and executable evidence. It records 72 passing tests, bounded exhaustive cases, 30 detected rule mutations, integration results, and the limits of the correctness claim.

## Architecture and fair play

- The server is the only authority. `lib/game.ts` is the rules state machine; `lib/server.ts` authenticates socket commands and HTTP requests and persists state in D1.
- Client payloads contain move intentions, never roles, policy values, results, RNG seeds, or player identities used for authentication.
- `viewFor` explicitly selects public fields and the requesting player’s allowed secrets. No complete game state is embedded in HTML or client storage.
- A cryptographically random 256-bit token lives in an HttpOnly, SameSite=Strict cookie (Secure over HTTPS). Only its SHA-256 hash is stored server-side. Public player IDs cannot authenticate requests.
- Each move commits through a conditional database update by revision, retrying contention. Request IDs suppress duplicate actions. Phase and monotonically advancing round checks reject stale moves.
- AI wake requests require an authenticated human seat and the same Origin/body validation as moves. The server chooses the bot and action; clients cannot supply either. Pace deadlines and actions commit together by revision, preventing multiple browsers from accelerating AI. Manual steps additionally require the host, paused AI, and the expected revision. No-op ticks do not write or extend room lifetime. Private bot memory is omitted from all projections.
- Shuffle uses the platform CSPRNG and unbiased rejection sampling. The initial president is uniformly random.
- Live updates use authenticated same-origin WebSockets. The browser receives personalized snapshots, checks heartbeats, and reconnects/resyncs after interrupted connections, tab restoration, and network recovery. Room entry, moves, chat, host controls, leave and rematch also use acknowledged socket commands. Interrupted commands release the controls and are never automatically replayed; the HTTP API remains for compatibility. The existing Sites/D1 hosting has no room coordinator binding, so each server stream checks the durable room revision every 750 ms; this is not an instantaneous cross-worker broadcast. See [real-time transport](docs/REALTIME.md).
- Request bodies are capped at 4 KiB. Origin checks, text validation, rate limits, security headers, no-store responses, and escaped React text protect the request surface. Rate limits are persisted across worker instances.
- Rooms close 60 seconds after their last socket disconnects. Lost close events are covered by 45-second connection leases, followed by the same grace period. New rooms have 60 seconds to establish their first socket. Closed rooms cannot be revived by a reconnect, HTTP read, or move; expired rows are removed on access/creation. Sessions still expire after 7 days without use. No IP address is stored in plaintext in rate-limit records.

### Limits

Anti-cheat protects server authority and secret distribution. It cannot stop screenshot sharing, off-platform collusion, a person using multiple browsers, or an operator with database access. Anonymous seats are not verified human identities. Losing the cookie loses that seat. While anyone remains connected, a disconnected player must return to continue their turn; the host cannot override a vote, replace a live-game player, or inspect their role. There is no built-in voice chat or public matchmaking.

## Deployment

`npm run build` produces a Cloudflare Worker in `dist/server` plus static assets. This checkout is registered with Sites; `.openai/hosting.json` contains the project ID and logical D1 binding. Deploy the exact built source and migrations through Sites. The Site’s outer access policy must admit friends before they can use room invites; a room code does not bypass private Site access.

The `0001_websocket_rooms` migration intentionally closes all pre-WebSocket rooms while preserving session cookies. Apply it together with this version; active games cannot resume across that migration.

Production source contains no test backdoors or debug role endpoints. `wrangler.local.jsonc` is only for local migrations. Local SQLite state, environment files, build output, and temporary audit artifacts are excluded from version control.

## Attribution

Original game and artwork: Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert, © Goat, Wolf & Cabbage, [secrethitler.com](https://www.secrethitler.com/). The original release also credits Max Temkin. The full-color board, policy, role, and ballot PNGs are adapted artwork from [Secret Hitler Online by ShrimpCryptid](https://github.com/ShrimpCryptid/Secret-Hitler-Online), copied without cropping or recoloring. The adapted assets and this implementation are licensed under [CC BY-NC-SA 4.0](LICENSE.md). See [asset sources](docs/ASSETS.md) for the pinned source commit and file checksums. This project is unaffiliated with the original creators or ShrimpCryptid.
