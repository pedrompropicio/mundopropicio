import { useEffect, useRef, useState } from "react";
import { topLayerZ } from "@/lib/overlay-layer";
import { isInsideHelpPanel } from "@/lib/help-panel-dom";
import { useBackdropClose } from "@/lib/backdropClose";

/** Fecho de um overlay manual: nunca fecha uma camada por baixo de outra. */
export function useModalDismiss(hasChanges: boolean, onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => {
    if (hasChanges) setConfirmDiscard(true);
    else onClose();
  };
  const backdrop = useBackdropClose(requestClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const node = overlayRef.current;
      if (event.key !== "Escape" || event.defaultPrevented || !node ||
          Number(node.style.zIndex) !== topLayerZ() || isInsideHelpPanel(event.target) ||
          document.querySelector('[data-help-panel="true"]') ||
          document.querySelector('[data-radix-popper-content-wrapper]')) return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasChanges, onClose]);

  return { overlayRef, backdrop, requestClose, confirmDiscard, setConfirmDiscard };
}