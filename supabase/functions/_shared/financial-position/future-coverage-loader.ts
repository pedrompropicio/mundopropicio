import { assembleFutureCoverage, type FutureCoverage } from "./future-coverage.ts";

/** Coverage alone reads all years with the caller JWT; never supplies the settlement engine. */
export async function loadIndependentFutureCoverage(
  asUser: { rpc: (name: string, args: { p_company_id: string; p_year: null }) => PromiseLike<{ data: any; error: any }> },
  companyId: string,
  load: (base: any) => Promise<FutureCoverage>,
  deadlineMs = 6_000,
): Promise<FutureCoverage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const { data: base, error } = await asUser.rpc("get_financial_position_base", { p_company_id: companyId, p_year: null });
        if (error) throw new Error("future_base_failed");
        if (!base || base.meta?.company_id !== companyId || base.meta?.year !== null
          || !base.meta?.reference_date || typeof base.meta?.balances_visible !== "boolean"
          || !Array.isArray(base.a_pagar?.por_evento)) throw new Error("future_base_invalid_response");
        return load(base);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), deadlineMs);
      }),
    ]);
  } catch (error) {
    return assembleFutureCoverage({ base: null, rootOf: {}, sales: null, cash: null, preCutoff: null, aportes: null,
      error: error instanceof Error && error.message === "timeout" ? "timeout" : "leitura_falhou" });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}