/** Validação da percentagem do artista (cachê variável): 0–100. */
export type PercentageParse = { ok: true; value: number } | { ok: false; error: string };

export function parseCachePercentage(input: string): PercentageParse {
  const raw = input.trim().replace(",", ".");
  if (raw === "") return { ok: false, error: "Indica uma percentagem entre 0 e 100." };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false, error: "A percentagem tem de estar entre 0 e 100." };
  }
  return { ok: true, value };
}

/** Pode editar a percentagem: mesma permissão dos outros campos e configuração não finalizada. */
export function canEditCachePercentage(canEdit: boolean, isFinalized: boolean): boolean {
  return canEdit && !isFinalized;
}

/**
 * Campo "Ajustado": vazio = sem ajuste (NULL). Um 0 escrito à mão é ajuste real.
 * Devolve undefined quando o valor é inválido (não grava).
 */
export function parseAdjustedInput(input: string): number | null | undefined {
  const raw = input.trim().replace(",", ".");
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}
