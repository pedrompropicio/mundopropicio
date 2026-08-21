import { createContext } from "react";

// ============================================================
// BudgetMode context — replica do critério canónico do detalhe
// (CampaignView.tsx L766-787): CBO ⇔ campanha tem budget>0;
// ABO ⇔ soma de budgets dos adsets>0; senão unknown.
// Resolve o falso CBO causado por daily_budget_cents stale ao
// nível da campanha em campanhas ABO.
// ============================================================
export type BudgetMode = "ABO" | "CBO" | "unknown";
export const BudgetModeContext = createContext<Map<string, BudgetMode>>(new Map());
