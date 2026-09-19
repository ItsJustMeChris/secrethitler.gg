# Cartoony eliminated-player portraits

Thirty matching variants were generated using the built-in image-generation tool, with each original `public/assets/portraits/cartoon-avatar-01.png` through `cartoon-avatar-30.png` supplied as its own edit target. Originals are preserved.

Final assets: `public/assets/portraits/cartoon-avatar-01-dead.png` through `cartoon-avatar-30-dead.png`. Each is a transparent PNG. Names, outfits, colors, and character identities match the living catalog; X eyes and a goofy slack expression indicate public elimination, never role or party.

The player card, Your seat, player selections, investigation portrait, and elimination popup select the variant from the server-provided `alive` flag. Rematches restore the living portrait without changing the saved portrait ID.

## Prompt used for each edit

Use case: identity-preserve.
Edit target: the attached game character portrait.
Create this exact character's comically dead / knocked-out variant for a board-game player card. Replace both eyes with bold dark cartoon X marks (inside existing glasses if worn), give the mouth a small goofy slack expression with a tiny tongue peeking out, and a slightly tilted/slumped head. Playful Saturday-morning cartoon, absolutely no gore, blood, wounds, weapons, or realistic injury.
Preserve this specific character's recognizable face shape, skin/fur color, hair, hat, glasses, clothing, accessories, original flat geometric printed-ink illustration style and muted palette. Keep the same bust composition, original proportions and scale within the square canvas. No other characters, props, halos, text, labels, badges, borders, or drop shadows.
Genuinely transparent background with clean alpha edges, including empty space around the bust. One centered character only. Output a square transparent PNG suitable for displaying at 256px.
