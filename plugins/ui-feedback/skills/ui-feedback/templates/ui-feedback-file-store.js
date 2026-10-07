// @ts-check
/**
 * ui-feedback — file store (Node.js). Keeps each note as `<id>.json` (and its screenshot as `<id>.png`) in a
 * folder, `.ui-feedback/` at the project root by default. Add that folder to .gitignore.
 *
 * Good for local development and for a single server with a persistent disk (a VPS, a Docker volume).
 * On serverless hosts the disk is temporary: write a store for your database or object storage instead
 * (see the FeedbackStore type in ui-feedback-server.js).
 *
 * The "turbopackIgnore" comments tell Next.js not to bundle the whole project because of these dynamic paths.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/** @typedef {import("./ui-feedback-server.js").Note} Note */
/** @typedef {import("./ui-feedback-server.js").NoteStatus} NoteStatus */
/** @typedef {import("./ui-feedback-server.js").FeedbackStore} FeedbackStore */

const ID_PATTERN = /^[a-z0-9-]{4,64}$/;

/**
 * @param {{ dir?: string }} [options]  `dir`: absolute or relative to the working directory. Default
 *   `process.env.UI_FEEDBACK_DIR` or `.ui-feedback`.
 * @returns {FeedbackStore}
 */
export function createFileStore(options = {}) {
  const dir = path.resolve(/* turbopackIgnore: true */ options.dir ?? process.env.UI_FEEDBACK_DIR ?? ".ui-feedback");

  /** @param {string} id @param {"json" | "png"} ext */
  const file = (id, ext) => {
    if (!ID_PATTERN.test(id)) throw new Error("Invalid note id.");
    return path.join(/* turbopackIgnore: true */ dir, `${id}.${ext}`);
  };

  /** Writes to a temporary file and renames it, so a half-written note is never read. */
  async function writeAtomic(/** @type {string} */ target, /** @type {string | Uint8Array} */ data) {
    await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  }

  /** @param {string} id @returns {Promise<Note | null>} */
  async function read(id) {
    try {
      return JSON.parse(await fs.readFile(file(id, "json"), "utf8"));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
      throw error;
    }
  }

  return {
    async create(note, png) {
      if (png) await writeAtomic(file(note.id, "png"), png);
      await writeAtomic(file(note.id, "json"), `${JSON.stringify(note, null, 2)}\n`);
    },
    async list(status) {
      let names = [];
      try {
        names = await fs.readdir(/* turbopackIgnore: true */ dir);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return [];
        throw error;
      }
      const notes = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const note = await read(name.slice(0, -5)).catch(() => null);
        if (note && (status === "all" || note.status === status)) notes.push(note);
      }
      return notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    get: read,
    async update(id, patch) {
      const note = await read(id);
      if (!note) return null;
      const next = { ...note, ...patch, id };
      await writeAtomic(file(id, "json"), `${JSON.stringify(next, null, 2)}\n`);
      return next;
    },
    async image(id) {
      try {
        return new Uint8Array(await fs.readFile(file(id, "png")));
      } catch {
        return null;
      }
    },
    async remove(id) {
      const existed = (await read(id)) !== null;
      await fs.rm(file(id, "json"), { force: true });
      await fs.rm(file(id, "png"), { force: true });
      return existed;
    },
  };
}
