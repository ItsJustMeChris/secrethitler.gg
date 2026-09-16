# Rules implementation audit

Audited September 11, 2026. Source baseline: `ed287e2c6dc74998d68760019c519817b7d5bf46`.

**September 16 update:** This audit records the baseline above. The requested live-vote display now makes submitted Ja/Nein ballots visible immediately, departing from its simultaneous-reveal behavior. Elections still wait for all living players and use the same strict-majority rule. Current tests check public pending votes and preserve the private role, hand, and note boundaries; the historical results and engine fingerprint below describe the audited baseline.

## Finding

**No core gameplay-rule defect was found in this checkout.** Every mechanical rule in the standard 5–10 player game has an implementation and passing evidence in the matrix below. The audit added independent assertions and mutation checks; it made no changes to the production engine.

This is a bounded verification result, not a formal proof over every reachable state, random seed, network schedule, or human behavior. “All rules are fully correct” without those qualifications would overstate the evidence.

## Authority and scope

The normative sources are the creators' [official rulebook](https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf) and [official print-and-play boards](https://www.secrethitler.com/assets/Secret_Hitler_Print_and_Play.pdf). PDF page numbers below count the cover. The setup table on rulebook page 2 and all three boards on print-and-play pages 11–13 were visually inspected, in addition to reading the rules text. The rulebook's party-membership instruction controls investigations; the older board artwork's “identity card” wording does not authorize revealing Hitler.

Sources: Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert, © Goat, Wolf & Cabbage; licensed CC BY-NC-SA 4.0. This audit paraphrases the rules for implementation verification under the repository's same license.

SHA-256 fingerprints of the exact downloaded sources and audited engine:

| File | SHA-256 |
| --- | --- |
| Official rulebook | `b4bf3d970b433e45d6fa67de4dfc6130f8e4d35a12edbdd92a0a817171581231` |
| Official print-and-play | `b835c7b1365f19448649db99a78b043f30f12a1805b62bf3a4e883562edd6829` |
| `lib/game.ts` (checkout bytes) | `4d20eca1b137ef549844cae3e6e0d7f734439db9a7fa2516ac8dbb92a1f88c85` |

The review covered the state machine, personalized views, HTTP authentication and persistence path, AI decision boundary, and the rule-related client controls and guidance. Runtime integration used the local Worker and D1 at `http://localhost:3001`.

## Rule-to-evidence matrix

R01–R11 refer to named tests in [rules-audit.test.ts](../tests/rules-audit.test.ts). Existing suites are [game.test.ts](../tests/game.test.ts), [fairness.test.ts](../tests/fairness.test.ts), [bots.test.ts](../tests/bots.test.ts), [players.test.ts](../tests/players.test.ts), and [presentation.test.ts](../tests/presentation.test.ts).

