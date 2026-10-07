// @ts-check
/**
 * pointfix — server side.
 *
 * One handler for the whole feature, written against the standard Web `Request` / `Response` API, so the
 * same file works in Next.js route handlers, Remix, Hono, Bun and Deno, and in Express / Vite / plain Node
 * through `toNodeMiddleware`. It has no dependencies and no Node-only imports (the file store lives in
 * `pointfix-file-store.js`).
 *
 * Who can use it:
 *  - In development (NODE_ENV !== "production"): everyone who can reach your dev server — that's you.
 *  - On a deployed site: only browsers that opened the activation link `<endpoint>?enable=<POINTFIX_KEY>`
 *    (an HttpOnly cookie remembers it) and scripts that send `Authorization: Bearer <POINTFIX_KEY>`.
 *  - In production without POINTFIX_KEY the feature is off: every request answers 404.
 *
 * Routes (all on the same endpoint, e.g. /api/pointfix):
 *   GET                    → { visible }        the widget asks whether to show the button (never 404)
 *   GET  ?enable=<key>     → sets the cookie and redirects (to ?next=/path or "/")
 *   GET  ?disable          → removes the cookie
 *   GET  ?view[=open|resolved|all]   → HTML page to read notes, Claude's replies, resolve / reopen / delete
 *   GET  ?notes[=open|resolved|all]  → JSON list (used by scripts/pointfix.mjs)
 *   GET  ?image=<id>       → the annotated screenshot (PNG)
 *   POST (JSON)            → create a note (the widget)
 *   POST (form)            → viewer actions: resolve / reopen / delete
 *   PATCH ?id=<id> (JSON)  → { status?, reply? }  (scripts/pointfix.mjs reply|resolve|reopen)
 *   DELETE ?id=<id>
 */

/** @typedef {"open" | "resolved"} NoteStatus */
/** @typedef {"desktop" | "tablet" | "mobile"} Device */

/**
 * @typedef {object} NoteElement
 * @property {string} selector      Short CSS path, e.g. `main > section.cart > button:nth-of-type(2)`.
 * @property {string} tag
 * @property {string | null} id
 * @property {string[]} classes
 * @property {string} text          Visible text, trimmed.
 * @property {string[]} components  Framework components that render it, innermost first (React, Vue, Svelte, Angular; dev builds).
 * @property {string | null} source Source file (and line) when the framework exposes it in development.
 * @property {Record<string, string>} attributes  A few useful attributes (data-testid, aria-label, role, href...).
 * @property {{ x: number, y: number, width: number, height: number }} rect  Box in the viewport, in CSS px.
 * @property {number} layer         0 = the topmost layer under the pointer when it was picked.
 * @property {Record<string, string>} styles  Computed styles that help locate layout problems.
 */

/**
 * @typedef {object} Note
 * @property {string} id
 * @property {string} createdAt     ISO date.
 * @property {string} pageUrl       Path + query of the page, e.g. `/products/1?tab=info`.
 * @property {string} pageTitle
 * @property {string} comment
 * @property {Device[]} devices     Screens the change applies to.
 * @property {{ width: number, height: number }} viewport
 * @property {string | null} userAgent
 * @property {NoteElement[]} elements
 * @property {boolean} hasImage
 * @property {NoteStatus} status
 * @property {string | null} reply      What Claude understood and changed.
 * @property {string | null} repliedAt
 * @property {string | null} resolvedAt
 */

/**
 * Where notes live. `createFileStore()` (files in `.pointfix/`) is the default; `createMemoryStore()` is for
 * tests. Write your own to keep notes in a database or object storage — it's six small functions.
 * @typedef {object} FeedbackStore
 * @property {(note: Note, png: Uint8Array | null) => Promise<void>} create
 * @property {(status: NoteStatus | "all") => Promise<Note[]>} list   Oldest first.
 * @property {(id: string) => Promise<Note | null>} get
 * @property {(id: string, patch: Partial<Note>) => Promise<Note | null>} update
 * @property {(id: string) => Promise<Uint8Array | null>} image
 * @property {(id: string) => Promise<boolean>} remove
 */

