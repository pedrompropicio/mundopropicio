import { useRef } from "react";

/**
 * Handlers para fechar um modal por clique no backdrop, evitando fecho
 * acidental quando o utilizador seleciona uma opção de um dropdown / date-picker
 * / popover renderizado em portal (o `mouseup` final pode cair no backdrop e
 * disparar `onClick`).
 *
 * O fecho só acontece se **tanto o `pointerdown` como o `click`** ocorreram no
 * próprio elemento backdrop (não bolharam de um filho ou de um portal).
 *
 * Uso:
 * ```tsx
 * const backdrop = useBackdropClose(onClose);
 * <div className="fixed inset-0 ..." {...backdrop}> ... </div>
 * ```
 */
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false);

  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) {
        onClose();
      }
      downOnBackdrop.current = false;
    },
  };
}