| Rule family and source | Implementation in `lib/game.ts` | Passing evidence |
| --- | --- | --- |
| Setup: 5–10 seats; correct role counts; one Hitler; 6 Liberal and 11 Fascist policies; shuffled roles/deck and random first president. Rules pp. 2–3. | `distribution`, `start`, `gameShuffle` | Existing setup tests for all six counts; independent AES/rejection-sampling and receipt-replay tests. |
| Initial knowledge: ordinary Fascists know their team; Hitler knows the Fascist only at 5–6 initial seats; Liberals get no teammates. Rules p. 3. | `viewFor` | R11 checks exact allowed identities for every seat and size; existing roster and secrecy tests. |
| Presidency moves in seating order, skips executed seats, and accepts a previous chancellor as president. Rules pp. 3–5. | `nextLiving`, `nextRound`, `beginNomination` | R02, R08, R09; special-election targets include term-limited seats. |
| Chancellor eligibility uses the last elected government, excludes self/dead seats, and relaxes the former-president restriction with five or fewer survivors. Rules pp. 3–4. | `eligibleChancellors`, `nominate` | R01, R02; rejected elections preserve previous limits; existing presentation eligibility tests. |
| All survivors, including both candidates, cast one sealed ballot; only a strict majority passes; reveal waits for everyone. Rules p. 4. | `vote`, `viewFor` | R02, R10, R11; duplicate-vote test; concurrent HTTP ballots. |
| Failed elections and accepted vetoes advance the tracker; successful elections alone do not reset it; any enactment resets it. Rules pp. 4, 6. | `inactiveGovernment`, `enactPolicy`, `veto-answer` | R02–R04, R07; existing tracker tests. |
| Third inactivity enacts the top policy, suppresses its executive power, clears term limits, and still permits policy victory. Rules p. 4. | `inactiveGovernment`, `enactPolicy` | R04 covers both policy colors, all thresholds and sizes; R07 covers veto-triggered chaos. |
| Draw three, discard one, pass two together in order, choose one to enact, discard the other. Rules p. 4. | `vote`, `discard`, `enact` | R03 enumerates every ordered three-card color hand and every legal choice; R10 rejects invalid indices and actors. |
| Hands/discards remain private; officeholders cannot communicate through table chat during legislation; later public claims may be false. Rules pp. 4–5. | `viewFor`, `chat` | R10 covers all three legislative phases; R11 changes secrets without changing an unauthorized serialized view; HTTP hand isolation and silence checks. |
| Fewer than three draw policies after a legislative session or chaos causes a shuffle with discards, retaining every remaining policy. Rules pp. 4–5. | `replenish`, `enactPolicy`, `veto-answer` | R06 tests zero/one/two/three remaining, both discards, chaos and subsequent peek; R07 tests veto depletion. |
| Three printed executive tracks; power belongs to the sitting president, must be used once, and blocks the next election. Rules p. 5; boards pp. 11–13. | `powerTrack`, `enactPolicy`, `power` | R03 uses literal board expectations, independent of `powerTrack`; R10 and existing mandatory-power tests. |
| Investigation privately reveals party membership, treats Hitler as Fascist, and forbids repeating a target. Rules p. 5. | `power`, `addNote`, `viewFor` | R09, R11; existing roster investigation tests. |
| Special-election president may be term-limited; regular rotation resumes after the caller, including when the selected successor gets two consecutive candidacies. Rules p. 5. | `specialReturn`, `nextRound`, `power` | R08 covers caller/target combinations, failed and successful elections, chaos, caller execution and successor execution. |
| Policy peek reveals the top three privately without changing draw order. Rules p. 5. | `power`, `viewFor` | R06, R11; existing peek test. |
| Execution removes speech, voting and office eligibility; non-Hitler roles remain secret; killing Hitler wins immediately. Rules p. 5. | `power`, `applyAction`, `chat`, `viewFor` | R01, R02, R09, R10 and existing execution/victory tests. |
| Veto unlocks after five Fascist policies; chancellor requests, president consents or refuses; refusal requires enactment; acceptance discards both and preserves term limits unless chaos occurs. Rules p. 6. | `veto`, `veto-answer` | R07; existing veto tests; correct actor and phase enforced by R10. |
| Four wins: fifth Liberal policy, sixth Fascist policy, Hitler executed, or Hitler elected chancellor with at least three Fascist policies. Rules pp. 2, 4–5. | `finish`, `enactPolicy`, `vote`, `power` | R03–R05, R09; nomination, rejection and Hitler presidency cannot falsely trigger his election win; R10 blocks further gameplay after finish. |

## Executed evidence

| Check | Result |
| --- | --- |
| Full automated suite | **72 passed, 0 failed, 0 skipped** |
| Independent eligibility enumeration | **72,651 states** |
| Independent election enumeration | **3,528 elections**, including every ballot pattern for 3–10 survivors across the six starting sizes and zero, one, or two executions |
| Independent legislative enumeration | **1,728 paths**: six sizes × six pre-enactment Fascist counts × eight ordered hands × three discards × two enactments |
| Independent special-election enumeration | **1,210 nonterminal paths**, plus immediate Hitler-execution victories |
| Existing simulations | **600 engine games + 600 AI games**, all six initial counts |
| Deliberately incorrect engine variants | **30/30 detected by assertion failures**, with an unmodified passing control |
| V8 coverage of `lib/game.ts` | **97.58% lines, 97.41% branches, 100% functions** |
| `npm run test:api` | Passed: ten independent sessions, concurrent writes/votes, private views, invalid/replayed/stale moves, session forgery, origin rejection, full game, reconnect, rematch and served assets |
| `npm run test:bots-api` | Passed: two humans/eight AI, complete match, protected/concurrent steps, pause/pacing, reconnect/rematch, and one-human/nine-AI solo entry |
| Type check, lint, production build | Passed |

