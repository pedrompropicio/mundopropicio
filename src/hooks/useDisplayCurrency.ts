import { useCompany } from "@/hooks/useCompany";

/**
 * Returns the currency to use for display when no ad-account context is
 * available. Hierarchy (caller is responsible for applying it):
 *
 *   1) ad_account currency (when present in context)
 *   2) active company currency (this hook)
 *   3) "EUR" (last-resort fallback)
 *
 * Pure cosmetic — no FX conversion. ERP / BP / Sponsorship modules keep
 * their own EUR-locked formatters.
 */
export function useDisplayCurrency(): string {
  const { company } = useCompany();
  const c = (company?.currency || "").trim();
  return c || "EUR";
}
