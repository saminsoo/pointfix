import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPointFixHandler, createMemoryStore, toNodeMiddleware } from "../plugins/pointfix/skills/pointfix/templates/pointfix-server.js";
import { createFileStore } from "../plugins/pointfix/skills/pointfix/templates/pointfix-file-store.js";

const ENDPOINT = "http://site.test/api/pointfix";
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const KEY = "test-key-0123456789abcdefghijklmnop";

const note = (overrides = {}) => ({
  pageUrl: "/cart?step=2",
  pageTitle: "Cart",
  comment: "Make the total bigger",
  devices: ["desktop"],
  viewport: { width: 1280, height: 800 },
  elements: [{ selector: "main > .total", tag: "p", id: null, classes: ["total"], text: "$12.40", components: ["CartTotal"], source: null, attributes: {}, rect: { x: 1, y: 2, width: 3, height: 4 }, layer: 0, styles: { position: "static" } }],
  image: `data:image/png;base64,${PNG_1PX}`,
  ...overrides,
});

const req = (query = "", init = {}) => new Request(`${ENDPOINT}${query}`, init);
const postJson = (body, headers = {}) => req("", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("development mode (no key needed)", () => {
  const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: true });

  test("shows the button and accepts a note", async () => {
    assert.deepEqual(await (await handler(req())).json(), { visible: true });
    const res = await handler(postJson(note()));
    assert.equal(res.status, 201);
    const { id } = await res.json();
    assert.match(id, /^[a-z0-9-]{8}$/);
    const { notes } = await (await handler(req("?notes"))).json();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].status, "open");
    assert.equal(notes[0].hasImage, true);
    assert.deepEqual(notes[0].devices, ["desktop"]);
    const image = await handler(req(`?image=${id}`));
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await image.arrayBuffer()).byteLength > 8, true);
  });

  test("replies and resolves with PATCH, then lists by status", async () => {
    const { id } = await (await handler(postJson(note({ comment: "Another one" })))).json();
    const res = await handler(req(`?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply: "Understood: … Done: …", status: "resolved" }) }));
    const { note: updated } = await res.json();
    assert.equal(updated.status, "resolved");
    assert.equal(updated.reply, "Understood: … Done: …");
    assert.ok(updated.repliedAt && updated.resolvedAt);
    const open = (await (await handler(req("?notes=open"))).json()).notes;
    assert.ok(open.every((n) => n.id !== id));
    const all = (await (await handler(req("?notes=all"))).json()).notes;
    assert.ok(all.some((n) => n.id === id));
  });

  test("the notes page escapes everything that comes from a note", async () => {
    await handler(postJson(note({ comment: "<script>alert(1)</script>", pageUrl: '/x?"><img src=x onerror=alert(1)>' })));
    const html = await (await handler(req("?view=all"))).text();
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!html.includes("<img src=x onerror"));
  });

  test("rejects incomplete or malformed notes", async () => {
    const cases = [
      [note({ comment: "  " }), /what should change/i],
      [note({ devices: [] }), /screen/i],
      [note({ devices: ["tv"] }), /screen/i],
      [note({ pageUrl: "https://evil.example/" }), /page url/i],
      [note({ image: "data:image/svg+xml;base64,PHN2Zz4=" }), /png data url/i],
      [note({ image: `data:image/png;base64,${Buffer.from("not a png at all").toString("base64")}` }), /not a png/i],
    ];
    for (const [body, message] of cases) {
      const res = await handler(postJson(body));
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.match((await res.json()).error, message);
    }
    assert.equal((await handler(req("", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status, 400);
  });

  test("caps the image size", async () => {
    const small = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: true, maxImageBytes: 10 });
    const res = await small(postJson(note()));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /too large/i);
  });
});

describe("production", () => {
  test("without a key the feature is off", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, key: "" });
    assert.deepEqual(await (await handler(req())).json(), { visible: false });
    assert.equal((await handler(postJson(note()))).status, 404);
    assert.equal((await handler(req("?view"))).status, 404);
    assert.equal((await handler(req("?notes"))).status, 404);
    assert.equal((await handler(req(`?enable=anything`))).status, 404);
  });

  test("the activation link sets a cookie that unlocks the button, and a wrong key does nothing", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, key: KEY });
    assert.deepEqual(await (await handler(req())).json(), { visible: false });
    assert.equal((await handler(req("?enable=wrong-key"))).status, 404);

    const enable = await handler(req(`?enable=${KEY}&next=/shop`));
    assert.equal(enable.status, 303);
    assert.equal(enable.headers.get("location"), "/shop");
    const cookie = enable.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^pointfix=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Lax/);
    assert.ok(!cookie.includes(KEY), "the cookie must not contain the key itself");

    const value = cookie.split(";")[0];
    assert.deepEqual(await (await handler(req("", { headers: { cookie: value } }))).json(), { visible: true });
    assert.equal((await handler(postJson(note(), { cookie: value }))).status, 201);
    assert.equal((await handler(postJson(note(), { cookie: "pointfix=forged" }))).status, 404);
  });

  test("the activation link never redirects to another site", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, key: KEY });
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const res = await handler(req(`?enable=${KEY}&next=${encodeURIComponent(next)}`));
      assert.equal(res.headers.get("location"), "/");
    }
  });

  test("scripts use the key as a Bearer token", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, key: KEY });
    assert.equal((await handler(req("?notes", { headers: { authorization: "Bearer nope" } }))).status, 404);
    const ok = await handler(req("?notes", { headers: { authorization: `Bearer ${KEY}` } }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { notes: [] });
  });

  test("an extra isAllowed check (e.g. an admin session) also unlocks it", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, isAllowed: (r) => r.headers.get("x-admin") === "1" });
    assert.deepEqual(await (await handler(req("", { headers: { "x-admin": "1" } }))).json(), { visible: true });
    assert.deepEqual(await (await handler(req())).json(), { visible: false });
  });
});

describe("notes page forms", () => {
  const form = (fields, origin) =>
    req("", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) }, body: new URLSearchParams(fields).toString() });

  test("resolve, reopen and delete from the same site; other origins are refused", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: true });
    const { id } = await (await handler(postJson(note()))).json();
    assert.equal((await handler(form({ action: "resolve", id }, "https://evil.example"))).status, 403);
    assert.equal((await handler(form({ action: "resolve", id }, "null"))).status, 403);

    const resolved = await handler(form({ action: "resolve", id, back: "all", lang: "es" }, "http://site.test"));
    assert.equal(resolved.status, 303);
    assert.equal(resolved.headers.get("location"), "/api/pointfix?view=all&lang=es");
    assert.equal((await (await handler(req("?notes=resolved"))).json()).notes.length, 1);

    await handler(form({ action: "reopen", id }, "http://site.test"));
    assert.equal((await (await handler(req("?notes=open"))).json()).notes.length, 1);

    await handler(form({ action: "delete", id }, "http://site.test"));
    assert.equal((await (await handler(req("?notes=all"))).json()).notes.length, 0);
    assert.equal((await handler(req(`?image=${id}`))).status, 404);
  });
});

describe("file store", () => {
  test("keeps notes and screenshots as files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ufb-"));
    try {
      const handler = createPointFixHandler({ store: createFileStore({ dir }), allowInDevelopment: true });
      const { id } = await (await handler(postJson(note()))).json();
      const fresh = createFileStore({ dir }); // a new instance reads what the other wrote
      assert.equal((await fresh.get(id))?.comment, "Make the total bigger");
      assert.ok((await fresh.image(id))?.length);
      assert.equal((await fresh.list("open")).length, 1);
      await fresh.update(id, { status: "resolved", reply: "Done" });
      assert.equal((await fresh.list("resolved"))[0].reply, "Done");
      assert.equal(await fresh.remove(id), true);
      assert.equal(await fresh.get(id), null);
      await assert.rejects(() => fresh.get("../../etc/passwd"));
      assert.deepEqual(await createFileStore({ dir: path.join(dir, "missing") }).list("all"), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Node adapter", () => {
  test("works behind http.createServer, including cookies and redirects", async () => {
    const handler = createPointFixHandler({ store: createMemoryStore(), allowInDevelopment: false, key: KEY });
    const middleware = toNodeMiddleware(handler);
    const server = http.createServer((rq, rs) => void middleware(rq, rs));
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/pointfix`;
    try {
      const enable = await fetch(`${base}?enable=${KEY}`, { redirect: "manual" });
      assert.equal(enable.status, 303);
      const cookie = (enable.headers.get("set-cookie") ?? "").split(";")[0];
      assert.deepEqual(await (await fetch(base, { headers: { cookie } })).json(), { visible: true });
      const created = await fetch(base, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(note()) });
      assert.equal(created.status, 201);
    } finally {
      server.close();
    }
  });
});
