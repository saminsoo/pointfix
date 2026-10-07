// @ts-check
/**
 * ui-feedback — browser widget.
 *
 * A floating button for the site owner: pick elements on the page layer by layer (like the browser's
 * inspector), capture the screen with them numbered, draw on it, choose the screens the change is for
 * (desktop / tablet / mobile) and leave a comment. Notes go to the ui-feedback endpoint; Claude reads
 * them with scripts/ui-feedback.mjs, applies the changes and replies on each note.
 *
 * Plain JavaScript, no framework and no dependencies. Everything renders inside a Shadow DOM, so the page's
 * CSS can't break it and its CSS can't leak into the page. Works in React, Next.js, Vue, Svelte, Angular
 * and plain HTML.
 *
 *   import { mountUiFeedback } from "./ui-feedback-widget.js";
 *   mountUiFeedback({ loadHtml2Canvas: () => import("html2canvas-pro") });
 *
 * The button only appears when the server says so (development, or a browser that opened the activation
 * link). Customers never see it.
 */

/** @typedef {"desktop" | "tablet" | "mobile"} Device */
/** @typedef {"en" | "es"} Locale */

/**
 * @typedef {object} UiFeedbackOptions
 * @property {string} [endpoint]  The server endpoint. Default "/api/ui-feedback".
 * @property {Locale} [locale]  Default: from <html lang>, else the browser language.
 * @property {"bottom-left" | "bottom-right"} [position]  Where the round button sits. Default "bottom-left".
 * @property {string} [bottomOffset]  CSS length from the bottom, e.g. "calc(var(--bottom-bar-h) + 16px)". Default "16px".
 * @property {string} [accentColor]  Default "#f97316".
 * @property {{ tablet: number, desktop: number }} [breakpoints]  Widths where tablet and desktop start (px). Default 768 / 1024.
 * @property {() => Promise<unknown>} [loadHtml2Canvas]  Loads html2canvas-pro, e.g. () => import("html2canvas-pro"). Default: a CDN.
 * @property {boolean} [tabCapture]  Use the browser's exact tab capture when possible (HTTPS + mouse). The browser asks
 *   for permission on every capture, so it is off by default; the page copy (html2canvas) is used instead.
 * @property {boolean} [checkVisibility]  Ask the server first whether to show the button. Default true.
 * @property {number} [zIndex]  Default 2147483000.
 */

/**
 * @typedef {object} NoteElement
 * @property {string} selector
 * @property {string} tag
 * @property {string | null} id
 * @property {string[]} classes
 * @property {string} text
 * @property {string[]} components
 * @property {string | null} source
 * @property {Record<string, string>} attributes
 * @property {{ x: number, y: number, width: number, height: number }} rect
 * @property {number} layer
 * @property {Record<string, string>} styles
 */

const CDN_HTML2CANVAS = "https://cdn.jsdelivr.net/npm/html2canvas-pro@2/+esm";

