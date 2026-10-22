/**
 * #335 fase 3a — tipos dos contratos do núcleo (transaction_offset_execute/reverse)
 * e regras de permissão/controlo do cliente. Sem I/O.
 * Decisões do Pedro: aplicar = admin/manager/editor; estornar = só admin;
 * na ficha da transação só leitura dos grupos (o "Compensa com…" legado mantém-se).
 */
import type { OffsetContractItem } from "./index";

export type OffsetRole = string;

export interface OffsetExecuteRequest {
  request_id: string;
  supplier_id: string;
  /** Movimento de dinheiro: conta + data + valor com sinal, ou null (#337 sem extrato fica para depois). */
  movement: { account_id: string; date: string; amount_cents: number; bank_statement_line_id?: string } | null;
  items: OffsetContractItem[];
}

export interface OffsetExecuteResponse {
  group_id: string;
  status: string;
}

export interface OffsetReverseRequest {
  request_id: string;
  group_id: string;
  reason: string;
}

/** Linha de transaction_offset_control. */
export interface OffsetControlRow {
  enabled: boolean;
  reverse_enabled: boolean;
}

/** N0 = aberto; N1 = aplicar fechado, estorno aberto (kill_switch); N2 = tudo fechado (emergency). */
export type OffsetControlLevel = "N0" | "N1" | "N2";

export function offsetControlLevel(c: OffsetControlRow): OffsetControlLevel {
  if (c.enabled && c.reverse_enabled) return "N0";
  if (!c.enabled && c.reverse_enabled) return "N1";
  return "N2";
}

const APPLY_ROLES = new Set(["admin", "platform_admin", "manager", "editor"]);
const REVERSE_ROLES = new Set(["admin", "platform_admin"]);

export function canApplyOffset(roles: OffsetRole[], control: OffsetControlRow): boolean {
  return control.enabled && roles.some((r) => APPLY_ROLES.has(r));
}

export function canReverseOffset(roles: OffsetRole[], control: OffsetControlRow): boolean {
  return control.reverse_enabled && roles.some((r) => REVERSE_ROLES.has(r));
}

/** A ficha da transação nunca edita grupos (só leitura). */
export const TRANSACTION_SHEET_OFFSET_GROUPS_READ_ONLY = true;
