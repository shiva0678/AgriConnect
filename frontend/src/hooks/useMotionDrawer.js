import { useEffect, useRef, useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 700px)";

function subscribeToMobileQuery(onChange) {
  const mediaQuery = window.matchMedia(mobileQuery);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileSnapshot() {
  return window.matchMedia(mobileQuery).matches;
}

function getServerSnapshot() {
  return false;
}

export function useMotionDrawer(isOpen, setIsOpen) {
  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    getMobileSnapshot,
    getServerSnapshot,
  );
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (!isMobile || !isOpen) return undefined;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, isOpen, setIsOpen]);

  useEffect(() => {
    if (wasOpen.current && !isOpen) triggerRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return { isMobile, panelRef, triggerRef };
}