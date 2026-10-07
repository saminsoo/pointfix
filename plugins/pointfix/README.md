# PointFix

Point at things on your site and say what to change. Claude Code applies it and answers on each note.

PointFix adds a floating button to your web project that only you can see. You click an element, move through its layers like in the browser inspector, mark a screenshot, choose desktop, tablet or mobile, and write what should change. Then you ask Claude Code to **"review the PointFix notes"** (or «revisa las observaciones»): Claude reads every note with its screenshot, finds the code, makes the change for the screens you chose, and replies on the note with what it understood and what it did.

Full documentation, screenshots and a demo: https://github.com/saminsoo/pointfix

## What the skill does

The plugin contains one skill, `pointfix`, with two jobs:

- **Install**: when you ask for it, Claude copies three source files from the skill into your project (the widget, the endpoint and a file store), copies the CLI to `scripts/pointfix.mjs`, adds an API route and a launcher component, installs the `html2canvas-pro` package with your package manager, and adds `.pointfix/` and `.pointfix-inbox/` to `.gitignore`. It shows you what it changes, like any other edit.
- **Review**: Claude runs `node scripts/pointfix.mjs pull` to read the open notes, opens each screenshot, edits your code, and answers with `node scripts/pointfix.mjs reply <id> "..."`.

The plugin has no hooks, no MCP servers and no commands that run on their own. Nothing runs until you ask Claude to install PointFix or to review notes.

## What it runs, sends and fetches

- **Notes stay on your own server.** The widget sends notes (comment, screenshot, element details) only to your project's own endpoint, by default `/api/pointfix` on the same site. The file store writes them to `.pointfix/` in your project. Nothing is sent to Anthropic, to the plugin author or to any other service.
- **The CLI** (`scripts/pointfix.mjs`) reads `.pointfix/` locally. If you set `POINTFIX_URL` and `POINTFIX_KEY` (in your environment or `.env.local`), it calls that URL, which is your own deployed site's endpoint, with the key as a Bearer token, and saves the notes and screenshots to `.pointfix-inbox/`. It contacts no other address.
- **Screenshots** are drawn in the browser with the `html2canvas-pro` library. The install step adds it from npm. If a project doesn't install it, the widget loads it from `https://cdn.jsdelivr.net/npm/html2canvas-pro@2/+esm`. Only the library is downloaded; no data is sent.
- **Optional `tabCapture`** (off by default) uses the browser's own screen-share prompt to capture the tab. The image stays in the browser until you send the note to your endpoint.
- **On a deployed site** the endpoint is off until you set `POINTFIX_KEY` on the server. Visitors never see the button or download its code.

All source is readable JavaScript with no dependencies. There is no build step, no minified code, and no binary files.

## Requirements

- Claude Code
- Node.js 18.17 or newer
- A web project with a server part: Next.js, Remix or React Router 7, SvelteKit, Nuxt, Astro (SSR), Express or any Node server, a Vite dev server, or plain HTML served by one of these

## License

MIT
