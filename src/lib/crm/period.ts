// Período partilhado entre Dashboard Meta Live (Campaigns.tsx)
// e Detalhe de Campanha (CampaignView.tsx).
// Extracção pura — sem mudança de comportamento.
import { startOfDay, subDays } from "date-fns";

export type PeriodMode = "yesterday" | "7d" | "30d" | "custom";

export interface PeriodState {
  mode: PeriodMode;
  from: Date;
  to: Date;
}

export function periodFromMode(
  mode: PeriodMode,
  custom?: { from: Date; to: Date },
): PeriodState {
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  if (mode === "yesterday") return { mode, from: yesterday, to: yesterday };
  if (mode === "7d") return { mode, from: subDays(today, 6), to: today };
  if (mode === "30d") return { mode, from: subDays(today, 29), to: today };
  return {
    mode: "custom",
    from: custom?.from ?? subDays(today, 6),
    to: custom?.to ?? today,
  };
}
