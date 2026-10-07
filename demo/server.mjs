// Try ui-feedback in one minute, with no project: `npm run demo`, then open http://localhost:4321
// (add ?lang=es for Spanish). Notes are saved in demo/.ui-feedback/. Then, in another terminal:
//   node plugins/ui-feedback/skills/ui-feedback/scripts/ui-feedback.mjs pull --dir demo/.ui-feedback
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUiFeedbackHandler, toNodeMiddleware } from "../plugins/ui-feedback/skills/ui-feedback/templates/ui-feedback-server.js";
import { createFileStore } from "../plugins/ui-feedback/skills/ui-feedback/templates/ui-feedback-file-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const templates = path.join(here, "../plugins/ui-feedback/skills/ui-feedback/templates");
const port = Number(process.env.PORT ?? 4321);

const feedback = toNodeMiddleware(
  createUiFeedbackHandler({
    store: createFileStore({ dir: process.env.UI_FEEDBACK_DIR ?? path.join(here, ".ui-feedback") }),
    allowInDevelopment: process.env.DEMO_PRODUCTION !== "1",
  })
);

/** A generated "photo" (SVG) so the demo works offline. */
function photo(/** @type {number} */ seed) {
  const hue = (seed * 67) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 60%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 35%)"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#g)"/><circle cx="${300 + seed * 90}" cy="320" r="160" fill="rgba(255,255,255,.35)"/>
<text x="60" y="740" font-family="sans-serif" font-size="90" fill="white">Photo ${seed}</text></svg>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/ui-feedback") return void (await feedback(req, res));
    if (url.pathname === "/ui-feedback-widget.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return void res.end(await readFile(path.join(templates, "ui-feedback-widget.js")));
    }
    const m = /^\/photo-(\d)\.svg$/.exec(url.pathname);
    if (m) {
      res.setHeader("Content-Type", "image/svg+xml");
      return void res.end(photo(Number(m[1])));
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return void res.end(await readFile(path.join(here, "index.html")));
    }
    res.statusCode = 404;
    res.end("Not found");
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Error");
  }
});

server.listen(port, () => console.log(`ui-feedback demo: http://localhost:${port}  (Spanish: http://localhost:${port}/?lang=es)`));
