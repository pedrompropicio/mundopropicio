import { useEffect } from "react";

const FULLSCREEN_OVERLAY_SELECTOR = [
  '[class*="fixed"][class*="inset-0"][class*="bg-black/60"]',
  '[class*="fixed"][class*="inset-0"][class*="bg-black/80"]',
].join(", ");

/**
 * O react-remove-scroll (usado pelos componentes Radix: Dialog, Sheet, Drawer...)
 * marca o <body> com este atributo enquanto gere ele próprio o scroll.
 * Nunca podemos estar os dois a escrever no body.
 */
const RADIX_LOCK_ATTRIBUTE = "data-scroll-locked";

function isRadixOverlay(el: HTMLElement) {
  // Overlays do Radix vivem dentro de um portal do Radix e/ou têm attrs data-radix-*
  if (el.closest("[data-radix-portal]")) return true;
  let node: Element | null = el;
  while (node) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith("data-radix-")) return true;
    }
    node = node.parentElement;
  }
  return false;
}

function hasOpenFullscreenOverlay() {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>(FULLSCREEN_OVERLAY_SELECTOR),
  );

  return overlays.some((overlay) => {
    // Overlays do Radix governam-se sozinhos (react-remove-scroll).
    if (isRadixOverlay(overlay)) return false;

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
      // Só restauramos se fomos nós a bloquear.
      if (!isLocked) return;
      isLocked = false;

      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      body.style.overflow = originalBodyOverflow;
      body.style.overscrollBehavior = originalBodyOverscroll;
      html.style.overflow = originalHtmlOverflow;
      html.style.overscrollBehavior = originalHtmlOverscroll;
      try {
        window.scrollTo(0, lockedScrollY);
      } catch {
        /* noop */
      }
    };

    const syncScrollLock = () => {
      // Se o Radix já está a bloquear o scroll, não tocamos em nada.
      if (body.hasAttribute(RADIX_LOCK_ATTRIBUTE)) {
        unlockScroll();
        return;
      }

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
