/**
 * #335 fase 3b — wrapper fino das chamadas ao núcleo do encontro de contas.
 *
 * Fonte: supabase/manual/20261021_issue335_offset_core.INERTE.sql
 *  - reconcile_bank_line(p_line_id uuid, p_items jsonb) RETURNS void — ramo 'offset':
 *    conta/data/sinal vêm da linha do extracto (servidor); request_id e supplier_id
 *    são lidos de p_items->0. Repetir o mesmo pedido (mesmo request_id + mesmo payload)
 *    devolve sem efeitos novos (idempotência durável por request_id + hash).
 *  - transaction_offset_reverse(p_group_id uuid, p_request_id uuid, p_reason text) RETURNS jsonb.
 *  - transaction_offset_control: linha única (enabled, reverse_enabled).
 *
 * types.ts só é regenerado no Publish, por isso a tipagem é explícita e o cast é local.
 * O cliente NUNCA envia amount/paid_amount/iva_rate.
 */
import type { OffsetContractItem } from "./index";
import { offsetErrorMessage, parseOffsetErrorCode } from "./index";
import type { OffsetControlRow } from "./contracts";

/** Cliente mínimo (permite mock nos testes). */
export interface OffsetRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: OffsetRawError | null }>;
  from: (table: string) => any;
}

export interface OffsetRawError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface OffsetFailure {
  ok: false;
  /** Código do núcleo ('preview_changed', ...), 'amount_mismatch' para Faltam/Excedem, ou o código PG. */
  code: string;
  message: string;
  /** Resposta incerta (rede/timeout): repetir o MESMO pedido com o mesmo request_id. */
  uncertain: boolean;
  /** preview_changed / encontro_em_conflito: recarregar a prévia, nunca repetir automaticamente. */
  reload: boolean;
}

export interface OffsetGroupSummary {
  id: string;
  status: string;
  movement_amount: number;
  operation_date: string;
  supplier_id: string;
  bank_line_id: string | null;
}

export type OffsetApplyResult = { ok: true; group: OffsetGroupSummary | null } | OffsetFailure;
export type OffsetReverseResult = { ok: true; result: unknown } | OffsetFailure;

const RELOAD_CODES = new Set(["preview_changed", "encontro_em_conflito"]);

/** Erro sem resposta do servidor (rede, abort, timeout): o resultado é desconhecido. */
export function isUncertainError(e: OffsetRawError | null | undefined): boolean {
  if (!e) return false;
  if (e.code && e.code.length > 0) return false;
  const m = (e.message ?? "").toLowerCase();
  return /failed to fetch|network|timeout|timed out|aborted|load failed|fetch/.test(m);
}

/** Traduz um erro do núcleo para pt-PT. */
export function translateOffsetError(e: OffsetRawError | null | undefined): OffsetFailure {
  const raw = (e?.message ?? "").trim();
  if (isUncertainError(e)) {
    return {
      ok: false,
      code: "uncertain",
      message: "Sem resposta do servidor. Pode repetir o mesmo pedido em segurança.",
      uncertain: true,
      reload: false,
    };
  }
  // A desigualdade vem como "Faltam X €" / "Excedem X €" (texto do próprio núcleo).
  const diff = /^(Faltam|Excedem)\s+(.+?€)/.exec(raw);
  if (diff) {
    const message = diff[1] === "Faltam" ? `Faltam ${diff[2]}` : `Excedem ${diff[2]}; corrija a transação ou o BP`;
    return { ok: false, code: "amount_mismatch", message, uncertain: false, reload: true };
  }
  const code = parseOffsetErrorCode(raw) ?? (e?.code || "erro");
  return {
    ok: false,
    code,
    message: offsetErrorMessage(parseOffsetErrorCode(raw) ? raw : code),
    uncertain: false,
    reload: RELOAD_CODES.has(code),
  };
}

/** Payload exacto de p_items para o ramo 'offset' do reconcile_bank_line. */
export function buildBankOffsetItems(
  items: OffsetContractItem[],
  requestId: string,
  supplierId: string,
): Record<string, unknown>[] {
  return items.map((it, i) => {
    const base: Record<string, unknown> = {
      ...(it.transaction_id ? { transaction_id: it.transaction_id } : { forecast_id: it.forecast_id }),
      mode: it.mode,
      cash_order: it.cash_order,
      expected_open_cents: it.expected_open_cents,
    };
    return i === 0 ? { request_id: requestId, supplier_id: supplierId, ...base } : base;
  });
}

const GROUP_COLS = "id, status, movement_amount, operation_date, supplier_id, bank_line_id";

/** Aplica o encontro sobre uma linha do banco. */
export async function applyBankLineOffset(
  client: OffsetRpcClient,
  args: { lineId: string; requestId: string; supplierId: string; items: OffsetContractItem[] },
): Promise<OffsetApplyResult> {
  const p_items = buildBankOffsetItems(args.items, args.requestId, args.supplierId);
  let error: OffsetRawError | null = null;
  try {
    const r = await client.rpc("reconcile_bank_line", { p_line_id: args.lineId, p_items });
    error = r.error;
  } catch (e: any) {
    error = { message: String(e?.message ?? e) };
  }
  if (error) return translateOffsetError(error);
  const group = await findGroupByRequest(client, args.requestId);
  return { ok: true, group };
}

/** Lê o grupo criado por um pedido (recuperação após resposta incerta). */
export async function findGroupByRequest(client: OffsetRpcClient, requestId: string): Promise<OffsetGroupSummary | null> {
  try {
    const { data, error } = await client
      .from("transaction_offset_groups")
      .select(GROUP_COLS)
      .eq("request_id", requestId)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data, movement_amount: Number(data.movement_amount) } as OffsetGroupSummary;
  } catch {
    return null;
  }
}

/** Estorno integral de um grupo (só admin; o servidor decide). */
export async function reverseOffsetGroup(
  client: OffsetRpcClient,
  args: { groupId: string; requestId: string; reason: string },
): Promise<OffsetReverseResult> {
  const reason = args.reason.trim();
  if (!reason) {
    return { ok: false, code: "reason_required", message: offsetErrorMessage("reason_required"), uncertain: false, reload: false };
  }
  try {
    const { data, error } = await client.rpc("transaction_offset_reverse", {
      p_group_id: args.groupId,
      p_request_id: args.requestId,
      p_reason: reason,
    });
    if (error) return translateOffsetError(error);
    return { ok: true, result: data };
  } catch (e: any) {
    return translateOffsetError({ message: String(e?.message ?? e) });
  }
}

/** Lê o controlo; qualquer falha ou ausência = fechado (falha fechado). */
export async function readOffsetControl(client: OffsetRpcClient): Promise<OffsetControlRow & { readable: boolean }> {
  const closed = { enabled: false, reverse_enabled: false, readable: false };
  try {
    const { data, error } = await client
      .from("transaction_offset_control")
      .select("enabled, reverse_enabled")
      .maybeSingle();
    if (error || !data) return closed;
    return { enabled: data.enabled === true, reverse_enabled: data.reverse_enabled === true, readable: true };
  } catch {
    return closed;
  }
}

/** uuid v4 por tentativa de confirmação. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
