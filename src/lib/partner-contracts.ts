/**
 * P7a — contratos de pagamento por sócio (RPCs 0269/0273/0275 já em Live).
 *
 * Este módulo só CONSOME as RPCs; não recalcula nada. A parte congelada vem
 * SEMPRE do motor do fecho (`useEventSettlementEngine` → ParticipantResult.share).
 *
 * LIMITAÇÃO CONHECIDA (decisão do Pedro, P3 1A): o servidor aceita o
 * `share_amount` enviado pelo cliente no congelar — o motor corre em TS e não
 * há recálculo no servidor. Por isso o ecrã nunca oferece campo editável.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ParticipantResult, SettlementNodeResult } from "@/lib/event-settlement-engine";

export const MAX_PARTNER_CONTRACTS = 4;
export const PARTNER_CONTRACT_TX_HINT =
  "Gerada por um contrato de pagamento do sócio. Valor, rubrica, fornecedor e evento só mudam pelo contrato; pagamento e conciliação seguem os fluxos normais.";

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export function isPartnerContractTx(t: { partner_contract_id?: string | null } | null | undefined): boolean {
  return !!t?.partner_contract_id;
}

/** Recusa no cliente o que a guarda 0274 recusaria no servidor. */
export function partnerContractEditBlock(
  original: { partner_contract_id?: string | null; amount?: unknown; category_id?: string | null; supplier_id?: string | null; event_id?: string | null },
  next: { amount?: unknown; category_id?: string | null; supplier_id?: string | null; event_id?: string | null },
): string | null {
  if (!isPartnerContractTx(original)) return null;
  const same = (a: unknown, b: unknown) => (a || null) === (b || null);
  if (r2(Number(next.amount)) !== r2(Number(original.amount))
    || !same(next.category_id, original.category_id)
    || !same(next.supplier_id, original.supplier_id)
    || (next.event_id !== undefined && !same(next.event_id, original.event_id))) {
    return "Transação de contrato do sócio: valor, rubrica, fornecedor e evento só se alteram no contrato (Pagamento do sócio).";
  }
  return null;
}

export interface PartnerShareOrigin {
  parent_quota: number;
  vat_returned_in: number;
  addback_in: number;
  additional_actives_total: number;
  additional_actives: Array<{ name: string; value: number }>;
  exclusive_revenue: number;
  expenses_in_perimeter: number;
  result_basis_gross: boolean;
  result_amount: number;
}

/** Projeção do nó, não um segundo motor. A base s/IVA exclui o IVA entregue aos filhos. */
export function buildShareOrigin(p: ParticipantResult, node: SettlementNodeResult): PartnerShareOrigin {
  return {
    parent_quota: r2(node.parentQuota ?? 0),
    vat_returned_in: r2(node.vatReturnedIn),
    addback_in: r2(node.addbackIn),
    additional_actives_total: r2(node.additionalActiveTotal),
    additional_actives: node.operations.map((op) => ({ name: op.name, value: r2(op.additionalActive) })).filter((op) => op.value !== 0),
    exclusive_revenue: r2(node.perimeter.revenueNet),
    expenses_in_perimeter: r2(node.nodeUsesGrossExpenses ? node.perimeter.expensesGross : node.perimeter.expensesNet),
    result_basis_gross: p.usesGrossExpenses,
    result_amount: r2(p.usesGrossExpenses ? node.resultGross : node.resultNet - node.vatReturnedOut),
  };
}

/** Não inventar origem para snapshots antigos, nem usar o motor atual em vez do snapshot. */
export function readFrozenOrigin(values: unknown): PartnerShareOrigin | null {
  if (!values || typeof values !== "object" || !("origin" in values)) return null;
  const o = values.origin;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const required = ["parent_quota", "vat_returned_in", "addback_in", "additional_actives_total", "exclusive_revenue", "expenses_in_perimeter", "result_amount"] as const;
  if (!required.every((key) => key in o && typeof (o as Record<string, unknown>)[key] === "number" && Number.isFinite((o as Record<string, unknown>)[key]))
    || !("result_basis_gross" in o) || typeof o.result_basis_gross !== "boolean"
    || !("additional_actives" in o) || !Array.isArray(o.additional_actives)
    || !o.additional_actives.every((a: unknown) => !!a && typeof a === "object" && "name" in a && typeof a.name === "string" && "value" in a && typeof a.value === "number" && Number.isFinite(a.value))) return null;
  return o as PartnerShareOrigin;
}

