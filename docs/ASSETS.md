# Official Secret Hitler asset pack

Source game and artwork: Secret Hitler, created by Mike Boxleiter, Tommy Maranges, and Mac Schubert.
Official site: https://www.secrethitler.com/
License declared in the official rules: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
License URL: https://creativecommons.org/licenses/by-nc-sa/4.0/

## Source files

- Official print-and-play PDF: https://www.secrethitler.com/assets/Secret_Hitler_Print_and_Play.pdf
- Official rulebook PDF: https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf
- Additional website illustrations: inline SVGs in https://www.secrethitler.com/ with presentation values from https://www.secrethitler.com/stylesheets/secret.css
- Retrieved 2026-09-09 America/Chicago.

## Changes made

Original artwork was extracted, cropped, rotated, assembled from the supplied printable halves, and exported as PNG and WebP. No artwork was generated or redrawn. The print-and-play source is monochrome. Board edges were cropped just inside the print cutting frame. The transparent logo has only its exterior white background removed; white lettering is preserved. The official website SVGs have their original CSS presentation declarations resolved to attributes so they display independently.

The included `docs/asset-manifest.json` records the exact crop coordinates and source operations. PDF page numbers in the manifest are one-based. All print-and-play crops use the original 3300 x 2550 embedded image with origin at top left. All rulebook crops are in PDF points with origin at top left. PNGs preserve source resolution, and WebP files provide smaller versions for the website.

## Verified rules and powers

Visually verified against official rulebook page 2 and print-and-play pages 11-13. Ordinary Fascists listed below exclude Hitler; there is always exactly one Hitler.

| Players | Liberals | Ordinary Fascists | Hitler |
| ------- | -------: | ----------------: | -----: |
| 5       |        3 |                 1 |      1 |
| 6       |        4 |                 1 |      1 |
| 7       |        4 |                 2 |      1 |
| 8       |        5 |                 2 |      1 |
| 9       |        5 |                 3 |      1 |
| 10      |        6 |                 3 |      1 |

| Players | Fascist 1           | Fascist 2           | Fascist 3        | Fascist 4 | Fascist 5                 | Fascist 6       |
| ------- | ------------------- | ------------------- | ---------------- | --------- | ------------------------- | --------------- |
| 5-6     | None                | None                | Policy peek      | Execution | Execution + veto unlocked | Fascist victory |
| 7-8     | None                | Investigate loyalty | Special election | Execution | Execution + veto unlocked | Fascist victory |
| 9-10    | Investigate loyalty | Investigate loyalty | Special election | Execution | Execution + veto unlocked | Fascist victory |

At 5-6 players Hitler knows the Fascist. At 7-10 players the Fascists know each other and Hitler, but Hitler does not know them. A policy peek reveals the top three tiles to the President and leaves their order unchanged. Investigation reveals party membership, which does not distinguish Hitler from an ordinary Fascist. A special election permits any other player as President, then ordinary rotation resumes from the President who called it. Execution removes a player and ends the game if that player is Hitler. The President must resolve a granted executive power before the next round. Powers are ignored for policies automatically enacted after three failed elections. Five Liberal policies win; six Fascist policies win; Hitler elected Chancellor after at least three Fascist policies also wins for the Fascists. The deck has 6 Liberal and 11 Fascist policies.

## Ready-to-use assets

- `board-liberal`: 3974 x 1255
- `board-fascist-5-6`, `board-fascist-7-8`, `board-fascist-9-10`: 3974 x 1255
- `role-liberal`, `role-fascist`, `role-hitler`: approximately 650 x 950
- `policy-liberal`, `policy-fascist`: approximately 443 x 674
- `ballot-ja`, `ballot-nein`: approximately 940 x 650, upright horizontal lettering
- `logo`, `logo-transparent`: 1308 x 912
- `power-investigate`, `power-special-election`, `power-peek`, `power-execute`: transparent official rulebook icons
- `official-box-art`: 2560 x 1323; official warm coral box illustration, also SVG
- `official-fascist-illustration`: 640 x 936; additional official reptile character, also SVG

Suggested attribution for the recreation: "Based on Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert. Official artwork adapted for this noncommercial online recreation. Licensed CC BY-NC-SA 4.0." Link Secret Hitler to the official site and CC BY-NC-SA 4.0 to the license URL above.
