import * as React from "react";
import { createPortal } from "react-dom";
import { useComposedRefs, useLayerNodeRefs } from "@/lib/overlay-layer";

/**
 * Overlay manual (fundo + conteúdo) na pilha única de camadas.
 * - Renderiza SEMPRE em portal para document.body (escapa a `.glass`,
 *   `backdrop-filter` e `transform` dos antepassados, que quebram `position: fixed`).
 * - Recebe o z-index da pilha: fica acima de qualquer camada já aberta, e os
 *   Popover/Select/Dialog abertos lá dentro ficam acima dele.
 * Nunca pôr classes `z-*` aqui — a camada decide.
 */
export const OverlayLayer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) => {
    const layer = useLayerNodeRefs();
    const composedRef = useComposedRefs(ref, layer.contentRef);
    if (typeof document === "undefined") return null;
    return createPortal(
      <div ref={composedRef} data-overlay-layer="" {...props} style={style}>
        {children}
      </div>,
      document.body,
    );
  },
);
OverlayLayer.displayName = "OverlayLayer";