export function shareOriginRows(origin: PartnerShareOrigin) {
  const rows: Array<{ key: string; label: string; value: number; detail?: boolean; note?: string }> = [
    { key: "parent", label: "Quota do fechamento acima", value: origin.parent_quota },
    { key: "vat", label: "IVA dedutível devolvido", value: origin.vat_returned_in },
    { key: "addback", label: "Custos devolvidos", value: origin.addback_in },
    { key: "actives", label: "Ativos adicionais", value: origin.additional_actives_total },
    ...origin.additional_actives.map((a, i) => ({ key: `operation-${i}`, label: a.name, value: a.value, detail: true })),
    { key: "revenue", label: "Receitas exclusivas do fechamento", value: origin.exclusive_revenue, note: "lançadas só neste fechamento" },
    { key: "expenses", label: "(−) Despesas do perímetro na base do nó", value: -origin.expenses_in_perimeter },
  ].filter((row) => row.value !== 0);
  // Contar o total de ativos uma vez: sublinhas são detalhe, não novas parcelas.
  const sum = rows.filter((row) => !row.detail).reduce((total, row) => total + Math.round(row.value * 100), 0);
  const difference = (Math.round(origin.result_amount * 100) - sum) / 100;
  if (difference !== 0) rows.push({ key: "other", label: "Outros / arredondamentos", value: difference });
  rows.push({ key: "result", label: `= Resultado do fechamento (${origin.result_basis_gross ? "c/IVA" : "s/IVA"})`, value: origin.result_amount });
  return rows;
}

/** Valores do motor a 2 casas; sem reembolsos/extras/acerto. 0269 aceita o objeto
 * enviado pelo cliente sem recálculo no servidor (limitação conhecida).
 * 0273/0274 só exigem share_amount, não os campos removidos no P7b. */
export function buildFreezeValues(p: ParticipantResult, node: SettlementNodeResult) {
  return {
    share_amount: r2(p.share),
    share: r2(p.share),
    share_net: r2(p.shareNet),
    effective_pct: r2(p.effectivePct),
    uses_gross_expenses: !!p.usesGrossExpenses,
    settlement_id: p.settlementId,
    origin: buildShareOrigin(p, node),
  };
}

export interface ContractForm {
  beneficiaryId: string;
  gross: string;
  /** null = ainda sem resposta (sem pré-seleção). */
  withholding: boolean | null;
  whRate: string;
  whDue: string;
  due: string;
  label: string;
  advanceIds: string[];
}

export const emptyContractForm = (beneficiaryId = ""): ContractForm => ({
  beneficiaryId, gross: "", withholding: null, whRate: "", whDue: "", due: "", label: "", advanceIds: [],
});

/** Validação local; o servidor revalida tudo. `available` = restante + bruto do contrato a substituir. */
export function validateContractForm(f: ContractForm, ctx: { available: number; activeCount: number; replacing: boolean; advancesTotal: number }): string | null {
  if (!ctx.replacing && ctx.activeCount >= MAX_PARTNER_CONTRACTS) return "Máximo de 4 contratos ativos por sócio.";
  if (!f.beneficiaryId) return "Escolhe o beneficiário.";
  const gross = Number(f.gross);
  if (!f.gross || !Number.isFinite(gross) || gross <= 0 || r2(gross) !== gross) return "Valor bruto inválido (maior que 0, 2 casas).";
  if (gross > r2(ctx.available) + 1e-9) return "A soma dos contratos ultrapassa a parte congelada do sócio.";
  if (!f.due) return "O vencimento é obrigatório.";
  if (f.withholding === null) return "Responde se há retenção na fonte (Sim ou Não).";
  let wh = 0;
  if (f.withholding) {
    const rate = Number(f.whRate);
    if (!f.whRate || !Number.isFinite(rate) || rate <= 0 || rate >= 100 || r2(rate) !== rate) return "Taxa de retenção inválida (entre 0 e 100, 2 casas).";
    if (!f.whDue) return "A data da retenção é obrigatória.";
    wh = r2(gross * rate / 100);
  }
  if (wh + ctx.advancesTotal > gross + 1e-9) return "Retenção + adiantamentos ultrapassam o bruto: saldo negativo.";
  return null;
}

