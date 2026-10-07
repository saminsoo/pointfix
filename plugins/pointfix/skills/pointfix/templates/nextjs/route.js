// app/api/pointfix/route.js (or route.ts) — the endpoint of the feedback button (pointfix).
// Adjust the import paths to where you copied the templates (here: lib/pointfix/ with the "@/" alias).
import { createPointFixHandler } from "@/lib/pointfix/pointfix-server.js";
import { createFileStore } from "@/lib/pointfix/pointfix-file-store.js";

// Notes are files in .pointfix/ (add it to .gitignore). On a deployed site, POINTFIX_KEY must be set
// in the server's environment; without it the endpoint is off in production.
const handler = createPointFixHandler({ store: createFileStore() });

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;

// No route segment config on purpose: route handlers run on Node.js and aren't cached by default, this one
// reads the request, and Next.js 16 with Cache Components rejects `runtime` and `dynamic`.
