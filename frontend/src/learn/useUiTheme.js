import { useEffect } from "react";

/** Applies the theme chosen in the mind map toolbar (light / dark / system) to learning pages. */
export const useUiTheme = () => {
  useEffect(() => {
    let stored = "system";
    try { stored = localStorage.getItem("feynman.ui.theme") || "system"; } catch { /* private mode */ }
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.uiTheme = stored === "system" ? (media?.matches ? "dark" : "light") : stored; };
    apply();
    if (stored !== "system" || !media) return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
};
