import { useEffect } from "react";
import { clearDirty, markDirty } from "@/lib/pending-work";

/**
 * Regista um formulário/ecrã como «trabalho pendente» enquanto `dirty` for
 * verdadeiro. A chave deve ser estável e única (ex.: "evento-form:<id>").
 * Limpa sozinho ao desmontar.
 */
export function usePendingWork(key: string, dirty: boolean, label?: string) {
  useEffect(() => {
    if (!dirty) return;
    markDirty(key, label);
    return () => clearDirty(key);
  }, [key, dirty, label]);
}