/**
 * @typedef {object} HandlerOptions
 * @property {FeedbackStore} store
 * @property {string} [key]  Secret for the activation link and for scripts. Defaults to process.env.POINTFIX_KEY.
 * @property {boolean} [allowInDevelopment]  Defaults to NODE_ENV !== "production".
 * @property {(request: Request) => boolean | Promise<boolean>} [isAllowed]  Extra check, e.g. "is an admin logged in".
 * @property {number} [maxImageBytes]  Default 8 MB.
 */

export const DEVICES = /** @type {const} */ (["desktop", "tablet", "mobile"]);
const COOKIE = "pointfix";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const ID_PATTERN = /^[a-z0-9-]{4,64}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

class InputError extends Error {}

/** @param {string | undefined} name */
function env(name) {
  return typeof process !== "undefined" && process.env ? process.env[name ?? ""] : undefined;
}

const BASE_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

/** @param {unknown} data @param {number} [status] */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}

function notFound() {
  return json({ error: "Not found" }, 404);
}

/** @param {string} location @param {string[]} [cookies] */
function redirect(location, cookies = []) {
  const headers = new Headers({ ...BASE_HEADERS, Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

/** Constant-time string comparison (no early exit on the first different character). */
function sameString(/** @type {string} */ a, /** @type {string} */ b) {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** HMAC-SHA256(key, message) as hex, with Web Crypto (Node 18+, browsers, edge runtimes). */
async function hmacHex(/** @type {string} */ key, /** @type {string} */ message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @param {string | null} header */
function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** A path on this site ("/x"), never another origin ("//evil.com", "https://..."). */
function safeNext(/** @type {string | null} */ value) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

/** @param {string} b64 */
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {unknown} v @param {number} max */
function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** @param {unknown} v @param {number} min @param {number} max */
function int(v, min, max) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN;
  if (Number.isNaN(n) || n < min || n > max) throw new InputError("Invalid number.");
  return n;
}

/** @param {unknown} v */
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

/** @param {unknown} raw @returns {NoteElement} */
function cleanElement(raw) {
  const e = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const rect = e.rect && typeof e.rect === "object" ? /** @type {Record<string, unknown>} */ (e.rect) : {};
  /** @param {unknown} obj @param {number} maxKeys */
  const record = (obj, maxKeys) => {
    /** @type {Record<string, string>} */
    const out = {};
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj).slice(0, maxKeys)) if (typeof v === "string") out[k.slice(0, 40)] = v.slice(0, 300);
    }
    return out;
  };
  /** @param {unknown} list @param {number} maxItems @param {number} maxLen */
  const strings = (list, maxItems, maxLen) => (Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => x.slice(0, maxLen)) : []);
  return {
    selector: str(e.selector, 800) || "(unknown)",
    tag: str(e.tag, 40) || "?",
    id: str(e.id, 120) || null,
    classes: strings(e.classes, 60, 160),
    text: str(e.text, 300),
    components: strings(e.components, 12, 120),
    source: str(e.source, 400) || null,
    attributes: record(e.attributes, 12),
    rect: { x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height) },
    layer: Math.max(0, Math.min(500, num(e.layer))),
    styles: record(e.styles, 30),
  };
}

/**
 * Validates what the widget sends. Unknown fields are ignored; strings and lists are capped.
 * @param {unknown} raw @param {number} maxImageBytes
 * @returns {{ fields: Omit<Note, "id" | "createdAt" | "status" | "reply" | "repliedAt" | "resolvedAt" | "hasImage" | "userAgent">, png: Uint8Array | null }}
 */
