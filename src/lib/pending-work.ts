// Registo simples de «trabalho pendente»: tudo o que não pode ser perdido por
// uma actualização da aplicação (formulário sujo, gravação em curso, janela
// aberta, upload...). O actualizador (update-manager) consulta-o antes de
// permitir «Atualizar». Formulários usam markDirty/clearDirty (ou o hook
// usePendingWork) com uma chave estável.

export const WORK_KEY_MUTATIONS = "sistema:gravacoes-em-curso";
export const WORK_KEY_DIALOG = "sistema:janela-aberta";

export const WORK_LABELS: Record<string, string> = {
  [WORK_KEY_MUTATIONS]: "há gravações em curso",
  [WORK_KEY_DIALOG]: "há uma janela aberta",
};

const DEFAULT_LABEL = "há alterações por guardar";

const dirty = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Marca trabalho pendente sob `key`. Idempotente. */
export function markDirty(key: string, label?: string) {
  const next = label ?? WORK_LABELS[key] ?? DEFAULT_LABEL;
  if (dirty.get(key) === next) return;
  dirty.set(key, next);
  emit();
}

/** Limpa o trabalho pendente de `key`. Idempotente. */
export function clearDirty(key: string) {
  if (dirty.delete(key)) emit();
}

export function hasPendingWork() {
  return dirty.size > 0;
}

export function getPendingWorkKeys() {
  return Array.from(dirty.keys());
}

/** Razões legíveis (sem repetições) para mostrar ao utilizador. */
export function getPendingWorkLabels() {
  return Array.from(new Set(dirty.values()));
}

export function subscribePendingWork(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Só para testes. */
export function resetPendingWork() {
  dirty.clear();
  emit();
}
