// app/api/ui-feedback/route.js (or route.ts) — the endpoint of the feedback button (ui-feedback).
// Adjust the import paths to where you copied the templates (here: lib/ui-feedback/ with the "@/" alias).
import { createUiFeedbackHandler } from "@/lib/ui-feedback/ui-feedback-server.js";
import { createFileStore } from "@/lib/ui-feedback/ui-feedback-file-store.js";

// Notes are files in .ui-feedback/ (add it to .gitignore). On a deployed site, UI_FEEDBACK_KEY must be set
// in the server's environment; without it the endpoint is off in production.
const handler = createUiFeedbackHandler({ store: createFileStore() });

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;

// No route segment config on purpose: route handlers run on Node.js and aren't cached by default, this one
// reads the request, and Next.js 16 with Cache Components rejects `runtime` and `dynamic`.
