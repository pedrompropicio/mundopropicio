import { useEffect } from "react";

const FULLSCREEN_OVERLAY_SELECTOR = [
  '[class*="fixed"][class*="inset-0"][class*="bg-black/60"]',
  '[class*="fixed"][class*="inset-0"][class*="bg-black/80"]',
].join(", ");

function hasOpenFullscreenOverlay() {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>(FULLSCREEN_OVERLAY_SELECTOR),
  );

  return overlays.some((overlay) => {
    const style = window.getComputedStyle(overlay);
    const rect = overlay.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none" &&
      style.position === "fixed" &&
      rect.width >= window.innerWidth * 0.9 &&
      rect.height >= window.innerHeight * 0.9
    );
  });
}

export function useGlobalModalScrollLock() {
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyOverscroll = body.style.overscrollBehavior;
    const originalHtmlOverflow = html.style.overflow;
    const originalHtmlOverscroll = html.style.overscrollBehavior;

    let lockedScrollY = 0;
    let isLocked = false;

    const lockScroll = () => {
      if (isLocked) return;

      lockedScrollY = window.scrollY;
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      html.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      isLocked = true;
    };

    const unlockScroll = () => {
      if (!isLocked) return;

      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      body.style.overflow = originalBodyOverflow;
      body.style.overscrollBehavior = originalBodyOverscroll;
      html.style.overflow = originalHtmlOverflow;
      html.style.overscrollBehavior = originalHtmlOverscroll;
      window.scrollTo(0, lockedScrollY);
      isLocked = false;
    };

    const syncScrollLock = () => {
      if (hasOpenFullscreenOverlay()) {
        lockScroll();
        return;
      }

      unlockScroll();
    };

    const observer = new MutationObserver(syncScrollLock);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state"],
    });

    syncScrollLock();

    return () => {
      observer.disconnect();
      unlockScroll();
    };
  }, []);
}
