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

/**
 * Sincroniza um card de Pipeline com o BP + Transação.
 * - Cria 1 linha em event_forecasts (income, approved) + 1 transação (income, approved).
 * - Se já existir vínculo, ATUALIZA ambos com o novo amount/iva/desc.
 * - Sempre approved (pendente de pagamento). A liquidação é feita depois,
 *   no fluxo normal de pagamentos.
 * - Permutas (is_barter) ficam só no pipeline — nunca geram BP/TX.
 *
 * Disparado MANUALMENTE pelo utilizador (botão "Gerar BP+TX" / "Atualizar BP+TX"
 * no drawer). NÃO é chamado automaticamente em mudanças de stage.
 */
export async function syncSponsorToBP(row: SponsorshipPipelineRow): Promise<SyncResult> {
  if (row.is_barter) return { skipped: true, reason: "barter_pipeline_only" };
  // D21: só patrocínios fechados entram no BP de receita. Em negociação ficam no pipeline.
  if (row.stage !== "closed") return { skipped: true, reason: "stage_not_closed" };
  if (!row.company_id) return { skipped: true, reason: "no_company" };

  const amount = Number(row.confirmed_amount || 0);
  if (!(amount > 0)) return { skipped: true, reason: "zero_amount" };

  const categoryId = await getCategoryIdForCompany("1.2.01", row.company_id);
  if (!categoryId) return { skipped: true, reason: "category_1.2.01_not_found" };

  const description = row.supplier_name || "Patrocínio";
  const ivaRate = Number(row.iva_rate ?? 23);
  const today = todayLocalISO();

  // Caso 0 (D22): card meio-vinculado — só um dos lados existe. Nunca criar de novo
  // (duplicaria BP+TX). Exige correção manual do vínculo.
  if (
    (row.linked_transaction_id && !row.linked_forecast_id) ||
    (!row.linked_transaction_id && row.linked_forecast_id)
  ) {
    return { skipped: true, reason: "half_linked" };
  }

  // Caso 1: já tem TX e BP vinculados → update em ambos.
  // (Nunca toca em payment_date / status — se TX já foi paga, mantém pago.)
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

  // Caso 2: criar do zero → 1) TX approved, 2) BP vinculada, 3) update do card.
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      type: "income",
      status: "approved",
      event_id: row.event_id,
      category_id: categoryId,
      supplier_id: row.supplier_id,
      description,
      amount,
      iva_rate: ivaRate,
      date: today,
      company_id: row.company_id,
      paid_amount: 0,
    } as never)
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
      notes: "Gerado a partir do Pipeline de Patrocínios",
    } as never)
    .select("id")
    .single();
  if (fcErr || !fc) {
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
  }

  return { skipped: false, forecast_id: forecastId, transaction_id: transactionId, created: true };
}

/**
 * Verifica se a TX vinculada já tem pagamento (paid_amount > 0 ou status='paid').
 * Usado para bloquear edição de valor sem desfazer liquidação.
 */
export async function isLinkedTransactionPaid(transactionId: string): Promise<boolean> {
  const { data } = await supabase
    .from("transactions")
    .select("status, paid_amount")
    .eq("id", transactionId)
    .maybeSingle();
  if (!data) return false;
  const r = data as { status: string; paid_amount: number | null };
  return r.status === "paid" || Number(r.paid_amount || 0) > 0.005;
}
