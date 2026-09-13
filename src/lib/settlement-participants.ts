/**
 * Fonte de verdade das partes de um evento — `event_settlement_participants`.
 *
 * Desde a épica #146 (Fase 1) a tabela `event_partners` é DERIVADA: existe só
 * para o pagador/ordenador (can_pay / can_order) e para as FKs históricas.
 * Todo o cálculo do fecho, capital e documentos lê os participantes do
 * apuramento, incluindo a casa (Mundo Propício), que aqui é uma linha REAL
 * (`participant_kind = 'house'`) e já não é injetada em código.
 */

import { supabase } from "@/integrations/supabase/client";

export const HOUSE_PARTNER_NAME = "MUNDO PROPÍCIO";

export interface SettlementParticipant {
  /** id legacy: aponta para event_partners quando existe (chave dos extras/despesas pagas). */
  id: string;
  /** id real da linha em event_settlement_participants. */
  participantId: string;
  event_id: string;
  settlement_id: string;
  settlementName: string;
  settlementParentId: string | null;
  settlementPosition: number;
  event_partner_id: string | null;
  supplier_id: string | null;
  participant_kind: string;
  isHouse: boolean;
  /** 'settles' (acerta neste apuramento) ou 'nominal' (só informativo). */
  mode: string;
  /** nome legacy de profit_pct — mantido para os consumidores do fecho. */
  percentage: number;
  loss_percentage: number | null;
  expense_includes_iva: boolean | null;
  visible_in_docs: boolean;
  can_order: boolean;
  can_pay: boolean;
  notes: string | null;
  suppliers: { name: string } | null;
}

type RawParticipant = {
  id: string;
  event_id: string;
  settlement_id: string;
  event_partner_id: string | null;
  supplier_id: string | null;
  participant_kind: string;
  mode: string;
  profit_pct: number | string | null;
  loss_pct: number | string | null;
  expense_includes_iva: boolean | null;
  visible_in_docs: boolean;
  can_order: boolean;
  can_pay: boolean;
  notes: string | null;
  suppliers?: { name?: string | null } | null;
  event_settlements?: { name?: string | null; parent_id?: string | null; position?: number | null } | null;
};

export function toSettlementParticipant(row: RawParticipant): SettlementParticipant {
  const isHouse = row.participant_kind === "house";
  const name = row.suppliers?.name || (isHouse ? HOUSE_PARTNER_NAME : "—");
  return {
    id: row.event_partner_id ?? row.id,
    participantId: row.id,
    event_id: row.event_id,
    settlement_id: row.settlement_id,
    settlementName: row.event_settlements?.name || "Fechamento do evento",
    settlementParentId: row.event_settlements?.parent_id ?? null,
    settlementPosition: Number(row.event_settlements?.position ?? 0),
    event_partner_id: row.event_partner_id,
    supplier_id: row.supplier_id,
    participant_kind: row.participant_kind,
    isHouse,
    mode: row.mode,
    percentage: Number(row.profit_pct || 0),
    loss_percentage: row.loss_pct == null ? null : Number(row.loss_pct),
    expense_includes_iva: row.expense_includes_iva ?? null,
    visible_in_docs: row.visible_in_docs !== false,
    can_order: !!row.can_order,
    can_pay: !!row.can_pay,
    notes: row.notes ?? null,
    suppliers: { name },
  };
}

const SELECT =
  "id, event_id, settlement_id, event_partner_id, supplier_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, visible_in_docs, can_order, can_pay, notes, suppliers(name), event_settlements(name, parent_id, position)";

/** Participantes de todos os apuramentos dos eventos indicados. */
export async function fetchSettlementParticipants(eventIds: string[]): Promise<SettlementParticipant[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from("event_settlement_participants")
    .select(SELECT)
    .in("event_id", eventIds)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => toSettlementParticipant(r as RawParticipant));
}

/** Todos os participantes visíveis (usado nos relatórios globais). */
export async function fetchAllSettlementParticipants(): Promise<SettlementParticipant[]> {
  const { data, error } = await supabase
    .from("event_settlement_participants")
    .select(SELECT)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => toSettlementParticipant(r as RawParticipant));
}

export interface SettlementOption {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  is_sealed: boolean;
}

export async function fetchEventSettlements(eventIds: string[]): Promise<SettlementOption[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from("event_settlements")
    .select("id, name, parent_id, position, is_sealed")
    .in("event_id", eventIds)
    .order("position");
  if (error) throw error;
  return (data ?? []) as SettlementOption[];
}

/**
 * "Sócios locais" — quota que NÃO pertence ao sócio em causa, para os
 * documentos estanques: 100 − % do sócio destinatário.
 */
export function localPartnersPct(partnerPct: number): number {
  return Math.round((100 - Number(partnerPct || 0)) * 10000) / 10000;
}

/**
 * Documento estanque de um sócio (e2): o destinatário só vê a SUA linha e uma
 * linha agregada "Sócios locais" com o resto (100 − a sua %). Nunca vê nomes,
 * percentagens nem participantes de outros apuramentos — em particular não vê
 * os participantes do apuramento acima do seu.
 */
export interface PartnerDocRow {
  label: string;
  pct: number;
  isRecipient: boolean;
}

export function partnerDocRows<T extends { participantId: string; settlement_id: string; percentage: number; suppliers: { name: string } | null }>(
  participants: T[],
  recipientParticipantId: string,
): PartnerDocRow[] {
  const me = participants.find((p) => p.participantId === recipientParticipantId);
  if (!me) return [];
  const pct = Number(me.percentage || 0);
  const rows: PartnerDocRow[] = [
    { label: me.suppliers?.name || "—", pct, isRecipient: true },
  ];
  const rest = localPartnersPct(pct);
  if (rest > 0) rows.push({ label: "Sócios locais", pct: rest, isRecipient: false });
  return rows;
}

/** Apuramentos que um participante pode ver: só o seu nó (nunca a raiz do pai). */
export function visibleSettlementIdsForParticipant<T extends { supplier_id: string | null; settlement_id: string }>(
  participants: T[],
  supplierId: string,
): string[] {
  return Array.from(
    new Set(participants.filter((p) => p.supplier_id === supplierId).map((p) => p.settlement_id)),
  );
}


/**
 * Quota residual da casa: 100 − Σ profit_pct de TODOS os participantes `partner`
 * do apuramento (settles **e** nominal).
 *
 * Porque também os nominais: o motor decompõe o residual da MP em `declared`
 * (casa) + `ivaDeductible` + `nominalGap`. Se a casa absorvesse a quota nominal,
 * essa parcela era contada duas vezes e a conferência C2 deixava de fechar.
 */
export function residualHousePct(participants: Array<{ percentage: number | string; mode?: string; isHouse?: boolean }>): number {
  const sum = participants
    .filter((p) => !p.isHouse)
    .reduce((s, p) => s + Number(p.percentage || 0), 0);
  return Math.round((100 - sum) * 10000) / 10000;
}

