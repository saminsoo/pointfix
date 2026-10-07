#!/usr/bin/env node
// @ts-check
/**
 * pointfix CLI — read the notes left with the feedback button, answer them and mark them as resolved.
 * No dependencies (Node 18+). Copy it into your project (scripts/pointfix.mjs) or run it from the skill.
 *
 *   node scripts/pointfix.mjs pull [--status open|resolved|all]   list notes (downloads screenshots if remote)
 *   node scripts/pointfix.mjs show <id>                            one note in detail
 *   node scripts/pointfix.mjs reply <id> "<text>" [--keep-open]    save Claude's reply and resolve the note
 *   node scripts/pointfix.mjs resolve <id> [<id>...]               mark as resolved without a reply
 *   node scripts/pointfix.mjs reopen <id> [<id>...]
 *   node scripts/pointfix.mjs key                                  generate a secret for POINTFIX_KEY
 *
 * Where the notes are:
 *   - Remote (a deployed site): set POINTFIX_URL (the endpoint, e.g. https://staging.example.com/api/pointfix)
 *     and POINTFIX_KEY — as environment variables, in .env.local / .env, or with --url / --key.
 *     Screenshots are downloaded to .pointfix-inbox/.
 *   - Local (your dev server writes files): without POINTFIX_URL, notes are read from .pointfix/
 *     (or POINTFIX_DIR, or --dir). Use --local to force this mode.
 */
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const INBOX = ".pointfix-inbox";
const ID_PATTERN = /^[a-z0-9-]{4,64}$/;

/** @typedef {{ id: string, createdAt: string, pageUrl: string, pageTitle?: string, comment: string, devices: string[], viewport: { width: number, height: number }, elements: any[], hasImage: boolean, status: "open" | "resolved", reply: string | null, repliedAt: string | null, resolvedAt: string | null }} Note */

/** Minimal .env reader: KEY=value lines, optional quotes, # comments. Only fills variables that are not set. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    let text = "";
    try {
      text = readFileSync(name, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?(POINTFIX_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]] !== undefined) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, "");
      process.env[m[1]] = value;
    }
  }
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      if (inline !== undefined) flags[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") && ["status", "url", "key", "dir"].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`pointfix: ${message}`);
  process.exit(1);
}

/** @param {Record<string, string | boolean>} flags */
function source(flags) {
  const url = typeof flags.url === "string" ? flags.url : process.env.POINTFIX_URL;
  if (url && !flags.local) {
    const key = typeof flags.key === "string" ? flags.key : process.env.POINTFIX_KEY;
    if (!key) fail("POINTFIX_URL is set but POINTFIX_KEY is missing (needed to read notes from the site).");
    return /** @type {const} */ ({ kind: "remote", url: url.replace(/\/+$/, ""), key: /** @type {string} */ (key) });
  }
  const dir = path.resolve(typeof flags.dir === "string" ? flags.dir : process.env.POINTFIX_DIR ?? ".pointfix");
  return /** @type {const} */ ({ kind: "local", dir });
}

/** @param {{ url: string, key: string }} remote @param {string} query @param {RequestInit} [init] */
async function call(remote, query, init = {}) {
  const res = await fetch(`${remote.url}${query}`, { ...init, headers: { Authorization: `Bearer ${remote.key}`, ...(init.headers ?? {}) } });
  if (res.status === 404) fail(`404 from ${remote.url} — check POINTFIX_URL and POINTFIX_KEY (the key must match the site's).`);
  if (!res.ok) fail(`${res.status} from ${remote.url}: ${await res.text()}`);
  return res;
}

/** @param {string} dir @param {string} id */
async function readLocal(dir, id) {
  if (!ID_PATTERN.test(id)) fail(`invalid id: ${id}`);
  try {
    return /** @type {Note} */ (JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), "utf8")));
  } catch {
    return fail(`note ${id} not found in ${dir}`);
  }
}

