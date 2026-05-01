/**
 * Sincronização Pipeline de Patrocínios → BP + Transação.
 *
 * Quando um card está em estado "closed" (patrocínio pago) ou "barter" (permuta)
 * e tem auto_sync_bp = true, criamos/atualizamos:
 *   - 1 linha em event_forecasts (income, approved) — categoria 1.2.01 (Patrocínios) ou 1.2.02 (Apoios)
 *   - 1 transação em transactions (income, status='approved' por defeito) vinculada via transaction_id
 *
 * Idempotente: se o card já tiver linked_forecast_id / linked_transaction_id, faz UPDATE.
 *
 * Notas:
 *   - Categorias L3 são por empresa. Resolve por (code, company_id) do card.
 *   - Permuta (barter) → 1.2.02 Apoios. Pago (closed) → 1.2.01 Patrocínios.
 *   - description = supplier_name; amount = confirmed_amount (NET); iva_rate vem do card.
 *   - Não cria payment_date (transação fica como "Approved" pendente de pagamento real).
 */
import { supabase } from "@/integrations/supabase/client";
import type { SponsorshipPipelineRow } from "@/lib/sponsorship-pipeline";

export type SyncResult =
  | { skipped: true; reason: string }
  | { skipped: false; forecast_id: string; transaction_id: string; created: boolean };

async function getCategoryIdForCompany(code: "1.2.01" | "1.2.02", companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("account_categories")
    .select("id")
    .eq("code", code)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("[sponsor-sync] category lookup failed", { code, companyId, error });
    return null;
  }
  return (data?.id as string) ?? null;
}

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getDefaultIncomeAccountId(companyId: string): Promise<string | null> {
  // Heurística: primeira conta bancária ativa, não oculta, da empresa.
  const { data } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("is_hidden", false)
    .in("type", ["bank", "cash"])
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

export async function syncSponsorToBP(row: SponsorshipPipelineRow): Promise<SyncResult> {
  // Permutas e leads não geram BP/TX automaticamente — ficam só no pipeline.
  if (row.stage !== "closed") return { skipped: true, reason: "stage_not_closed" };
  if (row.is_barter) return { skipped: true, reason: "barter_pipeline_only" };
  if (!row.auto_sync_bp) return { skipped: true, reason: "auto_sync_disabled" };
  if (!row.company_id) return { skipped: true, reason: "no_company" };

  const amount = Number(row.confirmed_amount || 0);
  if (!(amount > 0)) return { skipped: true, reason: "zero_amount" };

  const categoryId = await getCategoryIdForCompany("1.2.01", row.company_id);
  if (!categoryId) return { skipped: true, reason: "category_1.2.01_not_found" };

  const description = row.supplier_name || "Patrocínio";
  const ivaRate = Number(row.iva_rate ?? 23);
  const today = todayLocalISO();

  // doc_status=invoice_received → fatura recebida = TX paga (cria com payment_date e conta).
  // Restantes (invoice_sent, post_event, awaiting) → TX approved pendente de pagamento.
  const isPaid = row.doc_status === "invoice_received";
  const accountId = isPaid ? await getDefaultIncomeAccountId(row.company_id) : null;

  // Caso 1: já tem TX e BP vinculados → update em ambos
  if (row.linked_transaction_id && row.linked_forecast_id) {
    const [{ error: txErr }, { error: fcErr }] = await Promise.all([
      supabase
        .from("transactions")
        .update({
          amount,
          iva_rate: ivaRate,
          description,
          category_id: categoryId,
        } as never)
        .eq("id", row.linked_transaction_id),
      supabase
        .from("event_forecasts")
        .update({
          amount,
          iva_rate: ivaRate,
          description,
          category_id: categoryId,
          formula_value: amount,
        } as never)
        .eq("id", row.linked_forecast_id),
    ]);
    if (txErr || fcErr) {
      console.error("[sponsor-sync] update failed", { txErr, fcErr });
      throw txErr || fcErr;
    }
    return {
      skipped: false,
      forecast_id: row.linked_forecast_id,
      transaction_id: row.linked_transaction_id,
      created: false,
    };
  }

  // Caso 2: criar do zero → 1) TX, 2) BP vinculada, 3) update do card
  const txPayload: Record<string, unknown> = {
    type: "income",
    status: isPaid ? "paid" : "approved",
    event_id: row.event_id,
    category_id: categoryId,
    supplier_id: row.supplier_id,
    description,
    amount,
    iva_rate: ivaRate,
    date: today,
    company_id: row.company_id,
    paid_amount: isPaid ? amount : 0,
  };
  if (isPaid) {
    txPayload.payment_date = today;
    if (accountId) txPayload.account_id = accountId;
  }

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert(txPayload as never)
    .select("id")
    .single();
  if (txErr || !tx) {
    console.error("[sponsor-sync] insert tx failed", txErr);
    throw txErr ?? new Error("Falha a criar transação");
  }
  const transactionId = (tx as { id: string }).id;

  const { data: fc, error: fcErr } = await supabase
    .from("event_forecasts")
    .insert({
      event_id: row.event_id,
      category_id: categoryId,
      type: "income",
      description,
      amount,
      iva_rate: ivaRate,
      status: "approved",
      formula_type: "fixed",
      formula_value: amount,
      is_transitory: false,
      transaction_id: transactionId,
      company_id: row.company_id,
      notes: `Gerado automaticamente do Pipeline de Patrocínios (${isPaid ? "Pago" : "Fechado"})`,
    } as never)
    .select("id")
    .single();
  if (fcErr || !fc) {
    // Rollback: apaga a TX que acabámos de criar
    await supabase.from("transactions").delete().eq("id", transactionId);
    console.error("[sponsor-sync] insert forecast failed", fcErr);
    throw fcErr ?? new Error("Falha a criar linha BP");
  }
  const forecastId = (fc as { id: string }).id;

  const { error: linkErr } = await supabase
    .from("sponsorship_pipeline" as never)
    .update({
      linked_forecast_id: forecastId,
      linked_transaction_id: transactionId,
    } as never)
    .eq("id", row.id);
  if (linkErr) {
    console.error("[sponsor-sync] link update failed", linkErr);
    // Não dá rollback — o utilizador pode re-vincular manualmente.
  }

  return { skipped: false, forecast_id: forecastId, transaction_id: transactionId, created: true };
}
