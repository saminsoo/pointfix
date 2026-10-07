import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createPointFixHandler, createMemoryStore, toNodeMiddleware } from "../plugins/pointfix/skills/pointfix/templates/pointfix-server.js";

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("../plugins/pointfix/skills/pointfix/scripts/pointfix.mjs", import.meta.url));
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const sample = (id, extra = {}) => ({
  id,
  createdAt: "2026-10-07T10:00:00.000Z",
  pageUrl: "/",
  pageTitle: "Home",
  comment: "Bigger button",
  devices: ["mobile"],
  viewport: { width: 390, height: 844 },
  userAgent: null,
  elements: [{ selector: "header > button", tag: "button", id: null, classes: [], text: "Buy", components: ["BuyButton"], source: "src/BuyButton.tsx:12", attributes: {}, rect: { x: 0, y: 0, width: 80, height: 32 }, layer: 0, styles: { position: "fixed", zIndex: "30" } }],
  hasImage: false,
  status: "open",
  reply: null,
  repliedAt: null,
  resolvedAt: null,
  ...extra,
});

/** Runs the CLI in `cwd` with a clean environment (no POINTFIX_* from the machine). */
const cli = (cwd, args, env = {}) => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("POINTFIX_")));
  return run(process.execPath, [CLI, ...args], { cwd, env: { ...clean, ...env } });
};

describe("local mode (.pointfix/ written by the dev server)", () => {
  test("lists, replies, resolves and reopens", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ufb-cli-"));
    try {
      await mkdir(path.join(cwd, ".pointfix"));
      await writeFile(path.join(cwd, ".pointfix", "aaaa1111.json"), JSON.stringify(sample("aaaa1111")));
      const listed = (await cli(cwd, ["pull"])).stdout;
      assert.match(listed, /1 open note/);
      assert.match(listed, /Bigger button/);
      assert.match(listed, /components: BuyButton/);
      assert.match(listed, /source: src\/BuyButton.tsx:12/);
      assert.match(listed, /for: mobile/);

      await cli(cwd, ["reply", "aaaa1111", "Understood: bigger. Done: 48px."]);
      const saved = JSON.parse(await readFile(path.join(cwd, ".pointfix", "aaaa1111.json"), "utf8"));
      assert.equal(saved.status, "resolved");
      assert.equal(saved.reply, "Understood: bigger. Done: 48px.");
      assert.match((await cli(cwd, ["pull"])).stdout, /0 open notes/);

      await cli(cwd, ["reopen", "aaaa1111"]);
      assert.match((await cli(cwd, ["pull"])).stdout, /1 open note/);
      await cli(cwd, ["reply", "aaaa1111", "Question: which button?", "--keep-open"]);
      assert.equal(JSON.parse(await readFile(path.join(cwd, ".pointfix", "aaaa1111.json"), "utf8")).status, "open");

      await assert.rejects(() => cli(cwd, ["reply", "../../x", "hi"]), /invalid id/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates a key", async () => {
    const { stdout } = await cli(os.tmpdir(), ["key"]);
    assert.match(stdout.trim(), /^[A-Za-z0-9_-]{40,}$/);
  });
});

describe("remote mode (a deployed site)", () => {
  test("pulls notes and screenshots with the key from .env.local, then replies", async () => {
    const KEY = "remote-key-0123456789abcdefghijklmn";
    const store = createMemoryStore();
    const handler = createPointFixHandler({ store, allowInDevelopment: false, key: KEY });
    const middleware = toNodeMiddleware(handler);
    const server = http.createServer((rq, rs) => void middleware(rq, rs));
    await new Promise((resolve) => server.listen(0, resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/pointfix`;
    await store.create({ ...sample("bbbb2222"), hasImage: true }, Uint8Array.from(Buffer.from(PNG_1PX, "base64")));
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ufb-cli-"));
    try {
      await writeFile(path.join(cwd, ".env.local"), `# feedback\nPOINTFIX_URL=${url}\nPOINTFIX_KEY="${KEY}"\n`);
      const listed = (await cli(cwd, ["pull"])).stdout;
      assert.match(listed, /1 open note/);
      assert.match(listed, /Screenshot: .*bbbb2222\.png/);
      assert.deepEqual((await readdir(path.join(cwd, ".pointfix-inbox"))).sort(), ["bbbb2222.png", "notes.json"]);

      await cli(cwd, ["reply", "bbbb2222", "Understood: x. Done: y."]);
      const updated = await store.get("bbbb2222");
      assert.equal(updated?.status, "resolved");
      assert.equal(updated?.reply, "Understood: x. Done: y.");

      await writeFile(path.join(cwd, ".env.local"), `POINTFIX_URL=${url}\nPOINTFIX_KEY=wrong\n`);
      await assert.rejects(() => cli(cwd, ["pull"]), /404/);
    } finally {
      server.close();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
