import { useMemo } from "react";
import { useCompany } from "./useCompany";
import { resolveCompanyLocale } from "@/lib/company-locale";

/** Uses the active company source; consumers narrow status before formatting. */
export function useCompanyLocale() {
  const { company, companyId, isLoading, isError, error } = useCompany();
  const context = useMemo(
    () => resolveCompanyLocale(isLoading || isError ? {} : (company ?? {})),
    [company?.country, company?.currency, isLoading, isError],
  );

  return { ...context, companyId, isLoading, isError, error };
}
