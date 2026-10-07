# Reviewing UI feedback notes

The owner isn't a developer. Notes are short, informal, sometimes misspelled, often in Spanish or another language. Your job is to understand what they meant, change exactly that, and tell them in plain words what you did.

## Reading a note

`node scripts/ui-feedback.mjs pull` prints, per note:

```
## 1. 3c10779c · open · for: desktop · 2026-10-07 15:26
Page: /products/12 — "Product 12" · viewport 1536×730
Comment: put these 3 in one row
Screenshot: .ui-feedback-inbox/3c10779c.png
Elements:
  1. button «Add photos»
     selector: main > section > div.actions > button:nth-of-type(1)
     components: Button < PhotoConfigurator
     source: src/components/photo-configurator.tsx:1530
     box: 143×36 at (520, 93) · layer 1 · position: static
```

- **Screenshot** — always open it. Picked elements are drawn as numbered orange boxes; the owner's own marks (boxes, arrows, pen) are red, yellow or blue. An arrow from an element to an empty area usually means "move it there". A box around a region with no picked element means "this area".
- **Comment** — "this", "esto", "ese elemento" means element 1 (or the only one). Numbers like "#1 and #2" refer to the picked elements' numbers.
- **for:** — the screens the change is for. If a note says `for: desktop`, don't change tablet or mobile.
- **viewport** — the window size when the note was made; tells you which layout they were looking at.
- **components / source** — the fastest way to the code (development builds only). The first component is the innermost; generic ones (`Button`, `Link`, `Card`) are usually library components — the interesting one is the first app-specific name after them.
- **selector / text / attributes** — use them to search when there's no component name: text in quotes, `aria-label`, `data-testid`, distinctive class names. Don't search for the whole selector; nth-of-type steps change easily.
- **layer** — 1 means the topmost element under the pointer. A higher layer means the owner deliberately went down through overlapping elements: often a problem of one thing covering another.
- **styles** — position, z-index, sizes: useful for "it covers", "it hides", "it's too big".
- **Previous reply** — the note was reopened: your previous change didn't do what they wanted. Read the reply and the new comment together.

## Common requests and what they usually mean

| They write | Usually means |
|---|---|
| "remove this", "eliminar" | Hide or delete the element on those screens. If it's an action that matters (a close button, a menu entry), check the action stays reachable another way and mention it. |
| "in one row", "una sola fila" | The picked elements side by side; reduce sizes or labels if they don't fit, keep wrapping as a fallback on narrow widths. |
| "smaller", "más pequeño" | Smaller size and/or padding; keep touch targets ≥ 44 px on mobile. |
| "move it here" + arrow | Change its position in the layout (not with absolute positioning unless the design already does that). |
| "it covers…", "se tapa", "no se ve" | Layering / sticky / fixed / overflow problem; look at z-index, position and the element's container. |
| "same design as X" | Reuse the existing styles/component of X; don't invent new ones. |
| "fixed", "que no se mueva al hacer scroll" | `position: sticky` (inside a scroll area) or `fixed`, with the right offset. |

These are hints, not rules: the screenshot and the picked elements decide.

## When a note isn't clear

Leave it open and ask, instead of guessing:

```
node scripts/ui-feedback.mjs reply <id> "Question: which button should be removed — the X on each photo or the one in the top bar? Pick it with the button and send a new note." --keep-open
```

Typical unclear notes: no picked element and no marks; a comment that contradicts the screenshot; a change for screens that don't show the element. Two notes that conflict: do the newer one and say so in both replies.

## Making the change

- Follow the project's own conventions (styling system, components, file layout). Look at similar code nearby.
- Scope to the screens in `for:`. With Tailwind: `lg:` for desktop only, `md:` (and `lg:` to undo) for tablet only, unprefixed (and `md:` to undo) for mobile only. With CSS: media queries at the project's breakpoints.
- Change one note at a time and keep track of which commit/edit belongs to which note.
- Run what the project uses to check itself (type check, tests, lint, build). If you can open the page in a browser, look at it on the right screen size.
- If a note asks for something that would break behavior (removing the only way to do something), make the safest version and explain it in the reply, or ask.

## The reply

One or two plain sentences in the language of the note, saying what you understood and what you did:

- `Understood: put Add photos, New order and Save in one row on desktop. Done: smaller buttons in a single row above the photos; tablet and mobile unchanged.`
- `Entendí: quitar el botón «…» junto al título en PC. Hecho: ya no aparece en PC; sus opciones pasaron a la fila de arriba.`

Don't paste code or file paths into replies — the owner reads them on the notes page. `reply` also marks the note as resolved; the owner reopens it if it's not right.

## After the review

Tell the user, per note: what you did, and which notes stayed open and why. The change usually needs to reach the site (deploy, or the dev server reloading) before the owner can check it; deploy only if that's the project's normal flow or they ask.
