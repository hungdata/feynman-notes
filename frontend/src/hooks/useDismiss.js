import { useEffect } from "react";

/** Closes when clicking outside `ref` or pressing Escape. */
export const useDismiss = (open, onClose, ref) => {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, open, ref]);
};
