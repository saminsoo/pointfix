---
name: ui-feedback
description: Point-and-click visual feedback for web projects, reviewed and applied by Claude. Installs a floating button that lets the site owner pick page elements layer by layer (like the browser inspector), capture and mark the screen, choose desktop / tablet / mobile and write what to change; then reads those notes, makes the UI changes in the code and replies on each note. Use it whenever the user wants to install, set up or configure UI feedback, a feedback button, visual annotations or "point out changes on my site", and whenever they ask to review, read, check or apply the feedback, notes or observations ("review the UI feedback", "check the notes", "revisa las observaciones", "aplica los cambios que señalé"), even if they don't name the skill.
license: MIT
---

# UI feedback

The site owner points at things on their site and says what to change; you read those notes and change the code. There are two jobs — work out which one the user wants:

- **Install** the button in a project → [Install](#install).
- **Review** the notes left with it → [Review the notes](#review-the-notes). This is the everyday job once it's installed.

What this skill ships (all in `${CLAUDE_SKILL_DIR}`):

| File | What it is |
|---|---|
| `templates/ui-feedback-widget.js` | The button, layer-by-layer picker, capture and marking window. Plain JS, no dependencies, renders in a Shadow DOM so the site's CSS can't break it. English and Spanish. |
| `templates/ui-feedback-server.js` | The endpoint: one handler on standard `Request`/`Response` (Next.js, Remix, SvelteKit, Astro, Hono…), plus `toNodeMiddleware` for Express / Vite / Node and an in-memory store. No dependencies. |
| `templates/ui-feedback-file-store.js` | Keeps notes as files in `.ui-feedback/` (Node). |
| `templates/nextjs/` | `route.js` and `ui-feedback-launcher.jsx` for the Next.js App Router. |
| `scripts/ui-feedback.mjs` | CLI to read notes and answer them: `pull`, `show`, `reply`, `resolve`, `reopen`, `key`. |
| `references/install.md` | Step-by-step for each stack, deployed sites, custom stores. |
| `references/review.md` | How to read a note and turn it into a change (read it when reviewing). |
| `references/note-format.md` | Every field of a note. |

The templates are tested (picker, capture, escaping, auth, validation). Copy them as they are; don't rewrite them for style — if something must change for the project, change as little as possible.

## Install

1. **Look at the project first.** Framework and router, TypeScript or JavaScript, where shared code lives (`lib/`, `src/lib/`), the import alias (`@/`), the package manager (lockfile), the CSS breakpoints (Tailwind `md`/`lg` = 768/1024 is the default the widget uses), whether there is a server (SSR or API routes) and where it is deployed. Then read [references/install.md](references/install.md) for that stack.
2. **Copy the three templates** into the project, e.g. `lib/ui-feedback/`, and `scripts/ui-feedback.mjs` into `scripts/` — the CLI is useful to anyone on the project, with or without this skill.
3. **Wire the endpoint and the launcher** for the stack (Next.js: `templates/nextjs/route.js` → `app/api/ui-feedback/route.(js|ts)`, `ui-feedback-launcher.jsx` → a component rendered once in the root layout). Use `.ts`/`.tsx` names in TypeScript projects; the templates are plain JS with JSDoc and import fine.
4. **Install `html2canvas-pro`** with the project's package manager and pass `loadHtml2Canvas: () => import("html2canvas-pro")`. Without it the widget loads it from a CDN, which a strict Content-Security-Policy blocks.
5. **Breakpoints:** if the project's tablet/desktop widths differ from 768/1024, pass `breakpoints: { tablet, desktop }`. The note's "screens" are only as useful as this match.
6. **.gitignore:** add `.ui-feedback/` and `.ui-feedback-inbox/`. Screenshots of a site in progress don't belong in git.
7. **Deployed site (staging)?** It needs a secret: `node scripts/ui-feedback.mjs key` prints one. It goes in the server's environment as `UI_FEEDBACK_KEY`, and in the owner's local `.env.local` together with `UI_FEEDBACK_URL=https://<site>/api/ui-feedback` (for the CLI). The owner opens `https://<site>/api/ui-feedback?enable=<key>` once per browser. Never commit the key. Without a key the endpoint is off in production — that's the safe default, not a bug.
8. **Verify it for real.** Start the dev server, open a page: a round button appears in a bottom corner (left by default, right with the Next.js launcher). Make a test note (pick an element, capture, comment, send) and run `node scripts/ui-feedback.mjs pull` — the note should be listed. If you can drive a browser, do it yourself; otherwise ask the user to try and tell you what they see. Delete the test note afterwards (`?view` page or remove the files).
9. **Tell the user how to use it**, in their language and in plain words: log in / open the activation link if deployed → round button → click an element, move through its layers, "Pick this" → "Capture & comment" → mark, choose screens, write what to change → send → then ask you "review the UI feedback". Mention the notes page `<endpoint>?view`, where they'll also read your replies.

Customers never see the button: the endpoint only answers `{ visible: true }` in development, to a browser with the activation cookie, or when the project's own `isAllowed` check passes (e.g. an admin session) — see install.md.

## Review the notes

1. **Pull the open notes:** `node scripts/ui-feedback.mjs pull` from the project root (or `node "${CLAUDE_SKILL_DIR}/scripts/ui-feedback.mjs" pull` if the project has no copy). With `UI_FEEDBACK_URL` + `UI_FEEDBACK_KEY` (env or `.env.local`) it reads the deployed site and downloads screenshots to `.ui-feedback-inbox/`; otherwise it reads `.ui-feedback/` written by the local dev server.
2. **Read every note completely before touching code, oldest first.** Open the screenshot with the Read tool every time — drawn boxes and arrows often carry half the meaning, and picked elements are numbered on it. Then the comment, the screens (`for:`), and each element's components, source, selector, text and box.
3. **Find the code.** Components and source file (dev builds of React, Vue, Svelte, Angular) point straight at it; otherwise search for the element's text, `aria-label`, `data-testid` or distinctive class names, and use the selector to confirm the structure. [references/review.md](references/review.md) has the details and the usual traps.
4. **Respect the screens.** "desktop" only means: change it from the desktop breakpoint up and leave tablet and mobile as they are (e.g. Tailwind `lg:` variants, `@media (min-width: 1024px)`). Check the project's real breakpoints.
5. **Don't guess on unclear notes.** If there's no picked element and no mark, or the comment can't be tied to anything on the page, leave it open and ask: `reply <id> "Question: …" --keep-open`. One clear question beats a wrong change.
6. **Make the change** the way the project does things, scoped to what was asked. Run the checks the project uses (types, tests, lint, build). Look at the result in a browser if you can.
7. **Answer on the note and resolve it:** `node scripts/ui-feedback.mjs reply <id> "Understood: … Done: …"` — in the language of the note, one or two plain sentences: what you understood, what you changed and for which screens. The owner reads it next to the note.
8. **Report to the user:** each note → what you did; what stayed open and why. Don't deploy unless that's the project's normal flow or the user asks — the change usually has to reach the site before the owner can check it.
