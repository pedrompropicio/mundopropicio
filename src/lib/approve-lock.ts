/**
 * Trinco síncrono contra re-entrada nas aprovações (incidente 05/10/2026:
 * um clique gerou 39 chamadas a approve-transaction porque a guarda `isPending`
 * só ficava true depois de dois awaits de validação).
 *
 * Regra: `acquire()` ANTES do primeiro await; `release()` em todos os returns
 * antecipados e no onSettled das mutações.
 */
export interface ApproveLock {
  acquire: () => boolean;
  release: () => void;
  isHeld: () => boolean;
}

export function createApproveLock(
  ref: { current: boolean },
  onChange?: (held: boolean) => void,
): ApproveLock {
  return {
    acquire() {
      if (ref.current) return false;
      ref.current = true;
      onChange?.(true);
      return true;
    },
    release() {
      if (!ref.current) return;
      ref.current = false;
      onChange?.(false);
    },
    isHeld: () => ref.current,
  };
}

/** Ignora a repetição automática de Enter/Espaço mantidos num botão. */
export function blockKeyRepeat(e: { repeat: boolean; key: string; preventDefault: () => void }) {
  if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault();
}