The enumerations isolate rule inputs in constructed fixtures; some combinations are intentionally broader than naturally reachable histories. They do not exhaust the full state graph. Simulations use fresh randomness, so individual transcripts and coverage percentages can vary. The uncovered engine lines in this run were the impossible-with-valid-state “no living player” guard, AI-settings handling (exercised through the separate HTTP suite), and unknown-action fallback. Coverage alone does not establish correctness.

Mutation checks deliberately change majority rules, reveal timing, eligibility, policy choice, win thresholds, chaos behavior, shuffle boundaries/conservation, power selection, rotation, investigation, execution, vetoes and secret projections. The harness runs isolated temporary copies and requires assertion failures, so a syntax error or missing import cannot count as a detected rule defect. This establishes sensitivity to those 30 changes, including a change to the stated veto/reshuffle interpretation, not every conceivable mistake.

## Invariant reasoning

The implementation supports a small proof sketch in addition to the executed checks:

1. **Policy conservation.** Setup starts with six Liberal and eleven Fascist policies. Drawing/discarding transfers policies between containers. Enactment transfers one from a container to its color's counter. Veto transfers the hand to discards; reshuffling permutes the remaining containers. Therefore each color's total is invariant if each transition preserves its stated preconditions. The tests check these totals after transitions.
2. **No exhausted legislative draw in a valid ongoing game.** Every path back to nomination starts with at least three draw policies, replenishing when required. An ongoing game has at most nine enacted policies, leaving at least eight in circulation. Election failure does not draw a hand; chaos and completed legislation restore the draw precondition before the next round.
3. **Bounded progress, conditional on players completing decisions.** Each completed government either enacts a policy or advances inactivity, which enacts on the third increment. A game cannot survive a tenth policy: keeping both tracks below victory allows at most four Liberal plus five Fascist policies. Thus at most 30 completed governments are needed. Waiting for votes, chat, pauses and disconnected seats can take unbounded wall-clock time.

These arguments explain why the implementation works under its assumptions. They are not machine-checked proofs of the TypeScript, shuffle generator, database, or browser.

## Limits and online interpretations

- The rulebook combines end-of-session replenishment with veto-triggered inactivity without a dedicated worked example of an almost-empty veto deck. The implementation finishes the vetoed session, replenishes if necessary, then resolves inactivity/chaos. R07 tests that interpretation. The rulebook alone does not provide a separate timing example that settles every alternative reading.
- Physical handling, eye-closing, gestures, off-platform speech, screenshot sharing, voluntary role disclosure and whether a human intentionally chose a policy cannot be enforced by this application. Private projections and chat restrictions implement their online equivalents where possible.
- Readiness, bots, chat retention, cosmetic identity, reconnection, rematches and postgame role/receipt disclosure are online features. They were checked where they affect gameplay, but are not themselves original tabletop rules. Departing midgame preserves the seat and can leave the game waiting.
- HTTP tests sampled actual concurrency and complete ten-seat matches; they did not exhaust every worker interleaving or every table size over HTTP. Per-size mechanical coverage is supplied by the engine tests. The integration driver can combine separate seats' authorized responses to steer test scenarios; it is not evidence of a human-equivalent strategy.
- Client rule text and controls were inspected and presentation helpers tested. This audit did not perform browser interaction/accessibility testing, verify a public deployment, or publish a new version.
- Shuffle receipts verify a commitment and replay, under the cryptographic assumptions described in the existing fairness documentation. They do not prove honest seed selection, card delivery, every game transition, or absence of collusion.

## Reproduce

With the repository's installed dependencies and Node 22.13+:

```sh
npm test
npm run test:rules
npm run test:rules:mutations
npm run typecheck
npm run lint
npm run build
```

The independent audit is included in `npm test`. For the coverage result:

```sh
node --experimental-strip-types --experimental-test-coverage --test-coverage-include="**/lib/game.ts" --test tests/game.test.ts tests/rules-audit.test.ts tests/bots.test.ts tests/fairness.test.ts tests/players.test.ts tests/presentation.test.ts
```

Start the local app with its documented database setup, then run `npm run test:api` and `npm run test:bots-api`. Their default target is `http://localhost:3000`; set `TEST_URL` if the local server uses another port. Integration tests create their own rooms.
