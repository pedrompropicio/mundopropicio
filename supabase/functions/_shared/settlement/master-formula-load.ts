/** Formula-only expense slices for a city without its Master. Fixed legacy rows stay untouched. */
import { fetchAllPagedQuery } from "../paging.ts";
import { expandOverheadToSplits } from "./overhead-proration.ts";
import { expandMasterAdoptedExpensesToSplits } from "./master-adopted-expense-proration.ts";
export async function loadMasterFormulaExpenseSlicesFor(client: any, perimeter: Array<{id: string; parent_event_id?: string | null}>) {
  const ids = perimeter.map(e => e.id);
  const masters = [...new Set(perimeter.map(e => e.parent_event_id).filter((id): id is string => !!id && !ids.includes(id)))];
  if (!masters.length) return { forecastSlices: [] as any[], transactionSlices: [] as any[] };
  const {data: lines, error} = await fetchAllPagedQuery(client.from("event_forecasts")
    .select("*, account_categories(name, code, ebitda_class)").in("event_id", masters).eq("type", "expense")
    .in("formula_type", ["pct_ticket_revenue", "per_head"]).eq("status", "approved").is("version_id", null));
  if (error) throw error;
  if (!lines?.length) return { forecastSlices: [], transactionSlices: [] };
  const [{data: cities,error:cErr}, adoptionRes, txRes] = await Promise.all([
    client.from("events").select("id, parent_event_id").in("parent_event_id", masters).order("date").order("id"),
    fetchAllPagedQuery(client.from("event_forecasts").select("id, event_id, master_forecast_id, transaction_id").in("master_forecast_id", lines.map((f:any) => f.id)).is("version_id",null)),
    fetchAllPagedQuery(client.from("transactions").select("*, account_categories(name, code, ebitda_class)").in("event_id", masters).eq("type","expense").in("status",["approved","paid"])),
  ]);
  if(cErr) throw cErr;
  if(adoptionRes.error) throw adoptionRes.error;
  if(txRes.error) throw txRes.error;
  const forecastSlices = expandOverheadToSplits(lines as any[], cities ?? []).filter(f => f._overhead_via_master && ids.includes(f.event_id));
  const transactionSlices = expandMasterAdoptedExpensesToSplits({events:cities ?? [],forecasts:[...lines,...(adoptionRes.data ?? [])] as any[],transactions:txRes.data ?? []}).filter(t => ids.includes(t.event_id));
  return {forecastSlices, transactionSlices: transactionSlices.map(t => ({...t, account_id:null, held_by_supplier_id:null, paying_partner_id:null}))};
}