const STRINGS = {
  en: {
    fab: "Point out a change on this page",
    pickTitle: "Pick elements",
    hint: "Click an element on the page. Then move through its layers (above, below, container, inside) and pick one or more.",
    layerOf: (/** @type {number} */ i, /** @type {number} */ n) => `Layer ${i} of ${n}:`,
    above: "Layer above",
    below: "Layer below",
    container: "Container",
    inside: "Inside",
    pickThis: "Pick this",
    pickAnother: "Pick another",
    capture: (/** @type {number} */ n) => (n > 0 ? `Capture & comment (${n})` : "Capture without picking"),
    cancel: "Cancel",
    moveDown: "Move this window to the bottom",
    moveUp: "Move this window to the top",
    minimize: "Minimize",
    picking: (/** @type {number} */ n) => (n > 0 ? `Picking · ${n}` : "Picking"),
    removePicked: (/** @type {number} */ i) => `Remove element ${i}`,
    picked: "Picked elements",
    notes: "Notes",
    annotateTitle: "Mark and comment",
    markTools: "Marking tools",
    pen: "Pen",
    box: "Box",
    arrow: "Arrow",
    colors: ["Red", "Yellow", "Blue"],
    undo: "Undo",
    clear: "Clear marks",
    screens: "Which screens is this change for?",
    devices: { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" },
    screensHint: (/** @type {string} */ current) => `The screen you're using (${current}) comes selected. Add others if the change applies there too.`,
    commentLabel: "What should change?",
    placeholder: "E.g.: element 1 covers element 2; it should sit below the menu.",
    noScreen: "Pick at least one screen.",
    noComment: "Write what you want changed (for example: “smaller”, “move it right”, “remove it”).",
    nothingMarkedTitle: "You didn't pick any element or mark anything on the screenshot.",
    nothingMarkedText: "Without that it may not be clear what you mean.",
    backToPick: "Back to picking",
    sendAnyway: "Send anyway",
    send: "Send note",
    sending: "Sending…",
    sent: "Note sent. Ask Claude to “review the UI feedback”.",
    sendError: "The note couldn't be sent.",
    timeout: "The server took too long. Try again.",
    network: "Couldn't connect. Try again.",
    captureError: "Couldn't capture the screen. Try again.",
    screenshotAlt: "Screenshot of the page to mark",
    close: "Close",
  },
  es: {
    fab: "Señalar un cambio en esta página",
    pickTitle: "Señalar elementos",
    hint: "Toca un elemento de la página. Después muévete por sus capas (de arriba, de abajo, contenedor e interior) y señala uno o varios.",
    layerOf: (/** @type {number} */ i, /** @type {number} */ n) => `Capa ${i} de ${n}:`,
    above: "Capa de arriba",
    below: "Capa de abajo",
    container: "Contenedor",
    inside: "Interior",
    pickThis: "Señalar este",
    pickAnother: "Elegir otro",
    capture: (/** @type {number} */ n) => (n > 0 ? `Capturar y comentar (${n})` : "Capturar sin señalar"),
    cancel: "Cancelar",
    moveDown: "Mover esta ventana abajo",
    moveUp: "Mover esta ventana arriba",
    minimize: "Minimizar",
    picking: (/** @type {number} */ n) => (n > 0 ? `Señalando · ${n}` : "Señalando"),
    removePicked: (/** @type {number} */ i) => `Quitar el elemento ${i}`,
    picked: "Elementos señalados",
    notes: "Notas",
    annotateTitle: "Marcar y comentar",
    markTools: "Herramientas de marca",
    pen: "Lápiz",
    box: "Rectángulo",
    arrow: "Flecha",
    colors: ["Rojo", "Amarillo", "Azul"],
    undo: "Deshacer",
    clear: "Borrar marcas",
    screens: "¿Para qué pantallas es el cambio?",
    devices: { desktop: "PC", tablet: "Tablet", mobile: "Celular" },
    screensHint: (/** @type {string} */ current) => `Viene marcada la pantalla que estás usando (${current}). Marca otras si el cambio también va ahí.`,
    commentLabel: "¿Qué hay que cambiar?",
    placeholder: "Ej.: el número 1 tapa al 2; debería quedar debajo del menú.",
    noScreen: "Elige al menos una pantalla.",
    noComment: "Escribe qué quieres cambiar (por ejemplo: «más pequeño», «a la derecha», «eliminar»).",
    nothingMarkedTitle: "No señalaste ningún elemento ni marcaste nada en la captura.",
    nothingMarkedText: "Sin eso puede no quedar claro a qué te refieres.",
    backToPick: "Volver a señalar",
    sendAnyway: "Enviar igual",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Observación enviada. Pídele a Claude «revisa las observaciones».",
    sendError: "No se pudo enviar la observación.",
    timeout: "El servidor tardó demasiado. Intenta de nuevo.",
    network: "No se pudo conectar. Intenta de nuevo.",
    captureError: "No se pudo capturar la pantalla. Intenta de nuevo.",
    screenshotAlt: "Captura de la página para marcar",
    close: "Cerrar",
  },
};

/** Simple stroke icons (24×24). Static data: only these paths are ever drawn. */
const ICONS = {
  note: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", "M12 7v6", "M9 10h6"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  plus: ["M12 5v14", "M5 12h14"],
  above: ["m17 11-5-5-5 5", "m17 18-5-5-5 5"],
  below: ["m7 6 5 5 5-5", "m7 13 5 5 5-5"],
  up: ["M12 19V5", "m5 12 7-7 7 7"],
  down: ["M12 5v14", "m19 12-7 7-7-7"],
  camera: ["M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  swap: ["M8 3v18", "m4 7 4-4 4 4", "M16 21V3", "m12 17 4 4 4-4"],
  minimize: ["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"],
  maximize: ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"],
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  box: ["M5 5h14v14H5z"],
  arrow: ["M7 17 17 7", "M7 7h10v10"],
  undo: ["M9 14 4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-1"],
  clear: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  send: ["m22 2-7 20-4-9-9-4z", "M22 2 11 13"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  spinner: ["M21 12a9 9 0 1 1-6.2-8.6"],
};

const COLORS = ["#e11d48", "#f59e0b", "#2563eb"];

/** Computed styles that help locate a layout problem (layers, sizes, position, colors). */
const STYLE_KEYS = ["position", "zIndex", "top", "right", "bottom", "left", "display", "width", "height", "overflow", "opacity", "transform", "color", "backgroundColor", "fontSize", "fontWeight", "padding", "margin"];
const ATTRIBUTE_KEYS = ["data-testid", "data-test", "data-cy", "aria-label", "role", "name", "type", "href", "alt", "title", "placeholder"];

const STYLES = `
:host{all:initial}
*{box-sizing:border-box}
.ufb,.toast{font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#171412}
button,a.btn,textarea{font:inherit}
button:focus-visible,a:focus-visible,textarea:focus-visible{outline:3px solid #3b82f6;outline-offset:2px}
.fab{position:fixed;left:16px;bottom:var(--ufb-bottom,16px);width:48px;height:48px;border-radius:999px;border:2px solid #fff;background:#171412;color:#fff;display:grid;place-items:center;cursor:pointer;pointer-events:auto;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.fab.right{left:auto;right:16px}
.fab:hover{background:#2f2a27}
.overlay{position:fixed;inset:0;cursor:crosshair;pointer-events:auto}
.boxes{position:fixed;inset:0;pointer-events:none}
.box{position:fixed;border-radius:3px;pointer-events:none}
.box.hover{border:2px solid #38bdf8;background:rgba(56,189,248,.1)}
.box.focus{border:2px dashed #2563eb;background:rgba(37,99,235,.15)}
.box.picked{border:3px solid var(--ufb-accent);background:rgba(249,115,22,.08)}
.num{position:absolute;top:-12px;left:-12px;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:var(--ufb-accent);color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.toolbar{position:fixed;left:8px;right:8px;top:8px;margin:0 auto;max-width:760px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.08);padding:10px 12px 12px;pointer-events:auto;display:grid;gap:8px}
.toolbar.bottom{top:auto;bottom:8px}
.head{display:flex;align-items:center;gap:2px}
.head strong{font-size:14px}
.spacer{flex:1}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid #d6d3d1;background:#fff;color:#171412;cursor:pointer;text-decoration:none;font-weight:600;font-size:14px}
.btn:hover:not(:disabled){background:#f5f5f4}
.btn:disabled{opacity:.45;cursor:default}
.btn.primary{background:var(--ufb-accent);border-color:var(--ufb-accent);color:#171412}
.btn.primary:hover:not(:disabled){filter:brightness(.95);background:var(--ufb-accent)}
.btn.dark,.btn[aria-pressed="true"]{background:#171412;border-color:#171412;color:#fff}
.btn.dark:hover:not(:disabled){background:#2f2a27}
.icon-btn{width:44px;height:44px;display:grid;place-items:center;border:0;background:transparent;border-radius:12px;color:#44403c;cursor:pointer}
.icon-btn:hover{background:#f5f5f4}
.hint{margin:0;color:#44403c}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:#f5f5f4;padding:1px 4px;border-radius:4px;word-break:break-all}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.chip{display:flex;align-items:center;gap:4px;padding:2px 2px 2px 10px;border-radius:999px;background:#fff7ed;box-shadow:inset 0 0 0 1px #fdba74;font-size:12px}
.chip .label{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip button{width:28px;height:28px;border:0;background:transparent;border-radius:999px;cursor:pointer;display:grid;place-items:center;color:#171412}
.foot{border-top:1px solid #e7e5e4;padding-top:8px}
.pill{position:fixed;right:8px;top:8px;pointer-events:auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:0;background:#171412;color:#fff;font-weight:600;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.3)}
.pill.bottom{top:auto;bottom:8px}
.backdrop{position:fixed;inset:0;background:rgba(23,20,18,.8);pointer-events:auto;display:flex;padding:8px}
.panel{margin:auto;width:100%;max-width:1200px;height:100%;background:#fff;border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto}
.main{flex:none;height:62vh;min-height:300px;display:flex;flex-direction:column;gap:8px}
.stage{flex:1;min-height:0;overflow:auto;background:#f5f5f4;border-radius:12px;display:flex;align-items:flex-start;justify-content:center}
.canvas{display:block;max-width:100%;max-height:100%;width:auto;height:auto;cursor:crosshair;touch-action:none}
.side{display:flex;flex-direction:column;gap:8px;flex-shrink:0}
@media (min-width:1024px){.panel{flex-direction:row;overflow:hidden}.main{flex:1;height:auto;min-height:0}.side{width:330px;overflow:auto}}
.sep{width:1px;height:24px;background:#d6d3d1;margin:0 4px}
.swatch{width:44px;height:44px;border-radius:999px;border:4px solid #fff;box-shadow:0 0 0 1px #d6d3d1;cursor:pointer}
.swatch[aria-pressed="true"]{border-color:#171412}
.list{background:#f5f5f4;border-radius:12px;padding:8px;font-size:13px}
.list ol{margin:4px 0 0;padding:0;list-style:none;display:grid;gap:4px}
.list li{display:flex;gap:8px}
.n{flex:none;width:20px;height:20px;border-radius:999px;background:var(--ufb-accent);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center}
fieldset{border:0;margin:0;padding:0;display:grid;gap:6px}
legend,.lbl{font-weight:700;font-size:14px;padding:0;margin:0 0 4px}
.small{font-size:12px;color:#57534e;margin:0}
textarea{width:100%;min-height:110px;border:1px solid #d6d3d1;border-radius:12px;padding:8px;font-size:16px;resize:vertical;color:#171412;background:#fff}
textarea[aria-invalid="true"]{border-color:#dc2626}
.notice{border-radius:12px;padding:8px 10px;font-size:13px}
.notice.error{background:#fef2f2;color:#991b1b;box-shadow:inset 0 0 0 1px #fecaca;font-weight:600}
.notice.warn{background:#fffbeb;color:#78350f;box-shadow:inset 0 0 0 1px #fcd34d;display:grid;gap:8px}
.notice p{margin:0}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(92vw,520px);background:#171412;color:#fff;padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .2s}
.toast.show{opacity:1}
.spin{animation:ufb-spin 1s linear infinite}
@keyframes ufb-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}.toast{transition:none}}
`;

/** Device for a viewport width, with the project's breakpoints. */
export function deviceForWidth(/** @type {number} */ width, breakpoints = { tablet: 768, desktop: 1024 }) {
  if (width < breakpoints.tablet) return /** @type {Device} */ ("mobile");
  if (width < breakpoints.desktop) return /** @type {Device} */ ("tablet");
  return /** @type {Device} */ ("desktop");
}

/**
 * Small element factory. Text always goes through text nodes (never innerHTML), so names and texts
 * taken from the page can't inject markup.
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node | string | null | false | undefined | (Node | string | null | false | undefined)[])} children
 * @returns {HTMLElement}
 */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), /** @type {EventListener} */ (v));
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

/** @param {keyof typeof ICONS} name @param {number} [size] */
function icon(name, size = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) {
    svg.setAttribute(k, String(v));
  }
  for (const d of ICONS[name]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/* ------------------------------------------------------------------------------------------------ */
/* Describing elements                                                                              */
/* ------------------------------------------------------------------------------------------------ */

/** One selector step: tag, #id or up to two simple classes, and its position among same-tag siblings. */
function selectorPart(/** @type {Element} */ el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${cssEscape(el.id)}`;
  const simple = Array.from(el.classList)
    .filter((c) => /^[a-z][a-z0-9_-]*$/i.test(c))
    .slice(0, 2);
  let part = tag + simple.map((c) => `.${c}`).join("");
  const parent = el.parentElement;
  if (parent) {
    const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`;
  }
  return part;
}

/** @param {string} value */
function cssEscape(value) {
  return typeof window.CSS?.escape === "function" ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/** Short CSS path (up to 6 steps, or up to an #id). */
export function cssPath(/** @type {Element} */ el) {
  const parts = [];
  /** @type {Element | null} */
  let node = el;
  while (node && node !== document.body && node !== document.documentElement && parts.length < 6) {
    parts.unshift(selectorPart(node));
    if (node.id) break;
    node = node.parentElement;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

/** A readable name for the toolbar: `button «Add to cart»`, `div.card`. */
export function shortLabel(/** @type {Element} */ el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const label = el.getAttribute("aria-label") || el.getAttribute("alt");
  const text = /** @type {HTMLElement} */ (el).innerText?.trim().replace(/\s+/g, " ") ?? "";
  if (label) return `${tag} «${label.slice(0, 40)}»`;
  if (text && text.length <= 40) return `${tag} «${text}»`;
  const classes = Array.from(el.classList).slice(0, 3).join(".");
  return classes ? `${tag}.${classes}` : tag;
}

/**
 * Components that frameworks wrap around every page (routers, boundaries, providers). They say nothing about
 * where an element is in the project's code, so they're left out of `components`.
 */
const FRAMEWORK_COMPONENTS = new Set([
  // Next.js
  "AppRouter", "Router", "Root", "ServerRoot", "HotReload", "ReactDevOverlay", "AppDevOverlay", "AppDevOverlayErrorBoundary",
  "RootErrorBoundary", "ErrorBoundary", "ErrorBoundaryHandler", "GlobalError", "DevRootHTTPAccessFallbackBoundary",
  "HTTPAccessFallbackBoundary", "HTTPAccessFallbackErrorBoundary", "RedirectBoundary", "RedirectErrorBoundary",
  "LoadingBoundary", "OuterLayoutRouter", "InnerLayoutRouter", "LayoutRouterContext", "RenderFromTemplateContext",
  "TemplateContext", "ScrollAndFocusHandler", "InnerScrollAndFocusHandler", "ScrollHandler", "InnerScrollHandler",
  "SegmentViewNode", "SegmentViewStateNode", "SegmentBoundaryTriggerNode", "SegmentStateProvider", "ClientPageRoot",
  "ClientSegmentRoot", "MetadataBoundary", "ViewportBoundary", "OutletBoundary", "MetadataOutlet", "AsyncMetadataOutlet",
  "HistoryUpdater", "RuntimeStyles", "AppRouterAnnouncer", "NotFoundBoundary", "NotFoundErrorBoundary",
  "DevRootNotFoundBoundary", "PathnameContextProviderAdapter", "AppContainer",
  // React Router / Remix
  "RouterProvider", "DataRoutes", "RenderedRoute", "RenderErrorBoundary", "Routes", "Route", "Outlet", "HydratedRouter",
  "BrowserRouter", "RemixErrorBoundary", "RemixBrowser", "RemixRoute", "WithComponentProps", "WithErrorBoundaryProps",
  "WithHydrateFallbackProps",
  // Vue / Nuxt
  "RouterView", "RouterLink", "Transition", "TransitionGroup", "BaseTransition", "KeepAlive", "Suspense", "Teleport",
  "NuxtRoot", "NuxtLayout", "NuxtPage", "NuxtErrorBoundary", "RouteProvider", "ClientOnly", "NuxtLoadingIndicator",
]);

/** Context providers and consumers: wiring, not places where markup is written. */
const REACT_CONTEXT_TYPES = new Set([Symbol.for("react.context"), Symbol.for("react.provider"), Symbol.for("react.consumer")]);

/** The name of a React fiber's component, or of a server component's debug info (React 19). */
function reactName(/** @type {any} */ item) {
  if (!item) return null;
  if (typeof item.name === "string" && !("tag" in item)) return item.name;
  const type = item.type;
  if (!type || typeof type === "string" || REACT_CONTEXT_TYPES.has(type.$$typeof)) return null;
  return type.displayName || type.name || type.render?.displayName || type.render?.name || type.type?.displayName || type.type?.name;
}

/**
 * Components that render the element, nearest first, and, when the framework exposes it in development, its
 * source file. Best effort: React, Vue 2/3, Svelte and Angular keep this on DOM nodes in dev builds;
 * production builds usually don't (or minify the names), and then the selector and the text are what's left.
 * @param {Element} el
 */
function frameworkInfo(el) {
  /** @type {string[]} */
  const components = [];
  /** @type {string | null} */
  let source = null;
  const node = /** @type {Record<string, any>} */ (/** @type {unknown} */ (el));
  const add = (/** @type {unknown} */ raw) => {
    if (typeof raw !== "string" || components.length >= 8) return;
    const name = raw.replace(/^_+/, "");
    if (/^[A-Z]\w{2,}$/.test(name) && !FRAMEWORK_COMPONENTS.has(name) && !components.includes(name)) components.push(name);
  };
  try {
    const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    let fiber = key ? node[key] : null;
    for (let steps = 0; fiber && components.length < 8 && steps < 500; steps++) {
      add(reactName(fiber));
      // React 19 dev: server components that produced this part of the tree, and the component whose JSX
      // created the element (its "owner") — for server-rendered markup that's the only trace of the page's code.
      if (Array.isArray(fiber._debugInfo)) for (const info of fiber._debugInfo) add(reactName(info));
      add(reactName(fiber._debugOwner));
      if (!source && fiber._debugSource?.fileName) source = `${fiber._debugSource.fileName}:${fiber._debugSource.lineNumber}`;
      fiber = fiber.return;
    }
  } catch {
    /* not React, or a different internal shape */
  }
  try {
    let inst = node.__vueParentComponent;
    while (inst && components.length < 8) {
      add(inst.type?.name || inst.type?.__name);
      if (!source && inst.type?.__file) source = inst.type.__file;
      inst = inst.parent;
    }
    let vm = node.__vue__;
    while (vm && components.length < 8) {
      add(vm.$options?.name || vm.$options?._componentTag);
      if (!source && vm.$options?.__file) source = vm.$options.__file;
      vm = vm.$parent;
    }
  } catch {
    /* not Vue */
  }
  try {
    /** @type {any} */
    let current = node;
    while (current && !source) {
      const loc = current.__svelte_meta?.loc;
      if (loc?.file) source = `${loc.file}:${(loc.line ?? 0) + 1}`;
      current = current.parentElement;
    }
  } catch {
    /* not Svelte */
  }
  try {
    const ng = /** @type {any} */ (window).ng;
    if (ng?.getOwningComponent) add(ng.getOwningComponent(el)?.constructor?.name);
  } catch {
    /* not Angular */
  }
  return { components, source };
}

/** Everything Claude needs to find the element in the code. */
export function describeElement(/** @type {Element} */ el, /** @type {number} */ layer) {
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);
  /** @type {Record<string, string>} */
  const styles = {};
  for (const k of STYLE_KEYS) {
    const value = computed.getPropertyValue(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
    if (value && value !== "auto" && value !== "none" && value !== "normal") styles[k] = value.slice(0, 200);
  }
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const k of ATTRIBUTE_KEYS) {
    const value = el.getAttribute(k);
    if (value) attributes[k] = value.slice(0, 200);
  }
  const { components, source } = frameworkInfo(el);
  return /** @type {NoteElement} */ ({
    selector: cssPath(el).slice(0, 800),
    tag: el.tagName.toLowerCase(),
    id: el.id ? el.id.slice(0, 120) : null,
    classes: Array.from(el.classList).slice(0, 60).map((c) => c.slice(0, 160)),
    text: (/** @type {HTMLElement} */ (el).innerText ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 300),
    components,
    source,
    attributes,
    rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
    layer: Math.min(layer, 500),
    styles,
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* Capture                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/** Waits until the browser has painted the latest change (e.g. after hiding the widget). */
function nextFrames() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @typedef {{ left: number, top: number, right: number, bottom: number }} Box */

/** @param {Box} a @param {Box} b @returns {Box | null} */
function intersect(a, b) {
  const box = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return box.right > box.left && box.bottom > box.top ? box : null;
}

/**
 * Exact capture of the current tab (desktop browsers, HTTPS or localhost). The browser asks for permission
 * every time; if it's refused or not available, returns null and the page copy is used instead.
 * @returns {Promise<{ canvas: HTMLCanvasElement, scale: number } | null>}
 */
async function captureTab() {
  const media = navigator.mediaDevices;
  if (!window.isSecureContext || !media?.getDisplayMedia || !window.matchMedia("(pointer: fine)").matches) return null;
  /** @type {MediaStream} */
  let stream;
  try {
    stream = await media.getDisplayMedia(/** @type {DisplayMediaStreamOptions} */ ({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" }));
  } catch {
    return null;
  }
  try {
    const track = stream.getVideoTracks()[0];
    if (!track || /** @type {any} */ (track.getSettings()).displaySurface !== "browser") return null;
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await wait(400);
    await nextFrames();
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return { canvas, scale: canvas.width / window.innerWidth };
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}

/** The part of the image's box where its pixels are actually drawn (object-fit / object-position). */
function objectFitBox(/** @type {HTMLImageElement} */ img, /** @type {DOMRect} */ r, /** @type {CSSStyleDeclaration} */ cs) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  let w = r.width;
  let h = r.height;
  const fit = cs.objectFit;
  if (fit === "contain" || fit === "cover" || fit === "none" || fit === "scale-down") {
    const contain = Math.min(r.width / nw, r.height / nh);
    const scale = fit === "cover" ? Math.max(r.width / nw, r.height / nh) : fit === "contain" ? contain : fit === "none" ? 1 : Math.min(1, contain);
    w = nw * scale;
    h = nh * scale;
  }
  const [px = "50%", py = "50%"] = (cs.objectPosition || "50% 50%").split(/\s+/);
  const offset = (/** @type {string} */ v, /** @type {number} */ free) => {
    if (v === "left" || v === "top") return 0;
    if (v === "right" || v === "bottom") return free;
    if (v === "center") return free / 2;
    if (v.endsWith("%")) return (parseFloat(v) / 100) * free;
    return parseFloat(v) || 0;
  };
  return { left: r.left + offset(px, r.width - w), top: r.top + offset(py, r.height - h), width: w, height: h };
}

/** The visible area of an element after the overflow of its ancestors clips it (null if nothing clips it). */
function clipBox(/** @type {Element} */ el) {
  /** @type {Box | null} */
  let clip = null;
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      const r = node.getBoundingClientRect();
      const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      clip = clip ? intersect(clip, box) ?? { left: 0, top: 0, right: 0, bottom: 0 } : box;
    }
    if (cs.position === "fixed") break;
    node = node.parentElement;
  }
  return clip;
}

/**
 * Paints an image as the page shows it (object-fit included) on a canvas the size of `area`, as a PNG data URL.
 * @param {HTMLImageElement} img
 * @param {{ left: number, top: number, width: number, height: number }} box  Where the image is laid out.
 * @param {Box} area  The part to paint.
 * @param {CSSStyleDeclaration} cs
 * @param {number} alpha
 */
function paintImage(img, box, area, cs, alpha) {
  const content = objectFitBox(img, /** @type {DOMRect} */ (box), cs);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((area.right - area.left) * ratio));
  canvas.height = Math.max(1, Math.round((area.bottom - area.top) * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  ctx.globalAlpha = alpha;
  try {
    ctx.drawImage(img, content.left - area.left, content.top - area.top, content.width, content.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null; // image from another origin without CORS: the canvas is locked, leave it to html2canvas
  }
}

/**
 * Copy of the page drawn with html2canvas (mobile, tablet, plain HTTP, or when the tab capture is refused).
 * Two html2canvas weak spots are handled first, by painting those images here exactly as seen:
 * - images inside a box that crops them (photo thumbnails, avatars) are sometimes drawn uncropped over the whole
 *   capture: they're hidden in the copy and their visible part is laid on top;
 * - SVG images without their own width and height (most logos) come out zoomed in and cut: the copy gets a PNG
 *   of them instead.
 * (Boxes with their own scroll are fine: html2canvas keeps their scroll position.)
 * @param {() => Promise<unknown>} loadHtml2Canvas
 * @param {Element} host  The widget itself, left out of the capture.
 */
async function capturePageCopy(loadHtml2Canvas, host) {
  const IMG_ATTR = "data-ufb-img";
  const SVG_ATTR = "data-ufb-svg";
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewport = { left: 0, top: 0, right: vw, bottom: vh };

  /** @type {{ url: string, box: Box }[]} */
  const overlays = [];
  /** @type {string[]} */
  const svgs = [];
  for (const img of Array.from(document.images)) {
    if (!img.complete || !img.naturalWidth || host.contains(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !intersect(r, viewport)) continue;
    const cs = getComputedStyle(img);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const m = /^matrix\(([^)]+)\)$/.exec(cs.transform);
    if (cs.transform !== "none" && !(m && m[1].split(",").map(Number).slice(1, 3).every((v) => v === 0))) continue; // rotated: leave it to html2canvas
    const clip = clipBox(img);
    const cropped = clip && !(r.left >= clip.left - 0.5 && r.top >= clip.top - 0.5 && r.right <= clip.right + 0.5 && r.bottom <= clip.bottom + 0.5);
    if (cropped) {
      const visible = intersect(intersect(r, clip) ?? { left: 0, top: 0, right: 0, bottom: 0 }, viewport);
      const url = visible && paintImage(img, r, visible, cs, Number(cs.opacity) || 1); // laid on top: carries its own opacity
      if (!visible || !url) continue;
      img.setAttribute(IMG_ATTR, String(overlays.length));
      overlays.push({ url, box: visible });
    } else if (/\.svg(?:[?#]|$)/i.test(img.currentSrc) || img.currentSrc.startsWith("data:image/svg+xml")) {
      // The content box: html2canvas draws the replacement inside the padding and the border, like the original.
      const px = (/** @type {string} */ v) => parseFloat(v) || 0;
      const left = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
      const top = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
      const right = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
      const bottom = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
      if (right - left < 1 || bottom - top < 1) continue;
      const url = paintImage(img, { left, top, width: right - left, height: bottom - top }, { left, top, right, bottom }, cs, 1);
      if (!url) continue;
      img.setAttribute(SVG_ATTR, String(svgs.length));
      svgs.push(url);
    }
  }

  // Where position:absolute coordinates start: the page (static <body>) or <body> itself (positioned).
  const body = document.body;
  const bodyStyle = getComputedStyle(body);
  const bodyRect = body.getBoundingClientRect();
  const origin = bodyStyle.position === "static" ? { left: -window.scrollX, top: -window.scrollY } : { left: bodyRect.left + body.clientLeft, top: bodyRect.top + body.clientTop };

  try {
    const mod = /** @type {any} */ (await loadHtml2Canvas());
    const html2canvas = mod?.default ?? mod;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const canvas = await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: vw,
      height: vh,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: vh,
      scale,
      useCORS: true,
      logging: false,
      ignoreElements: (/** @type {Element} */ node) => node === host,
      onclone: async (/** @type {Document} */ doc) => {
        const style = doc.createElement("style");
        style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
        doc.head.append(style);
        for (const img of Array.from(doc.querySelectorAll(`[${IMG_ATTR}]`))) {
          const overlay = overlays[Number(img.getAttribute(IMG_ATTR))];
          if (!overlay) continue;
          /** @type {HTMLElement} */ (img).style.visibility = "hidden";
          const copy = doc.createElement("img");
          copy.src = overlay.url;
          copy.style.cssText = `position:absolute;margin:0;padding:0;border:0;max-width:none;pointer-events:none;left:${overlay.box.left - origin.left}px;top:${overlay.box.top - origin.top}px;width:${
            overlay.box.right - overlay.box.left
          }px;height:${overlay.box.bottom - overlay.box.top}px`;
          doc.body.append(copy);
        }
        /** @type {Promise<void>[]} */
        const decoding = [];
        for (const el of Array.from(doc.querySelectorAll(`img[${SVG_ATTR}]`))) {
          const img = /** @type {HTMLImageElement} */ (el);
          const url = svgs[Number(img.getAttribute(SVG_ATTR))];
          if (!url) continue;
          if (img.parentElement?.tagName === "PICTURE") for (const source of Array.from(img.parentElement.querySelectorAll("source"))) source.remove();
          img.removeAttribute("srcset");
          img.removeAttribute("sizes");
          img.src = url;
          img.style.objectFit = "fill";
          img.style.objectPosition = "0 0";
          decoding.push(img.decode().catch(() => {}));
        }
        await Promise.all(decoding);
      },
    });
    return { canvas: /** @type {HTMLCanvasElement} */ (canvas), scale };
  } finally {
    for (const el of Array.from(document.querySelectorAll(`[${IMG_ATTR}], [${SVG_ATTR}]`))) {
      el.removeAttribute(IMG_ATTR);
      el.removeAttribute(SVG_ATTR);
    }
  }
}

/** Draws the picked elements, numbered, on the capture. */
function drawPicked(/** @type {HTMLCanvasElement} */ canvas, /** @type {DOMRect[]} */ rects, /** @type {number} */ scale, /** @type {string} */ accent) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // html2canvas leaves the context scaled
  const line = Math.max(3, Math.round(3 * scale));
  rects.forEach((r, i) => {
    ctx.strokeStyle = accent;
    ctx.lineWidth = line;
    ctx.strokeRect(r.left * scale, r.top * scale, r.width * scale, r.height * scale);
    const radius = 12 * scale;
    const cx = Math.max(radius, r.left * scale);
    const cy = Math.max(radius, r.top * scale);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy);
  });
}

/** @typedef {{ tool: "pen" | "box" | "arrow", color: string, points: { x: number, y: number }[] }} Shape */

function drawShape(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {Shape} */ shape, /** @type {number} */ lineWidth) {
  const pts = shape.points;
  if (pts.length === 0) return;
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (shape.tool === "pen") {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (shape.tool === "box") {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return;
  }
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const head = lineWidth * 4;
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

/** A timeout signal (AbortSignal.timeout where available). */
function timeoutSignal(/** @type {number} */ ms) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/* ------------------------------------------------------------------------------------------------ */
/* Widget                                                                                           */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Shows the feedback button (if the server allows it for this browser).
 * @param {UiFeedbackOptions} [options]
 * @returns {Promise<{ unmount: () => void }>}
 */
export async function mountUiFeedback(options = {}) {
  const noop = { unmount() {} };
  if (typeof window === "undefined" || typeof document === "undefined") return noop;
  const lang = (options.locale ?? document.documentElement.lang ?? navigator.language ?? "en").toLowerCase();
  const opts = {
    endpoint: options.endpoint ?? "/api/ui-feedback",
    locale: /** @type {Locale} */ (lang.startsWith("es") ? "es" : "en"),
    position: options.position ?? "bottom-left",
    bottomOffset: options.bottomOffset ?? "16px",
    accentColor: options.accentColor ?? "#f97316",
    breakpoints: { tablet: 768, desktop: 1024, ...options.breakpoints },
    loadHtml2Canvas: options.loadHtml2Canvas ?? (() => import(/* webpackIgnore: true */ /* @vite-ignore */ CDN_HTML2CANVAS)),
    tabCapture: options.tabCapture ?? false,
    zIndex: options.zIndex ?? 2147483000,
  };
  if (options.checkVisibility !== false) {
    try {
      const res = await fetch(opts.endpoint, { cache: "no-store", credentials: "same-origin" });
      const body = res.ok ? await res.json() : null;
      if (!body || body.visible !== true) return noop;
    } catch {
      return noop;
    }
  }
  return createWidget(opts);
}

/**
 * @param {{ endpoint: string, locale: Locale, position: string, bottomOffset: string, accentColor: string, breakpoints: { tablet: number, desktop: number }, loadHtml2Canvas: () => Promise<unknown>, tabCapture: boolean, zIndex: number }} opts
 */
function createWidget(opts) {
  const t = STRINGS[opts.locale];
  const host = document.createElement("div");
  host.setAttribute("data-ui-feedback", "");
  host.style.cssText = `all:initial;position:fixed;inset:0;z-index:${opts.zIndex};pointer-events:none;`;
  host.style.setProperty("--ufb-accent", opts.accentColor);
  host.style.setProperty("--ufb-bottom", opts.bottomOffset);
  const root = host.attachShadow({ mode: "open" });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(h("style", { text: STYLES }));
  }
  const ui = h("div", { class: "ufb" });
  const toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
  root.append(ui, toastEl);
  document.body.append(host);

  /** @typedef {{ x: number, y: number, stack: Element[], el: Element }} Focus */
  const state = {
    /** @type {"idle" | "pick" | "capturing" | "annotate"} */
    mode: "idle",
    /** @type {Element | null} */
    hover: null,
    /** @type {Focus | null} */
    focus: null,
    /** @type {{ el: Element, layer: number }[]} */
    picked: [],
    /** @type {"top" | "bottom"} */
    dock: "top",
    collapsed: false,
    /** @type {{ canvas: HTMLCanvasElement, elements: NoteElement[], labels: string[] } | null} */
    shot: null,
  };

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer;
  function toast(/** @type {string} */ message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 5000);
  }

  /** The page's layers under a point, topmost first, without the widget and <html>. */
  function layersAt(/** @type {number} */ x, /** @type {number} */ y) {
    return document.elementsFromPoint(x, y).filter((el) => el !== host && !host.contains(el) && el !== document.documentElement);
  }

  /** The direct child of `el` under the point, or its first visible child. */
  function childTowards(/** @type {Element} */ el, /** @type {number} */ x, /** @type {number} */ y) {
    const children = Array.from(el.children).filter((c) => c !== host);
    const hit = children.find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    return hit ?? children.find((c) => c.getBoundingClientRect().width > 0) ?? null;
  }

  function reset() {
    state.mode = "idle";
    state.hover = null;
    state.focus = null;
    state.picked = [];
    state.shot = null;
    state.collapsed = false;
    render();
  }

  /* ---- pick mode ---- */

  const overlay = h("div", { class: "overlay" });
  const boxes = h("div", { class: "boxes", "aria-hidden": "true" });
  let frame = 0;
  overlay.addEventListener("pointermove", (event) => {
    const e = /** @type {PointerEvent} */ (event);
    if (state.focus || e.pointerType === "touch") return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      state.hover = layersAt(e.clientX, e.clientY)[0] ?? null;
      renderBoxes();
      placeToolbar();
    });
  });
  overlay.addEventListener("click", (event) => {
    const e = /** @type {MouseEvent} */ (event);
    const stack = layersAt(e.clientX, e.clientY);
    if (stack.length === 0) return;
    state.hover = null;
    state.focus = { x: e.clientX, y: e.clientY, stack, el: stack[0] };
    render();
  });

  function box(/** @type {Element} */ el, /** @type {string} */ tone, /** @type {number} */ number = 0) {
    const r = el.getBoundingClientRect();
    const b = h("div", { class: `box ${tone}` }, number ? h("span", { class: "num", text: String(number) }) : null);
    Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    return b;
  }

  function renderBoxes() {
    if (state.mode !== "pick") return;
    boxes.replaceChildren(
      ...state.picked.map((p, i) => box(p.el, "picked", i + 1)),
      ...(state.hover && !state.focus ? [box(state.hover, "hover")] : []),
      ...(state.focus ? [box(state.focus.el, "focus")] : [])
    );
  }

  /** @type {HTMLElement | null} */
  let toolbarEl = null;

  /** The window never covers what you're looking at: if the element is under it, it jumps to the other edge. */
  function placeToolbar() {
    if (!toolbarEl) return;
    const target = state.focus?.el ?? state.hover;
    let side = state.dock;
    if (target) {
      const r = target.getBoundingClientRect();
      const reach = toolbarEl.offsetHeight + 16;
      const coversTop = r.top < reach;
      const coversBottom = r.bottom > window.innerHeight - reach;
      if (side === "top" && coversTop && !coversBottom) side = "bottom";
      else if (side === "bottom" && coversBottom && !coversTop) side = "top";
    }
    toolbarEl.classList.toggle("bottom", side === "bottom");
  }

  function choose(/** @type {Element} */ el) {
    if (state.focus) state.focus = { ...state.focus, el };
    render();
  }

  function pickFocused() {
    const focus = state.focus;
    if (!focus) return;
    if (!state.picked.some((p) => p.el === focus.el)) state.picked.push({ el: focus.el, layer: Math.max(0, focus.stack.indexOf(focus.el)) });
    state.focus = null;
    render();
  }

  function renderPick() {
    if (state.collapsed) {
      toolbarEl = null;
      return h(
        "button",
        { class: `pill${state.dock === "bottom" ? " bottom" : ""}`, type: "button", onClick: () => ((state.collapsed = false), render()) },
        icon("maximize", 16),
        t.picking(state.picked.length)
      );
    }
    const focus = state.focus;
    const index = focus ? focus.stack.indexOf(focus.el) : -1;
    const head = h(
      "div",
      { class: "head" },
      h("strong", { text: t.pickTitle }),
      h("span", { class: "spacer" }),
      h(
        "button",
        { class: "icon-btn", type: "button", "aria-label": state.dock === "top" ? t.moveDown : t.moveUp, title: state.dock === "top" ? t.moveDown : t.moveUp, onClick: () => ((state.dock = state.dock === "top" ? "bottom" : "top"), render()) },
        icon("swap")
      ),
      h("button", { class: "icon-btn", type: "button", "aria-label": t.minimize, title: t.minimize, onClick: () => ((state.collapsed = true), render()) }, icon("minimize")),
      h("button", { class: "icon-btn", type: "button", "aria-label": t.cancel, title: t.cancel, onClick: reset }, icon("x"))
    );
    const body = focus
      ? [
          h("p", { class: "hint" }, h("strong", { text: t.layerOf(index + 1, focus.stack.length) }), " ", h("code", { text: shortLabel(focus.el) })),
          h(
            "div",
            { class: "row" },
            h("button", { class: "btn", type: "button", disabled: index <= 0, onClick: () => choose(focus.stack[index - 1]) }, icon("above"), t.above),
            h("button", { class: "btn", type: "button", disabled: index < 0 || index >= focus.stack.length - 1, onClick: () => choose(focus.stack[index + 1]) }, icon("below"), t.below),
            h(
              "button",
              { class: "btn", type: "button", disabled: !focus.el.parentElement || focus.el.parentElement === document.body, onClick: () => focus.el.parentElement && choose(focus.el.parentElement) },
              icon("up"),
              t.container
            ),
            h(
              "button",
              {
                class: "btn",
                type: "button",
                disabled: !childTowards(focus.el, focus.x, focus.y),
                onClick: () => {
                  const child = childTowards(focus.el, focus.x, focus.y);
                  if (child) choose(child);
                },
              },
              icon("down"),
              t.inside
            ),
            h("button", { class: "btn primary", type: "button", onClick: pickFocused }, icon("plus"), t.pickThis),
            h("button", { class: "btn", type: "button", onClick: () => ((state.focus = null), render()) }, t.pickAnother)
          ),
        ]
      : [h("p", { class: "hint", text: t.hint })];
    const chips = state.picked.length
      ? h(
          "ul",
          { class: "chips", "aria-label": t.picked },
          ...state.picked.map((p, i) =>
            h(
              "li",
              { class: "chip" },
              h("strong", { text: String(i + 1) }),
              h("span", { class: "label", text: shortLabel(p.el) }),
              h("button", { type: "button", "aria-label": t.removePicked(i + 1), onClick: () => (state.picked.splice(i, 1), render()) }, icon("x", 14))
            )
          )
        )
      : null;
    const foot = h(
      "div",
      { class: "row foot" },
      h("button", { class: "btn dark", type: "button", onClick: () => void capture() }, icon("camera"), t.capture(state.picked.length)),
      h("button", { class: "btn", type: "button", onClick: reset }, t.cancel),
      h("span", { class: "spacer" }),
      h("a", { class: "btn", href: `${opts.endpoint}?view`, target: "_blank", rel: "noreferrer" }, icon("list"), t.notes)
    );
    toolbarEl = h("div", { class: "toolbar", role: "toolbar", "aria-label": t.pickTitle }, head, ...body, chips, foot);
    return toolbarEl;
  }

  /* ---- capture ---- */

  async function capture() {
    const picked = state.picked.slice();
    const elements = picked.map((p) => describeElement(p.el, p.layer));
    const labels = picked.map((p) => shortLabel(p.el));
    state.mode = "capturing"; // nothing of the widget is drawn while capturing
    state.focus = null;
    state.hover = null;
    render();
    await nextFrames();
    try {
      const shot = (opts.tabCapture ? await captureTab() : null) ?? (await capturePageCopy(opts.loadHtml2Canvas, host));
      drawPicked(shot.canvas, picked.map((p) => p.el.getBoundingClientRect()), shot.scale, opts.accentColor);
      state.shot = { canvas: shot.canvas, elements, labels };
      state.mode = "annotate";
    } catch (error) {
      console.error("[ui-feedback]", error);
      toast(t.captureError);
      state.mode = "pick";
    }
    render();
  }

  /* ---- annotate dialog ---- */

  /** @param {{ canvas: HTMLCanvasElement, elements: NoteElement[], labels: string[] }} shot */
  function renderAnnotate(shot) {
    /** @type {Shape[]} */
    const shapes = [];
    /** @type {Shape | null} */
    let drawing = null;
    /** @type {Shape["tool"]} */
    let tool = "box";
    let color = COLORS[0];
    /** @type {Device[]} */
    let devices = [deviceForWidth(window.innerWidth, opts.breakpoints)];
    /** @type {"no-screen" | "no-comment" | "nothing-marked" | null} */
    let problem = null;
    let sending = false;

    const canvas = /** @type {HTMLCanvasElement} */ (h("canvas", { class: "canvas", role: "img", "aria-label": t.screenshotAlt }));
    canvas.width = shot.canvas.width;
    canvas.height = shot.canvas.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    const lineWidth = Math.max(3, Math.round(canvas.width / 400));
    const redraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(shot.canvas, 0, 0);
      for (const s of shapes) drawShape(ctx, s, lineWidth);
      if (drawing) drawShape(ctx, drawing, lineWidth);
    };
    redraw();
    const toCanvas = (/** @type {PointerEvent} */ e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toCanvas(e);
      drawing = { tool, color, points: [p, p] };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = toCanvas(e);
      drawing.points = drawing.tool === "pen" ? [...drawing.points, p] : [drawing.points[0], p];
      redraw();
    });
    const finish = () => {
      if (!drawing) return;
      shapes.push(drawing);
      drawing = null;
      if (problem === "nothing-marked") problem = null;
      redraw();
      renderTools();
      renderProblem();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);

    const tools = h("div", { class: "row", role: "toolbar", "aria-label": t.markTools });
    function renderTools() {
      tools.replaceChildren(
        ...[
          /** @type {const} */ (["pen", t.pen]),
          /** @type {const} */ (["box", t.box]),
          /** @type {const} */ (["arrow", t.arrow]),
        ].map(([value, label]) => h("button", { class: "btn", type: "button", "aria-pressed": String(tool === value), onClick: () => ((tool = value), renderTools()) }, icon(value), label)),
        h("span", { class: "sep", "aria-hidden": "true" }),
        ...COLORS.map((c, i) => {
          const swatch = h("button", { class: "swatch", type: "button", "aria-label": t.colors[i], "aria-pressed": String(color === c), onClick: () => ((color = c), renderTools()) });
          swatch.style.backgroundColor = c;
          return swatch;
        }),
        h("span", { class: "sep", "aria-hidden": "true" }),
        h("button", { class: "btn", type: "button", disabled: shapes.length === 0, onClick: () => (shapes.pop(), redraw(), renderTools()) }, icon("undo"), t.undo),
        h("button", { class: "btn", type: "button", disabled: shapes.length === 0, onClick: () => (shapes.splice(0), redraw(), renderTools()) }, icon("clear"), t.clear)
      );
    }

    const deviceRow = h("div", { class: "row" });
    function renderDevices() {
      deviceRow.replaceChildren(
        .../** @type {Device[]} */ (["desktop", "tablet", "mobile"]).map((d) =>
          h(
            "button",
            {
              class: "btn",
              type: "button",
              "aria-pressed": String(devices.includes(d)),
              onClick: () => {
                devices = devices.includes(d) ? devices.filter((x) => x !== d) : [...devices, d];
                if (problem === "no-screen" && devices.length) problem = null;
                renderDevices();
                renderProblem();
              },
            },
            t.devices[d]
          )
        )
      );
    }

    const comment = /** @type {HTMLTextAreaElement} */ (h("textarea", { id: "ufb-comment", rows: "5", maxlength: "5000", placeholder: t.placeholder, "aria-describedby": "ufb-problem" }));
    comment.addEventListener("input", () => {
      if (problem === "no-comment") {
        problem = null;
        renderProblem();
      }
    });

    const problemBox = h("div", { id: "ufb-problem", "aria-live": "polite" });
    function renderProblem() {
      comment.setAttribute("aria-invalid", String(problem === "no-comment"));
      if (problem === "no-screen") problemBox.replaceChildren(h("p", { class: "notice error", role: "alert", text: t.noScreen }));
      else if (problem === "no-comment") problemBox.replaceChildren(h("p", { class: "notice error", role: "alert", text: t.noComment }));
      else if (problem === "nothing-marked")
        problemBox.replaceChildren(
          h(
            "div",
            { class: "notice warn", role: "alert" },
            h("p", {}, h("strong", { text: t.nothingMarkedTitle }), " ", t.nothingMarkedText),
            h(
              "div",
              { class: "row" },
              h("button", { class: "btn dark", type: "button", onClick: backToPick }, t.backToPick),
              h("button", { class: "btn", type: "button", onClick: () => void send(true) }, t.sendAnyway)
            )
          )
        );
      else problemBox.replaceChildren();
    }

    const actions = h("div", { class: "row" });
    function renderActions() {
      actions.replaceChildren(
        h(
          "button",
          { class: "btn primary", type: "button", disabled: sending, onClick: () => void send(false) },
          sending ? h("span", { class: "spin" }, icon("spinner")) : icon("send"),
          sending ? t.sending : t.send
        ),
        h("button", { class: "btn", type: "button", disabled: sending, onClick: backToPick }, t.backToPick),
        h("button", { class: "icon-btn", type: "button", disabled: sending, "aria-label": t.cancel, title: t.cancel, onClick: reset }, icon("x"))
      );
    }

    function backToPick() {
      state.shot = null;
      state.mode = "pick";
      render();
    }

    async function send(/** @type {boolean} */ force) {
      if (devices.length === 0) problem = "no-screen";
      else if (comment.value.trim().length < 3) problem = "no-comment";
      else if (!force && shot.elements.length === 0 && shapes.length === 0) problem = "nothing-marked";
      else problem = null;
      renderProblem();
      if (problem) {
        if (problem === "no-comment") comment.focus();
        return;
      }
      sending = true;
      renderActions();
      // The final image: capture + marks, narrowed if very wide (lighter, reads the same).
      let out = canvas;
      if (canvas.width > 1800) {
        out = document.createElement("canvas");
        out.width = 1800;
        out.height = Math.round((canvas.height * 1800) / canvas.width);
        out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
      }
      try {
        const res = await fetch(opts.endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          signal: timeoutSignal(30_000),
          body: JSON.stringify({
            pageUrl: `${location.pathname}${location.search}`,
            pageTitle: document.title,
            comment: comment.value.trim(),
            devices,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            elements: shot.elements,
            image: out.toDataURL("image/png"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(typeof data.error === "string" ? data.error : t.sendError);
          sending = false;
          renderActions();
          return;
        }
        toast(t.sent);
        reset();
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        toast(name === "TimeoutError" || name === "AbortError" ? t.timeout : t.network);
        sending = false;
        renderActions();
      }
    }

    renderTools();
    renderDevices();
    renderProblem();
    renderActions();

    const current = t.devices[deviceForWidth(window.innerWidth, opts.breakpoints)];
    const panel = h(
      "div",
      { class: "panel" },
      h("div", { class: "main" }, tools, h("div", { class: "stage" }, canvas)),
      h(
        "div",
        { class: "side" },
        shot.labels.length
          ? h(
              "div",
              { class: "list" },
              h("strong", { text: t.picked }),
              h("ol", {}, ...shot.labels.map((label, i) => h("li", {}, h("span", { class: "n", text: String(i + 1) }), h("span", { text: label }))))
            )
          : null,
        h("fieldset", {}, h("legend", { text: t.screens }), deviceRow, h("p", { class: "small", text: t.screensHint(current) })),
        h("label", { class: "lbl", for: "ufb-comment", text: t.commentLabel }),
        comment,
        problemBox,
        actions
      )
    );
    setTimeout(() => comment.focus(), 0);
    return h("div", { class: "backdrop", role: "dialog", "aria-modal": "true", "aria-label": t.annotateTitle }, panel);
  }

  /* ---- render ---- */

  function render() {
    toolbarEl = null;
    if (state.mode === "idle") {
      ui.replaceChildren(
        h("button", { class: `fab${opts.position === "bottom-right" ? " right" : ""}`, type: "button", "aria-label": t.fab, title: t.fab, onClick: () => ((state.mode = "pick"), render()) }, icon("note", 24))
      );
    } else if (state.mode === "pick") {
      ui.replaceChildren(overlay, boxes, renderPick());
      renderBoxes();
      placeToolbar();
    } else if (state.mode === "annotate" && state.shot) {
      ui.replaceChildren(renderAnnotate(state.shot));
    } else {
      ui.replaceChildren();
    }
  }

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== "Escape") return;
    if (state.mode === "pick") {
      if (state.focus) {
        state.focus = null;
        render();
      } else reset();
    }
    // In the comment window Esc does nothing on purpose: it would throw away what was written. Use Cancel.
  };
  const onViewportChange = () => {
    if (state.mode !== "pick") return;
    renderBoxes();
    placeToolbar();
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);

  render();

  return {
    unmount() {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      clearTimeout(toastTimer);
      host.remove();
    },
  };
}