export function parseNoteInput(raw, maxImageBytes) {
  if (!raw || typeof raw !== "object") throw new InputError("Expected a JSON object.");
  const b = /** @type {Record<string, unknown>} */ (raw);
  const comment = str(b.comment, 5000);
  if (!comment) throw new InputError("Write what should change.");
  const devices = Array.isArray(b.devices) ? DEVICES.filter((d) => /** @type {unknown[]} */ (b.devices).includes(d)) : [];
  if (devices.length === 0) throw new InputError("Pick at least one screen.");
  const vp = b.viewport && typeof b.viewport === "object" ? /** @type {Record<string, unknown>} */ (b.viewport) : {};
  const elements = Array.isArray(b.elements) ? b.elements.slice(0, 30).map(cleanElement) : [];
  const pageUrl = str(b.pageUrl, 2000);
  if (!pageUrl.startsWith("/")) throw new InputError("Invalid page URL.");

  /** @type {Uint8Array | null} */
  let png = null;
  if (b.image != null) {
    const image = typeof b.image === "string" ? b.image : "";
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match) throw new InputError("The screenshot must be a PNG data URL.");
    if (match[1].length > Math.ceil((maxImageBytes * 4) / 3) + 4) throw new InputError("The screenshot is too large.");
    png = base64ToBytes(match[1]);
    if (png.length < 8 || PNG_SIGNATURE.some((byte, i) => png?.[i] !== byte)) throw new InputError("The screenshot is not a PNG.");
  }

  return {
    fields: {
      pageUrl,
      pageTitle: str(b.pageTitle, 300),
      comment,
      devices,
      viewport: { width: int(vp.width, 1, 20000), height: int(vp.height, 1, 20000) },
      elements,
    },
    png,
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const VIEW_TEXT = {
  en: {
    title: "PointFix",
    open: "Open",
    resolved: "Resolved",
    all: "All",
    empty: "No notes here.",
    howTo: "Point out changes with the round button on your site, then ask Claude Code: “review the PointFix notes”. Claude applies them and answers here.",
    reply: "Claude's reply",
    elements: "Picked elements",
    resolve: "Mark as resolved",
    reopen: "Reopen",
    del: "Delete…",
    delConfirm: "Delete permanently",
    screens: { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" },
    madeOn: "Made on",
    notResolvedHint: "Not what you wanted? Reopen it and send a new note with what is missing.",
    layer: "layer",
    badgeOpen: "Open",
    badgeResolved: "Resolved",
  },
  es: {
    title: "PointFix · Observaciones",
    open: "Abiertas",
    resolved: "Resueltas",
    all: "Todas",
    empty: "No hay observaciones aquí.",
    howTo: "Señala cambios con el botón redondo de tu sitio y luego pídele a Claude Code: «revisa las observaciones». Claude los aplica y te responde aquí.",
    reply: "Respuesta de Claude",
    elements: "Elementos señalados",
    resolve: "Marcar como resuelta",
    reopen: "Reabrir",
    del: "Borrar…",
    delConfirm: "Borrar definitivamente",
    screens: { desktop: "PC", tablet: "Tablet", mobile: "Celular" },
    madeOn: "Hecha en",
    notResolvedHint: "¿No quedó como querías? Reábrela y manda otra observación con lo que falta.",
    layer: "capa",
    badgeOpen: "Abierta",
    badgeResolved: "Resuelta",
  },
};

/**
 * The notes page (`?view`): plain HTML and forms, no JavaScript, so it also works on sites with a strict
 * Content-Security-Policy. Every value from a note is escaped.
 * @param {{ notes: Note[], filter: NoteStatus | "all", base: string, lang: "en" | "es" }} p
 */
function renderViewer({ notes, filter, base, lang }) {
  const t = VIEW_TEXT[lang];
  const tab = (/** @type {NoteStatus | "all"} */ value, /** @type {string} */ label) =>
    `<a href="${escapeHtml(`${base}?view=${value}&lang=${lang}`)}"${filter === value ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
  const cards = notes
    .map((n) => {
      const date = new Date(n.createdAt).toLocaleString(lang === "es" ? "es" : "en");
      const screens = n.devices.map((d) => t.screens[d] ?? d).join(", ");
      const page = `<a href="${escapeHtml(n.pageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(n.pageUrl)}</a>`;
      const elements = n.elements.length
        ? `<details open><summary>${escapeHtml(t.elements)} (${n.elements.length})</summary><ol>${n.elements
            .map(
              (e) =>
                `<li><code>${escapeHtml(e.selector)}</code>${e.components.length ? `<br><small>${escapeHtml(e.components.join(" ‹ "))}</small>` : ""}${
                  e.source ? `<br><small>${escapeHtml(e.source)}</small>` : ""
                }${e.text ? `<br><small>«${escapeHtml(e.text.slice(0, 120))}»</small>` : ""}<br><small>${e.rect.width}×${e.rect.height} · ${escapeHtml(t.layer)} ${e.layer + 1}</small></li>`
            )
            .join("")}</ol></details>`
        : "";
      const reply = n.reply
        ? `<div class="reply"><strong>${escapeHtml(t.reply)}</strong>${n.repliedAt ? ` · <small>${escapeHtml(new Date(n.repliedAt).toLocaleString(lang === "es" ? "es" : "en"))}</small>` : ""}<p>${escapeHtml(
            n.reply
          )}</p>${n.status === "resolved" ? `<small>${escapeHtml(t.notResolvedHint)}</small>` : ""}</div>`
        : "";
      const action = (/** @type {string} */ name, /** @type {string} */ label, /** @type {string} */ cls) =>
        `<form method="post" action="${escapeHtml(base)}"><input type="hidden" name="action" value="${name}"><input type="hidden" name="id" value="${escapeHtml(
          n.id
        )}"><input type="hidden" name="back" value="${filter}"><input type="hidden" name="lang" value="${lang}"><button class="${cls}">${escapeHtml(label)}</button></form>`;
      return `<article class="note ${n.status}">
  ${n.hasImage ? `<a class="shot" href="${escapeHtml(`${base}?image=${n.id}`)}" target="_blank"><img src="${escapeHtml(`${base}?image=${n.id}`)}" alt="" loading="lazy"></a>` : ""}
  <div class="body">
    <p class="meta"><span class="badge">${escapeHtml(n.status === "open" ? t.badgeOpen : t.badgeResolved)}</span> <code>${escapeHtml(n.id)}</code> · ${escapeHtml(date)} · ${escapeHtml(screens)} · <small>${escapeHtml(
        t.madeOn
      )} ${n.viewport.width}×${n.viewport.height}</small></p>
    <p>${page}</p>
    <p class="comment">${escapeHtml(n.comment)}</p>
    ${reply}
    ${elements}
    <div class="actions">${n.status === "open" ? action("resolve", t.resolve, "primary") : action("reopen", t.reopen, "")}<details><summary>${escapeHtml(t.del)}</summary>${action(
        "delete",
        t.delConfirm,
        "danger"
      )}</details></div>
  </div>
</article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(t.title)}</title>
<style>
:root{color-scheme:light dark;--ink:#171412;--muted:#6b6560;--line:#e7e2dc;--bg:#f7f5f2;--card:#fff;--accent:#f97316;--blue:#eff6ff;--blue-line:#bfdbfe}
@media (prefers-color-scheme:dark){:root{--ink:#f2efe9;--muted:#a8a29e;--line:#3a3532;--bg:#151311;--card:#1f1c1a;--blue:#0f1d33;--blue-line:#1e3a5f}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:1.4rem;margin:.5rem 0}
.how{color:var(--muted);margin:0 0 12px}nav{display:flex;gap:8px;margin:12px 0}
nav a{padding:8px 14px;border-radius:999px;border:1px solid var(--line);color:inherit;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
nav a[aria-current]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.note{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin:12px 0}
.note.resolved{opacity:.8}@media (max-width:760px){.note{grid-template-columns:1fr}}
.shot img{width:100%;height:auto;border-radius:10px;border:1px solid var(--line)}.body{min-width:0}
.meta{color:var(--muted);font-size:.85rem}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--accent);color:#171412;font-weight:700}
.resolved .badge{background:#86efac}.comment{font-size:1.05rem;white-space:pre-wrap}
.reply{background:var(--blue);border:1px solid var(--blue-line);border-radius:12px;padding:10px;margin:8px 0}.reply p{white-space:pre-wrap;margin:4px 0}
code{font-size:.8rem;word-break:break-all}ol{padding-left:20px}li{margin:6px 0}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.actions form{display:inline}
button{min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;cursor:pointer}
button.primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}button.danger{color:#b91c1c;border-color:#fecaca}
a{color:inherit}
</style></head>
<body><main>
<h1>${escapeHtml(t.title)}</h1>
<p class="how">${escapeHtml(t.howTo)}</p>
<nav>${tab("open", t.open)}${tab("resolved", t.resolved)}${tab("all", t.all)}</nav>
${cards || `<p>${escapeHtml(t.empty)}</p>`}
</main></body></html>`;
}

/**
 * Creates the request handler.
 * @param {HandlerOptions} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createPointFixHandler(options) {
  const store = options.store;
  const key = options.key ?? env("POINTFIX_KEY") ?? "";
  const devAllowed = options.allowInDevelopment ?? env("NODE_ENV") !== "production";
  const maxImageBytes = options.maxImageBytes ?? 8 * 1024 * 1024;
  /** @type {Promise<string> | null} */
  let cookieValue = null;
  const expectedCookie = () => (cookieValue ??= hmacHex(key, "pointfix-cookie-v1"));

  /** Can this request use the feature? */
  async function allowed(/** @type {Request} */ request) {
    if (devAllowed) return true;
    if (key) {
      const auth = request.headers.get("authorization") ?? "";
      if (auth.startsWith("Bearer ") && sameString(auth.slice(7).trim(), key)) return true;
      const cookie = parseCookies(request.headers.get("cookie"))[COOKIE];
      if (cookie && sameString(cookie, await expectedCookie())) return true;
    }
    return options.isAllowed ? Boolean(await options.isAllowed(request)) : false;
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const q = url.searchParams;
    const base = url.pathname;
    const method = request.method.toUpperCase();
    try {
      if (method === "GET" && q.has("enable")) {
        if (!key || !sameString(q.get("enable") ?? "", key)) return notFound();
        const secure = url.protocol === "https:" ? "; Secure" : "";
        return redirect(safeNext(q.get("next")), [`${COOKIE}=${await expectedCookie()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`]);
      }
      if (method === "GET" && q.has("disable")) {
        return redirect(safeNext(q.get("next")), [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`]);
      }

      const ok = await allowed(request);
      if (method === "GET" && [...q.keys()].length === 0) return json({ visible: ok });
      if (!ok) return notFound();

      if (method === "GET" && q.has("image")) {
        const id = q.get("image") ?? "";
        const png = ID_PATTERN.test(id) ? await store.image(id) : null;
        if (!png) return notFound();
        return new Response(/** @type {BodyInit} */ (/** @type {unknown} */ (png)), {
          headers: { ...BASE_HEADERS, "Content-Type": "image/png", "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
        });
      }
      if (method === "GET" && (q.has("notes") || q.has("view"))) {
        const raw = q.get("notes") ?? q.get("view") ?? "";
        const filter = raw === "resolved" || raw === "all" ? raw : "open";
        const notes = await store.list(filter);
        if (q.has("notes")) return json({ notes });
        const accept = (request.headers.get("accept-language") ?? "").toLowerCase();
        const lang = q.get("lang") === "es" || (q.get("lang") !== "en" && accept.startsWith("es")) ? "es" : "en";
        const html = renderViewer({ notes: filter === "open" ? notes : [...notes].reverse(), filter, base, lang });
        return new Response(html, { headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "same-origin" } });
      }

      if (method === "POST") {
        const type = request.headers.get("content-type") ?? "";
        if (type.includes("application/x-www-form-urlencoded")) {
          // Forms of the notes page. Same-origin only (the cookie is SameSite=Lax as well). The page sends
          // "Referrer-Policy: same-origin" so the browser includes a real Origin here; "null" is rejected.
          const origin = request.headers.get("origin");
          if (origin && origin !== url.origin) return json({ error: "Cross-origin request" }, 403);
          const form = new URLSearchParams(await request.text());
          const id = form.get("id") ?? "";
          const back = ["open", "resolved", "all"].includes(form.get("back") ?? "") ? form.get("back") : "open";
          if (!ID_PATTERN.test(id)) return notFound();
          const action = form.get("action");
          if (action === "resolve") await store.update(id, { status: "resolved", resolvedAt: new Date().toISOString() });
          else if (action === "reopen") await store.update(id, { status: "open", resolvedAt: null });
          else if (action === "delete") await store.remove(id);
          else return json({ error: "Unknown action" }, 400);
          const lang = form.get("lang") === "es" ? "es" : "en";
          return redirect(`${base}?view=${back}&lang=${lang}`);
        }
        const text = await request.text();
        if (text.length > Math.ceil(maxImageBytes * 1.4) + 300_000) return json({ error: "The note is too large." }, 413);
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new InputError("Invalid JSON.");
        }
        const { fields, png } = parseNoteInput(body, maxImageBytes);
        let id = crypto.randomUUID().slice(0, 8);
        while (await store.get(id)) id = crypto.randomUUID().slice(0, 8);
        /** @type {Note} */
        const note = {
          id,
          createdAt: new Date().toISOString(),
          ...fields,
          userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
          hasImage: png !== null,
          status: "open",
          reply: null,
          repliedAt: null,
          resolvedAt: null,
        };
        await store.create(note, png);
        return json({ id }, 201);
      }

      if (method === "PATCH" || method === "DELETE") {
        const id = q.get("id") ?? "";
        if (!ID_PATTERN.test(id)) return notFound();
        if (method === "DELETE") return (await store.remove(id)) ? json({ id }) : notFound();
        let body;
        try {
          body = JSON.parse(await request.text());
        } catch {
          throw new InputError("Invalid JSON.");
        }
        const b = body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {};
        const now = new Date().toISOString();
        /** @type {Partial<Note>} */
        const patch = {};
        if (b.status === "resolved") Object.assign(patch, { status: "resolved", resolvedAt: now });
        else if (b.status === "open") Object.assign(patch, { status: "open", resolvedAt: null });
        else if (b.status !== undefined) throw new InputError('status must be "open" or "resolved".');
        if (typeof b.reply === "string") Object.assign(patch, { reply: b.reply.trim().slice(0, 5000) || null, repliedAt: b.reply.trim() ? now : null });
        else if (b.reply !== undefined && b.reply !== null) throw new InputError("reply must be a string.");
        const updated = await store.update(id, patch);
        return updated ? json({ note: updated }) : notFound();
      }

      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, 400);
      console.error("[pointfix]", error);
      return json({ error: "Internal error" }, 500);
    }
  };
}

/** Keeps notes in memory (tests, demos, serverless experiments). */
export function createMemoryStore() {
  /** @type {Map<string, { note: Note, png: Uint8Array | null }>} */
  const notes = new Map();
  /** @type {FeedbackStore} */
  const store = {
    async create(note, png) {
      notes.set(note.id, { note: structuredClone(note), png });
    },
    async list(status) {
      return [...notes.values()]
        .map((v) => structuredClone(v.note))
        .filter((n) => status === "all" || n.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async get(id) {
      const v = notes.get(id);
      return v ? structuredClone(v.note) : null;
    },
    async update(id, patch) {
      const v = notes.get(id);
      if (!v) return null;
      v.note = { ...v.note, ...patch, id };
      return structuredClone(v.note);
    },
    async image(id) {
      return notes.get(id)?.png ?? null;
    },
    async remove(id) {
      return notes.delete(id);
    },
  };
  return store;
}

/**
 * Adapts the handler to Node's `(req, res)` style: Express, Connect, Vite's dev server, `http.createServer`.
 * Mount it on the endpoint path, e.g. `app.use("/api/pointfix", toNodeMiddleware(handler))`.
 * @param {(request: Request) => Promise<Response>} handler
 */
export function toNodeMiddleware(handler) {
  /**
   * @param {any} req  Node IncomingMessage (Express / Connect add originalUrl).
   * @param {any} res  Node ServerResponse.
   */
  return async function pointfixMiddleware(req, res) {
    const host = req.headers.host ?? "localhost";
    const proto = req.headers["x-forwarded-proto"] ?? (req.socket?.encrypted ? "https" : "http");
    const url = new URL(req.originalUrl ?? req.url ?? "/", `${proto}://${host}`);
    /** @type {Uint8Array[]} */
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? new Blob(/** @type {BlobPart[]} */ (chunks)) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) for (const item of v) headers.append(k, item);
      else if (typeof v === "string") headers.set(k, v);
    }
    const method = (req.method ?? "GET").toUpperCase();
    const response = await handler(new Request(url, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
    });
    const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.end(new Uint8Array(await response.arrayBuffer()));
  };
}
