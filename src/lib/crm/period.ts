// Período partilhado entre Dashboard Meta Live (Campaigns.tsx)
// e Detalhe de Campanha (CampaignView.tsx).
// Extracção pura — sem mudança de comportamento.
import { subDays } from "date-fns";
import { lisbonToday } from "@/lib/date-lisbon";

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
  // Fuso de Portugal: a conta de anúncios é PT e o utilizador pode operar do Brasil.
  const today = lisbonToday();
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