const ERRORS: Array<[string, string]> = [
  ["42501", "Sem permissão para contratos de sócios."],
  ["Sem permissão", "Sem permissão para contratos de sócios."],
  ["socio_nao_congelado", "O sócio tem de estar congelado (e acertar aqui) antes de contratar."],
  ["fechamento_selado", "Fechamento selado: reabra primeiro."],
  ["fechamento_invalido", "Fechamento inválido para este sócio."],
  ["participante_invalido", "Sócio inválido ou de outra empresa."],
  ["parte_congelada_em_falta", "A parte congelada não tem valor: descongele e congele de novo."],
  ["parte_congelada_invalida", "A parte congelada é inválida: descongele e congele de novo."],
  ["retencao_sem_resposta", "Responde se há retenção na fonte (Sim ou Não)."],
  ["retencao_invalida", "Taxa ou data da retenção inválidas."],
  ["retencao_nao_sem_parametros", "Sem retenção não se indica taxa nem data."],
  ["bruto_invalido", "Valor bruto inválido."],
  ["vencimento_obrigatorio", "O vencimento é obrigatório."],
  ["beneficiario_invalido", "Beneficiário inválido."],
  ["limite_contratos", "Máximo de 4 contratos ativos por sócio."],
  ["parte_excedida", "A soma dos contratos ultrapassa a parte congelada do sócio."],
  ["saldo_negativo", "Retenção + adiantamentos ultrapassam o valor: saldo negativo."],
  ["saldo_inconsistente", "O saldo do contrato não bate certo; recarregue e tente de novo."],
  ["saldo_em_lista", "O saldo do contrato está numa lista de pagamento; retire-o primeiro."],
  ["adiantamento_invalido", "Adiantamento não elegível: só livre, inteiro, em EUR, rubrica 10.1.03, do mesmo sócio e evento."],
  ["adiantamento_inexistente", "Adiantamento inexistente."],
  ["adiantamento_em_encontro_de_contas", "Adiantamento usado num encontro de contas."],
  ["beneficiario_diferente", "O adiantamento é de outro fornecedor: confirme explicitamente."],
  ["categoria_em_falta", "A empresa não tem a rubrica 10.1.03."],
  ["fornecedor_at_em_falta", "Falta o fornecedor «MINISTERIO DAS FINANCAS - IRS» para a retenção."],
  ["idempotency_key_conflito", "Pedido repetido com dados diferentes; recarregue."],
  ["chave_de_contrato_cancelado", "Este pedido refere-se a um contrato cancelado; recarregue."],
  ["contrato_com_pagamento", "O contrato tem pagamentos: não se cancela nem altera (estorne primeiro)."],
  ["contrato_conciliado", "O contrato está conciliado com o banco: não se cancela nem altera."],
  ["contrato_em_encontro_de_contas", "O contrato está num encontro de contas: não se cancela nem altera."],
  ["dependencia_inesperada", "O contrato tem ligações inesperadas; contacte o administrador."],
  ["dependencia_externa", "O contrato está ligado a BP/bilheteira; remova pelo fluxo normal."],
  ["contrato_inexistente", "Contrato inexistente ou já cancelado."],
  ["contrato_ja_cancelado", "Contrato já cancelado."],
  ["motivo_obrigatorio", "Indique o motivo."],
  ["contrato_nao_se_apaga", "Os contratos não se apagam: cancelam-se."],
  ["contrato_so_por_rpc", "Os contratos só se alteram por este ecrã."],
  ["transacao_de_contrato_so_por_rpc", "Transação de contrato do sócio: altere pelo contrato."],
  ["contratos de pagamento ativos", "O sócio tem contratos ativos: cancele-os antes de descongelar."],
];

/** Converte o erro da RPC em pt-PT legível; mensagens já em pt-PT do 0269 passam tal qual. */
export function mapPartnerContractError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const msg = e?.message ?? String(err ?? "");
  for (const [k, v] of ERRORS) if (msg.includes(k) || e?.code === k) return v;
  if (/^(Este sócio|Fechamento selado|Motivo obrigatório|Só se|Sócio )/.test(msg)) return msg;
  return "Não foi possível concluir a operação. Tente de novo.";
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(mapPartnerContractError(error));
  return data as T;
}

export interface PartnerContractStatus {
  participant_id: string;
  share_amount: number;
  contracted: number;
  paid: number;
  missing: number;
  remaining: number;
  contracts: Array<{ id: string; gross: number; withholding_applies: boolean; withholding_rate: number | null; withholding_amount: number;
    withholding_due_date: string | null; due_date: string; advances_amount: number; label: string | null; beneficiary_supplier_id: string;
    balance_tx_id: string | null; withholding_tx_id: string | null }>;
  free_advances: Array<{ id: string; description: string; amount: number; date: string; supplier_id: string }>;
}

export const partnerContractsApi = {
  freeze: (participantId: string, p: ParticipantResult, node: SettlementNodeResult, note: string) =>
    call("freeze_settlement_participant", { _participant_id: participantId, _values: buildFreezeValues(p, node), _note: note.trim() || null }),
  unfreeze: (participantId: string, reason: string) =>
    call("unfreeze_settlement_participant", { _participant_id: participantId, _reason: reason }),
  status: (participantId: string) => call<PartnerContractStatus>("partner_contract_status", { _participant_id: participantId }),
  create: (participantId: string, f: ContractForm, key: string) =>
    call<string>("create_partner_payment_contract", {
      _participant_id: participantId, _beneficiary: f.beneficiaryId, _gross: Number(f.gross), _wh_applies: f.withholding,
      _wh_rate: f.withholding ? Number(f.whRate) : null, _wh_due: f.withholding ? f.whDue : null, _due: f.due,
      _advance_ids: f.advanceIds, _label: f.label.trim() || null, _key: key,
    }),
  update: (contractId: string, f: ContractForm) =>
    call<string>("update_partner_payment_contract", {
      _contract_id: contractId, _beneficiary: f.beneficiaryId, _gross: Number(f.gross), _wh_applies: f.withholding,
      _wh_rate: f.withholding ? Number(f.whRate) : null, _wh_due: f.withholding ? f.whDue : null, _due: f.due,
      _advance_ids: f.advanceIds, _label: f.label.trim() || null,
    }),
  cancel: (contractId: string, reason: string) => call("cancel_partner_payment_contract", { _contract_id: contractId, _reason: reason }),
  attach: (contractId: string, advanceId: string, confirmBeneficiary: boolean) =>
    call("attach_partner_advance_to_contract", { _contract_id: contractId, _advance_tx_id: advanceId, _confirm_beneficiary: confirmBeneficiary }),
};
