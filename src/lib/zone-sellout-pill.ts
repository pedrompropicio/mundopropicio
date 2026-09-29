/**
 * Leitura (pill) de esgotamento de uma zona — extraída de SalesBIEvent (Visão
 * geral) sem mudar o comportamento, para ser reutilizada em "Lotes e preços".
 */
export type PillTone = "ok" | "warn" | "bad" | "muted";
export interface SelloutPill {
  label: string;
  tone: PillTone;
}

export function zoneSelloutPill(opts: {
  porVender: number;
  ritmo: number;
  esgota: number | null;
  daysLeft: number | null;
}): SelloutPill {
  const { porVender, ritmo, esgota, daysLeft } = opts;
  if (porVender === 0) return { label: "esgotada", tone: "ok" };
  if (ritmo <= 0) return { label: "parada", tone: "bad" };
  if (daysLeft !== null && esgota !== null && esgota <= daysLeft * 0.8) return { label: "esgota a tempo", tone: "ok" };
  if (daysLeft !== null && esgota !== null && esgota <= daysLeft) return { label: "à justa", tone: "warn" };
  return { label: "não chega lá", tone: "bad" };
}
