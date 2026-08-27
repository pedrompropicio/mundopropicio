/**
 * Capital do Sócio (AEP — Associação em Participação, DL 231/81 PT).
 *
 * Ponte transação ↔ sócio do evento (`partner_capital_moves`, UNIQUE(transaction_id)).
 * Usado pelos modais de transação (vínculo automático ao gravar) e pelo painel
 * "Capital do Sócio (AEP)" (rede de segurança / aportes antigos).
 */
import { supabase } from "@/integrations/supabase/client";
import { capitalKindFromCode, type CapitalKind } from "@/lib/capital-branch";

export interface EventPartnerOption {
  id: string;
  percentage: number | null;
  suppliers?: { name?: string | null } | null;
}

/** Rótulo do sócio para os seletores: "Nome (33%)". */
export function partnerLabel(p: EventPartnerOption): string {
  const name = p.suppliers?.name ?? "Sócio";
  return p.percentage != null ? `${name} (${p.percentage}%)` : name;
}

/**
 * Sócios do evento; se o evento (sub-evento) não tiver sócios próprios,
 * herda os do Master — mesma regra dos campos Ordenador/Pagador.
 */
export async function fetchEventPartnersWithInheritance(eventId: string | null | undefined) {
  if (!eventId) return [] as EventPartnerOption[];
  const cols = "id, percentage, suppliers(name)";
  const { data: own, error: ownErr } = await supabase
    .from("event_partners").select(cols).eq("event_id", eventId).order("created_at");
  if (ownErr) throw ownErr;
  if (own && own.length > 0) return own as unknown as EventPartnerOption[];

  const { data: ev, error: evErr } = await supabase
    .from("events").select("parent_event_id").eq("id", eventId).maybeSingle();
  if (evErr) throw evErr;
  if (!ev?.parent_event_id) return [] as EventPartnerOption[];

  const { data: inherited, error: inhErr } = await supabase
    .from("event_partners").select(cols).eq("event_id", ev.parent_event_id).order("created_at");
  if (inhErr) throw inhErr;
  return (inherited ?? []) as unknown as EventPartnerOption[];
}

/** Vínculo de capital existente de uma transação (ou null). */
export async function fetchPartnerCapitalMove(transactionId: string) {
  const { data, error } = await supabase
    .from("partner_capital_moves")
    .select("id, partner_id, kind, event_id")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; partner_id: string; kind: CapitalKind; event_id: string } | null;
}

/**
 * Cria/atualiza o vínculo de capital de uma transação.
 * O `kind` deriva SEMPRE do código da categoria (10.1.01/02/03).
 */
export async function upsertPartnerCapitalMove(args: {
  eventId: string;
  transactionId: string;
  partnerId: string;
  categoryCode: string | null | undefined;
}) {
  const kind = capitalKindFromCode(args.categoryCode);
  if (!kind) {
    throw new Error(
      "Só transações de capital (ramo 10.1) podem ser ligadas a um sócio como movimento de capital",
    );
  }
  const { error } = await supabase
    .from("partner_capital_moves")
    .upsert(
      {
        event_id: args.eventId,
        partner_id: args.partnerId,
        transaction_id: args.transactionId,
        kind,
      } as any,
      { onConflict: "transaction_id" },
    );
  if (error) throw error;
}

/** Remove o vínculo de capital de uma transação (categoria saiu do ramo 10.1). */
export async function deletePartnerCapitalMove(transactionId: string) {
  const { error } = await supabase
    .from("partner_capital_moves").delete().eq("transaction_id", transactionId);
  if (error) throw error;
}
