"use client";
// components/ui-feedback-launcher.jsx (or .tsx) — render <UiFeedbackLauncher /> once, inside <body> of the
// root layout. It asks the endpoint whether to show the feedback button (you in development, or a browser
// that opened the activation link on a deployed site) and only then downloads the widget: customers never
// load its code. Adjust the import path to where you copied the templates.
import { useEffect } from "react";

export default function UiFeedbackLauncher() {
  useEffect(() => {
    /** @type {{ unmount: () => void } | null} */
    let handle = null;
    let cancelled = false;
    fetch("/api/ui-feedback", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body) => {
        if (!body?.visible || cancelled) return;
        const { mountUiFeedback } = await import("@/lib/ui-feedback/ui-feedback-widget.js");
        const mounted = await mountUiFeedback({
          checkVisibility: false,
          loadHtml2Canvas: () => import("html2canvas-pro"),
          // Next.js shows its dev tools indicator at the bottom left: keep the button on the other side.
          position: "bottom-right",
          // breakpoints: { tablet: 768, desktop: 1024 }, // the project's own, if different
        });
        if (cancelled) mounted.unmount();
        else handle = mounted;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.unmount();
    };
  }, []);
  return null;
}