/** @param {string} dir @param {Note} note */
async function writeLocal(dir, note) {
  const target = path.join(dir, `${note.id}.json`);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(note, null, 2)}\n`);
  await fs.rename(tmp, target);
}

/** @param {ReturnType<typeof source>} src @param {string} status @returns {Promise<{ notes: Note[], imageDir: string }>} */
async function loadNotes(src, status) {
  if (src.kind === "remote") {
    const { notes } = /** @type {{ notes: Note[] }} */ (await (await call(src, `?notes=${status}`)).json());
    await fs.mkdir(INBOX, { recursive: true });
    for (const n of notes) {
      if (!n.hasImage || !ID_PATTERN.test(n.id)) continue;
      const png = new Uint8Array(await (await call(src, `?image=${n.id}`)).arrayBuffer());
      await fs.writeFile(path.join(INBOX, `${n.id}.png`), png);
    }
    await fs.writeFile(path.join(INBOX, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
    return { notes, imageDir: INBOX };
  }
  let names = [];
  try {
    names = await fs.readdir(src.dir);
  } catch {
    return { notes: [], imageDir: src.dir };
  }
  /** @type {Note[]} */
  const notes = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const note = /** @type {Note} */ (JSON.parse(await fs.readFile(path.join(src.dir, name), "utf8")));
      if (status === "all" || note.status === status) notes.push(note);
    } catch {
      // A note being written right now; it will show up next time.
    }
  }
  notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { notes, imageDir: src.dir };
}

/** @param {any} e */
function elementLabel(e) {
  const name = e.attributes?.["aria-label"] || e.text;
  return `${e.tag}${e.id ? `#${e.id}` : ""}${name ? ` «${String(name).slice(0, 60)}»` : ""}`;
}

/** @param {Note} n @param {number} index @param {string} imageDir */
function describe(n, index, imageDir) {
  const lines = [
    `## ${index}. ${n.id} · ${n.status} · for: ${n.devices.join(", ")} · ${n.createdAt.replace("T", " ").slice(0, 16)}`,
    `Page: ${n.pageUrl}${n.pageTitle ? ` — "${n.pageTitle}"` : ""} · viewport ${n.viewport.width}×${n.viewport.height}`,
    `Comment: ${n.comment}`,
  ];
  if (n.hasImage) lines.push(`Screenshot: ${path.join(imageDir, `${n.id}.png`)}  (picked elements are numbered on it; extra marks are drawn in red/yellow/blue)`);
  if (n.elements.length === 0) lines.push("Elements: none picked — rely on the comment and the marks on the screenshot.");
  else {
    lines.push("Elements:");
    n.elements.forEach((e, i) => {
      lines.push(`  ${i + 1}. ${elementLabel(e)}`);
      lines.push(`     selector: ${e.selector}`);
      if (e.components?.length) lines.push(`     components: ${e.components.join(" < ")}`);
      if (e.source) lines.push(`     source: ${e.source}`);
      const s = e.styles ?? {};
      const style = ["position", "zIndex", "display", "width", "height"].filter((k) => s[k]).map((k) => `${k}: ${s[k]}`).join(" · ");
      lines.push(`     box: ${e.rect.width}×${e.rect.height} at (${e.rect.x}, ${e.rect.y}) · layer ${e.layer + 1}${style ? ` · ${style}` : ""}`);
    });
  }
  if (n.reply) lines.push(`Previous reply: ${n.reply}`);
  return lines.join("\n");
}

/** @param {ReturnType<typeof source>} src @param {string} id @param {{ status?: "open" | "resolved", reply?: string }} change */
async function updateNote(src, id, change) {
  if (!ID_PATTERN.test(id)) fail(`invalid id: ${id}`);
  if (src.kind === "remote") {
    await call(src, `?id=${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
    return;
  }
  const note = await readLocal(src.dir, id);
  const now = new Date().toISOString();
  if (change.status === "resolved") Object.assign(note, { status: "resolved", resolvedAt: now });
  if (change.status === "open") Object.assign(note, { status: "open", resolvedAt: null });
  if (typeof change.reply === "string") Object.assign(note, { reply: change.reply.trim() || null, repliedAt: change.reply.trim() ? now : null });
  await writeLocal(src.dir, note);
}

async function main() {
  loadEnvFiles();
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const [command = "pull", ...args] = rest;

  if (command === "key") {
    const key = crypto.randomBytes(32).toString("base64url");
    console.log(key);
    console.error("\nPut it in the server's environment as POINTFIX_KEY (and in your local .env.local for this script).");
    console.error("Then open <your site>/api/pointfix?enable=<key> once in your browser to see the button there.");
    return;
  }

  const src = source(flags);
  const where = src.kind === "remote" ? src.url : src.dir;

  if (command === "pull" || command === "list") {
    const status = typeof flags.status === "string" ? flags.status : "open";
    if (!["open", "resolved", "all"].includes(status)) fail("--status must be open, resolved or all");
    const { notes, imageDir } = await loadNotes(src, status);
    if (flags.json) {
      console.log(JSON.stringify(notes, null, 2));
      return;
    }
    console.log(`# PointFix — ${notes.length} ${status === "all" ? "" : `${status} `}note${notes.length === 1 ? "" : "s"} (${where})\n`);
    notes.forEach((n, i) => console.log(`${describe(n, i + 1, imageDir)}\n`));
    if (notes.length) {
      console.log("Next: read each screenshot, make the change, then:");
      console.log('  node scripts/pointfix.mjs reply <id> "Understood: ... Done: ..."');
    }
    return;
  }

  if (command === "show") {
    const id = args[0] ?? fail("usage: show <id>");
    const { notes, imageDir } = await loadNotes(src, "all");
    const note = notes.find((n) => n.id === id) ?? fail(`note ${id} not found (${where})`);
    console.log(describe(note, 1, imageDir));
    return;
  }

  if (command === "reply") {
    const [id, ...words] = args;
    const text = words.join(" ").trim();
    if (!id || !text) fail('usage: reply <id> "<text>" [--keep-open]');
    await updateNote(src, id, flags["keep-open"] ? { reply: text } : { reply: text, status: "resolved" });
    console.log(`${id}: reply saved${flags["keep-open"] ? " (still open)" : ", resolved"}.`);
    return;
  }

  if (command === "resolve" || command === "reopen") {
    if (args.length === 0) fail(`usage: ${command} <id> [<id>...]`);
    for (const id of args) {
      await updateNote(src, id, { status: command === "resolve" ? "resolved" : "open" });
      console.log(`${id}: ${command === "resolve" ? "resolved" : "reopened"}.`);
    }
    return;
  }

  fail(`unknown command "${command}". Commands: pull, show, reply, resolve, reopen, key.`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
