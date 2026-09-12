# Secret Hitler asset sources

Source game and artwork: Secret Hitler, created by Mike Boxleiter, Tommy Maranges, and Mac Schubert.
Official site: https://www.secrethitler.com/
License declared in the official rules: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
License URL: https://creativecommons.org/licenses/by-nc-sa/4.0/

## Full-color game assets

Boards, policy tiles, role cards, and ballots come from the Git repository behind [secret-hitler.online](https://secret-hitler.online): [ShrimpCryptid/Secret-Hitler-Online](https://github.com/ShrimpCryptid/Secret-Hitler-Online). Original game and artwork © 2016–2020 Goat, Wolf & Cabbage; adapted artwork by ShrimpCryptid, under [CC BY-NC-SA 4.0](https://github.com/ShrimpCryptid/Secret-Hitler-Online/blob/6b210bae0ae3c3aeb67391dcfa328135a13fb345/LICENSE).

- Pinned source commit: `6b210bae0ae3c3aeb67391dcfa328135a13fb345` on `development`.
- Source directory: `frontend/src/assets/`.
- Retrieved 2026-09-10.
- Copied PNGs byte-for-byte; no gamma adjustment, recoloring, crop, or recompression.
- Upstream adaptations include rounded corners, depth, and shadows. These are adapted assets, not untouched exports from the original board game.
- `role-liberal-1.png` → `role-liberal.png`; `role-fascist-1.png` → `role-fascist.png`; `vote-yes.png` → `ballot-ja.png`; `vote-no.png` → `ballot-nein.png`. Other selected names are unchanged.
- Boards at every screen size use the matching small `board-policy-*` tiles at 10% of board width and 30% from the top. Liberal placement starts at 18.2%, spaced 13.54%; fascist placement starts at 11%, spaced 13.6%, matching the upstream board positions.
- A shared SVG viewBox positions the existing board and tile PNGs together, scaling both proportionally to the available space. The SVG is a layout container for existing artwork. Hands use the larger `policy-*` cards. All artwork retains its intrinsic aspect ratio and transparent borders.
- The asset URL revision refreshes cached print-and-play exports on existing devices.

The included `docs/asset-manifest.json` records each copied file's exact source path, commit, dimensions, and SHA-256 checksum.

## Original player portraits

The 30 selectable player pictures in `public/assets/portraits/cartoon-avatar-*.png` were generated specifically for this app using the built-in image-generation tool, completed 2026-09-12 UTC. The user's photograph of printed Secret Hitler role cards supplied the style reference: playful cut-paper caricatures, exaggerated heads and eyes, and a limited charcoal, cream, olive and ochre palette. All characters are original. The set contains 10 men (IDs 01–10), 10 women (11–20), and 10 animal characters (21–30). Portraits are cosmetic and carry no role information.

Every final image has a genuine alpha channel and transparent surroundings. The generator returned opaque backgrounds; with the user's explicit authorization, local background extraction removed magenta mattes and exterior white backgrounds, preserving enclosed light details and cleaning antialiased edges. The complete originals were proportionally resized to 216 × 216 and padded by 20 pixels on all sides, producing 256 × 256 PNGs for the app. Every silhouette and transparent margin was checked, and all 30 were inspected on light and dark surfaces. No character cropping, global color filters, or gamma adjustment were applied. UI images use `object-fit: contain`. Selection borders and seat surfaces belong to the interface, not the PNGs.

The [generation and background-edit prompts](cartoon-avatar-prompts.json) and [asset manifest](asset-manifest.json) document every final portrait. The picker groups the pictures into three compact tabs; automatic AI selections use all three groups before roles are assigned. Existing saved numeric choices remain valid and display the new artwork. New filenames refresh cached avatars. The superseded `illustrated-portrait-*` files remain available for cached clients, and `illustrated-portrait-prompts.json` and `original-portrait-prompts.json` retain the historical generation records.

## Interface typography and palette

The interface takes its apricot `#FBB969`, charcoal `#434343`, coral `#F0654B`, paper surfaces, typewriter text, and bold geometric headings from the [official website](https://www.secrethitler.com/) and its [stylesheet](https://www.secrethitler.com/stylesheets/secret.css), checked 2026-09-11. These cues are adapted to the existing compact game layout; the website's layout and stylesheet are not copied.

The official site specifies Futura PT for headings and Courier Prime for text, delivered through Adobe Typekit. This app self-hosts Courier Prime and the open-source geometric typeface Jost as its Futura-style heading and control face. It does not reuse the official site's Adobe font kit or redistribute Futura PT.

- Courier Prime: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/courierprime), regular and bold, SIL Open Font License 1.1. License bundled at `public/fonts/Courier-Prime-OFL.txt`.
- Jost: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/jost), variable upright font, SIL Open Font License 1.1. License bundled at `public/fonts/Jost-OFL.txt`.
- Fonts load locally as WOFF2 with `font-display: swap`; controls use the compact geometric face, and body copy uses Courier Prime. The [font manifest](font-manifest.json) records the seven subset sources and file sizes (about 115 KiB total; only required subsets load). The primary Latin heading and body faces are preloaded. Assets retain their original colors.

## Supporting official sources

- Official print-and-play PDF: https://www.secrethitler.com/assets/Secret_Hitler_Print_and_Play.pdf
- Official rulebook PDF: https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf
- Additional website illustrations: inline SVGs in https://www.secrethitler.com/ with presentation values from https://www.secrethitler.com/stylesheets/secret.css
- Retrieved 2026-09-09 America/Chicago.

## Supporting asset preparation

The initial version used monochrome print-and-play crops for cards and boards. Those have been replaced by the full-color assets above, and the CSS color filters have been removed. Those game assets were not generated or redrawn. The retained transparent logo has only its exterior white background removed; white lettering is preserved. Power icons were extracted from the official rules. The official website SVGs have their original CSS presentation declarations resolved to attributes so they display independently.

The manifest retains extraction details for these supporting assets. PDF page numbers are one-based, and rulebook crops are in PDF points with origin at top left. The website uses PNGs to preserve source quality and receive the correct image MIME type from its hosting layer. Monochrome power icons are tinted only for contrast against the dark mobile track.

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

- `board-liberal`: 1683 x 650
- `board-fascist-5-6`, `board-fascist-7-8`, `board-fascist-9-10`: 1683 x 650
- `board-policy-liberal`, `board-policy-fascist`: 174 x 240
- `role-liberal`, `role-hitler`: 500 x 712; `role-fascist`: 500 x 713
- `policy-liberal`, `policy-fascist`: 576 x 772
- `ballot-ja`, `ballot-nein`: 730 x 539
- `logo`, `logo-transparent`: 1308 x 912
- `power-investigate`, `power-special-election`, `power-peek`, `power-execute`: transparent official rulebook icons
- `official-box-art`: 2560 x 1323; official warm coral box illustration, also SVG
- `official-fascist-illustration`: 640 x 936; additional official reptile character, also SVG

Attribution appears in the app's Fair play & credits dialog, the README, and LICENSE.md, with source and license links. This noncommercial adaptation is not affiliated with or endorsed by Goat, Wolf & Cabbage or ShrimpCryptid.
