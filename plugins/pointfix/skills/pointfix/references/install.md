# Installing pointfix

Contents: [What goes where](#what-goes-where) · [Next.js (App Router)](#nextjs-app-router) · [Next.js (Pages Router)](#nextjs-pages-router) · [Vite / SPA in development](#vite--spa-in-development) · [Express or any Node server](#express-or-any-node-server) · [SvelteKit](#sveltekit) · [Nuxt 3](#nuxt-3) · [Remix / React Router 7](#remix--react-router-7) · [Astro](#astro) · [Plain HTML](#plain-html) · [Deployed sites](#deployed-sites) · [Serverless and custom stores](#serverless-and-custom-stores) · [Letting your own admins in](#letting-your-own-admins-in) · [Widget options](#widget-options) · [Content-Security-Policy](#content-security-policy) · [Uninstall](#uninstall)

## What goes where

Every stack needs the same three things:

1. **The endpoint** — `createPointFixHandler({ store })` from `pointfix-server.js`, served at one path (default `/api/pointfix`) for GET, POST, PATCH and DELETE. It takes a standard `Request` and returns a `Response`; `toNodeMiddleware(handler)` adapts it to `(req, res)` servers.
2. **A store** — `createFileStore()` from `pointfix-file-store.js` (files in `.pointfix/`), or your own (see [custom stores](#serverless-and-custom-stores)).
3. **The widget** — `mountPointFix(options)` from `pointfix-widget.js`, called once in the browser. It asks the endpoint whether to show the button.

Copy the templates into one folder (e.g. `lib/pointfix/` or `src/lib/pointfix/`), install `html2canvas-pro`, add `.pointfix/` and `.pointfix-inbox/` to `.gitignore`, and copy `scripts/pointfix.mjs` to the project's `scripts/`.

If the widget is mounted on a different path than `/api/pointfix`, pass the same path to the widget as `endpoint` and use it in `POINTFIX_URL`.

## Next.js (App Router)

1. Copy `templates/nextjs/route.js` to `app/api/pointfix/route.js` (`route.ts` in TypeScript projects — the content works as is). Fix the import paths (`@/lib/pointfix/...`).
2. Copy `templates/nextjs/pointfix-launcher.jsx` to `components/pointfix-launcher.jsx` (`.tsx` in TS projects; the `/** @type */` comment can become a type annotation).
3. Render it once in `app/layout.(tsx|jsx)`, inside `<body>`:

   ```tsx
   import PointFixLauncher from "@/components/pointfix-launcher";
   // ...
   <body>
     {children}
     <PointFixLauncher />
   </body>
   ```

   It's a client component that renders nothing until the endpoint says the button is visible, so it doesn't change the layout's caching or rendering.
4. `npm install html2canvas-pro` (or pnpm / yarn / bun, following the lockfile).
5. If the project has a `middleware.ts` / `proxy.ts` that requires login for `/api/*`, let `/api/pointfix` through — the handler does its own access control.
6. Check: `npm run dev`, open any page, the round button is at the bottom right (the launcher puts it there because Next.js shows its dev tools indicator at the bottom left).

Next.js versions differ (route segment config, `proxy.ts` replacing `middleware.ts` in 16): if the project has docs in `node_modules/next/dist/docs/`, follow them over this file.

## Next.js (Pages Router)

`pages/api/pointfix.js`:

```js
import { createPointFixHandler, toNodeMiddleware } from "@/lib/pointfix/pointfix-server.js";
import { createFileStore } from "@/lib/pointfix/pointfix-file-store.js";

export const config = { api: { bodyParser: false } }; // the handler reads the raw body itself
export default toNodeMiddleware(createPointFixHandler({ store: createFileStore() }));
```

Mount the launcher (same component as the App Router, without `"use client"`) in `pages/_app.js`.

## Vite / SPA in development

For a React / Vue / Svelte SPA without its own server, serve the endpoint from Vite's dev server, so it works while you develop:

```js
// vite.config.js
import { createPointFixHandler, toNodeMiddleware } from "./src/lib/pointfix/pointfix-server.js";
import { createFileStore } from "./src/lib/pointfix/pointfix-file-store.js";

export default defineConfig({
  plugins: [
    // ...your plugins
    {
      name: "pointfix",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/api/pointfix", toNodeMiddleware(createPointFixHandler({ store: createFileStore() })));
      },
    },
  ],
});
```

In the app's entry (`main.tsx`, `main.js`):

```js
if (import.meta.env.DEV) {
  import("./lib/pointfix/pointfix-widget.js").then(({ mountPointFix }) =>
    mountPointFix({ loadHtml2Canvas: () => import("html2canvas-pro") })
  );
}
```

For a deployed SPA, the endpoint has to live on a real backend (see Express) and the `import.meta.env.DEV` guard goes away — the visibility check protects it.

## Express or any Node server

```js
import { createPointFixHandler, toNodeMiddleware } from "./lib/pointfix/pointfix-server.js";
import { createFileStore } from "./lib/pointfix/pointfix-file-store.js";

// Before express.json() / body parsers: the handler reads the raw body.
app.use("/api/pointfix", toNodeMiddleware(createPointFixHandler({ store: createFileStore() })));
```

Plain `http.createServer`: call the middleware when `req.url` starts with `/api/pointfix` (see `demo/server.mjs` in the repository). Mount the widget in the pages the server renders (see [Plain HTML](#plain-html)).

## SvelteKit

`src/routes/api/pointfix/+server.js`:

```js
import { createPointFixHandler } from "$lib/pointfix/pointfix-server.js";
import { createFileStore } from "$lib/pointfix/pointfix-file-store.js";

const handler = createPointFixHandler({ store: createFileStore() });
export const GET = ({ request }) => handler(request);
export const POST = ({ request }) => handler(request);
export const PATCH = ({ request }) => handler(request);
export const DELETE = ({ request }) => handler(request);
```

Mount the widget from the root `+layout.svelte` in `onMount` (dynamic `import()` as in the Vite example, without the DEV guard).

## Nuxt 3

`server/api/pointfix.ts`:

```ts
import { createPointFixHandler } from "~/lib/pointfix/pointfix-server.js";
import { createFileStore } from "~/lib/pointfix/pointfix-file-store.js";

const handler = createPointFixHandler({ store: createFileStore() });
export default defineEventHandler((event) => handler(toWebRequest(event)));
```

Mount the widget in a client-only plugin: `plugins/pointfix.client.ts` with the dynamic import.

## Remix / React Router 7

`app/routes/api.pointfix.ts`:

```ts
const handler = createPointFixHandler({ store: createFileStore() });
export const loader = ({ request }) => handler(request);
export const action = ({ request }) => handler(request);
```

Mount the widget in `root.tsx` with a `useEffect` like the Next.js launcher.

## Astro

`src/pages/api/pointfix.ts` (needs an SSR adapter, `export const prerender = false`):

```ts
const handler = createPointFixHandler({ store: createFileStore() });
export const prerender = false;
export const GET = ({ request }) => handler(request);
export const POST = GET; export const PATCH = GET; export const DELETE = GET;
```

Mount the widget with a `<script>` in the base layout (Astro bundles it).

## Plain HTML

Any page served by a server that has the endpoint:

```html
<script type="module">
  import { mountPointFix } from "/pointfix-widget.js";
  mountPointFix(); // html2canvas-pro comes from a CDN unless you pass loadHtml2Canvas
</script>
```

## Deployed sites

On a deployed site (`NODE_ENV=production`) the endpoint is off until `POINTFIX_KEY` is set on the server.

1. `node scripts/pointfix.mjs key` → a random secret.
2. Put it in the server's environment as `POINTFIX_KEY` (hosting dashboard, `.env` on a VPS, Docker env). Redeploy/restart.
3. The owner opens `https://<site>/api/pointfix?enable=<key>` once in each browser they use. An HttpOnly cookie remembers it for 30 days (`?disable` removes it). Optional `&next=/some/page` to land there.
4. For the CLI, in the owner's local project: `.env.local` with `POINTFIX_URL=https://<site>/api/pointfix` and `POINTFIX_KEY=<key>`. Make sure `.env.local` is git-ignored.
5. Changing the key logs every browser out.

The file store needs a disk that survives deploys: a VPS or a Docker volume mounted on `.pointfix/` (or set `POINTFIX_DIR`). If every deploy wipes the disk, notes are lost — use a custom store.

## Serverless and custom stores

On Vercel, Netlify, Cloudflare and similar, the disk is temporary: write a store for the project's database or object storage. A store is six async functions (see `FeedbackStore` in `pointfix-server.js`):

```js
const store = {
  async create(note, png) {},        // save the note (JSON) and the PNG bytes (Uint8Array | null)
  async list(status) {},             // "open" | "resolved" | "all", oldest first
  async get(id) {},                  // the note or null
  async update(id, patch) {},        // merge the patch, return the note or null
  async image(id) {},                // the PNG bytes or null
  async remove(id) {},               // true if it existed
};
```

A simple version: one table with an `id` primary key and a JSON column for the note, and the PNG in blob storage (or a bytea/blob column — screenshots are 0.3–3 MB).

## Letting your own admins in

If the site already has staff logins, let them use the button without the activation link:

```js
createPointFixHandler({
  store,
  isAllowed: async (request) => Boolean(await getAdminFromRequest(request)), // your auth
});
```

`isAllowed` is checked in production in addition to the key/cookie. Keep it cheap: the widget calls the endpoint on every page load.

## Widget options

`mountPointFix(options)`:

| Option | Default | What it does |
|---|---|---|
| `endpoint` | `"/api/pointfix"` | Where the endpoint is. |
| `loadHtml2Canvas` | a CDN | `() => import("html2canvas-pro")` — use the installed package. |
| `breakpoints` | `{ tablet: 768, desktop: 1024 }` | Widths where tablet and desktop start; decides which screen comes selected. |
| `locale` | `<html lang>` / browser | `"en"` or `"es"`. |
| `position` | `"bottom-left"` | Or `"bottom-right"`. Move it if another floating thing sits in that corner (Next.js dev tools, chat widgets). |
| `bottomOffset` | `"16px"` | Lift the button above a fixed bottom bar, e.g. `"calc(var(--dock-h) + 16px)"`. |
| `accentColor` | `"#f97316"` | Color of the picked boxes and main buttons. |
| `tabCapture` | `false` | Exact capture of the tab with the browser's screen-share (HTTPS + mouse); the browser asks permission every time. |
| `checkVisibility` | `true` | Ask the endpoint first. The launchers above check before importing and pass `false`. |
| `zIndex` | `2147483000` | Stack level of the widget. |

## Content-Security-Policy

- `html2canvas-pro` from npm needs nothing special. From the CDN it needs `script-src https://cdn.jsdelivr.net`.
- Captures use `data:` and `blob:` images inside the widget: `img-src 'self' data: blob:` (common already).
- The widget's styles use constructable stylesheets, which `style-src` doesn't block.
- The notes page (`?view`) is plain HTML with an inline `<style>`; with a strict `style-src` it still works, just unstyled.

## Uninstall

Remove the launcher from the layout, the endpoint route, the copied templates, `html2canvas-pro` and the `.gitignore` lines; delete `.pointfix/`. To only switch it off on a deployed site, remove `POINTFIX_KEY` from the server's environment.
