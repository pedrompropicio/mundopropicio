/**
 * (P5) Posição Financeira — montagem PURA do JSON p5-v1.
 *
 * Não calcula o motor nem regras da base: recebe o JSON da RPC
 * get_financial_position_base (p4-v1), o resumo do motor por evento
 * (computeStatementEngine / buildPartnerStatement do statement-service) e as
 * linhas de despesa sem evento. Só classifica, soma e rotula.
 */

export const P5_VERSION = "p5-v1";

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

// ── Custos de estrutura (D-ERP323) ───────────────────────────────────────
export interface StructureTxInput {
  code: string | null;
  name: string | null;
  ebitda_class: string | null;
  amount: number;
  iva_rate: number | null;
  paid_amount: number | null;
  status: string;
}

export type StructureClass =
  | { included: false; motivo: "transferencia_interna" | "iva_entregue" | "imposto_rendimento" | "financeiro" }
  | { included: true; alerta: "sem_categoria" | "possivel_custo_evento_sem_evento" | null };

/** Exclui transferências internas (10.3), IVA entregue (10.5.01), imposto sobre o rendimento e financeiro (10.2.*). */
export function classifyStructure(row: Pick<StructureTxInput, "code" | "ebitda_class">): StructureClass {
  const code = (row.code ?? "").trim();
  const ebitda = row.ebitda_class ?? "";
  if (code === "10.3" || code.startsWith("10.3.")) return { included: false, motivo: "transferencia_interna" };
  if (code === "10.5.01") return { included: false, motivo: "iva_entregue" };
  if (ebitda === "imposto_rendimento") return { included: false, motivo: "imposto_rendimento" };
  if (ebitda === "financeiro" || code === "10.2" || code.startsWith("10.2.")) return { included: false, motivo: "financeiro" };
  if (!code) return { included: true, alerta: "sem_categoria" };
  if (/^(2|3)\./.test(code)) return { included: true, alerta: "possivel_custo_evento_sem_evento" };
  return { included: true, alerta: null };
}

/** Bruto com divisão decimal (iva_rate é INTEGER na BD). */
export const grossOf = (amount: number, iva: number | null) => (Number(amount) || 0) * (1 + (Number(iva) || 0) / 100.0);

export function assembleStructure(rows: StructureTxInput[]) {
  const inc = new Map<string, { code: string | null; nome: string; ebitda_class: string | null; bruto: number; n: number; alerta: string | null }>();
  const exc = new Map<string, { code: string | null; nome: string; motivo: string; bruto: number; n: number }>();
  let bruto = 0, n = 0, porPagar = 0, porPagarN = 0;
  for (const row of rows) {
    const g = grossOf(row.amount, row.iva_rate);
    const c = classifyStructure(row);
    const key = row.code ?? "-";
    if (!c.included) {
      const e = exc.get(key) ?? { code: row.code, nome: row.name ?? "(sem)", motivo: c.motivo, bruto: 0, n: 0 };
      e.bruto += g; e.n += 1; exc.set(key, e);
      continue;
    }
    const e = inc.get(key) ?? { code: row.code, nome: row.name ?? "(sem categoria)", ebitda_class: row.ebitda_class, bruto: 0, n: 0, alerta: c.alerta };
    e.bruto += g; e.n += 1; inc.set(key, e);
    bruto += g; n += 1;
    if (row.status === "approved" || row.status === "pending") {
      const open = Math.max(g - (Number(row.paid_amount) || 0), 0);
      porPagar += open; porPagarN += 1;
    }
  }
  const sortDesc = <T extends { bruto: number }>(a: T[]) => a.sort((x, y) => y.bruto - x.bruto).map((x) => ({ ...x, bruto: r2(x.bruto) }));
  return {
    bruto: r2(bruto), linhas: n, por_pagar: r2(porPagar), por_pagar_n: porPagarN,
    por_categoria: sortDesc([...inc.values()]),
    excluidas: sortDesc([...exc.values()]),
    origem: "transactions sem evento (D-ERP323)",
  };
}

// ── Eventos e sócios ─────────────────────────────────────────────────────
export interface EngineSummary {
  eventNetResult: number;
  partnersPaidTotal: number;
  house: { residual: number; declared: number; ivaDeductible: number };
  checksOk: boolean;
  errors: string[];
}
export interface PartnerAccountInput {
  supplier_id: string;
  nome: string;
  transferBase: number;
  transferVat: number;
  transferTotal: number;
  transferWithVat: boolean;
}
export interface EventInput {
  event_id: string;
  nome: string;
  estagio: string;
  so_bp: boolean;
  engine: EngineSummary | null;
  partners: PartnerAccountInput[];
  error?: string | null;
}

/** Regra de sinal (D-ERP323): base < 0 → a receber |base| (sem IVA); total > 0 → por liquidar (com IVA se aplicável). */
export function partnerDirection(p: Pick<PartnerAccountInput, "transferBase" | "transferTotal">, pagoContratos = 0) {
  if (p.transferBase < 0) return { sentido: "a_receber" as const, valor: r2(-p.transferBase) };
  if (p.transferTotal > 0) return { sentido: "por_liquidar" as const, valor: r2(Math.max(p.transferTotal - pagoContratos, 0)) };
  return { sentido: "zero" as const, valor: 0 };
}

export interface AssembleInput {
  base: any;
  events: EventInput[];
  structure: StructureTxInput[];
  /** Pagamentos de contratos P3 por `${event_id}:${supplier_id}`. */
  paidContracts: Record<string, number>;
  generatedAt: string;
}

const val = (valor: number | null, origem: string) => ({ valor: valor == null ? null : r2(valor), origem });

export function assembleFinancialPosition(input: AssembleInput) {
  const { base } = input;
  const eventos_com_erro = input.events.filter((e) => e.error || !e.engine).map((e) => ({ event_id: e.event_id, nome: e.nome, motivo: e.error ?? "sem_resultado" }));
  const incompleto = eventos_com_erro.length > 0;

  const alertasSocios: Array<{ event_id: string; supplier_id: string; alerta: string }> = [];
  const socioLinhas: any[] = [];
  const eventos = input.events.map((e) => {
    const en = e.engine;
    const historico = e.estagio === "historico";
    if (en && !historico) {
      for (const p of e.partners) {
        const pago = input.paidContracts[`${e.event_id}:${p.supplier_id}`] ?? 0;
        const d = partnerDirection(p, pago);
        socioLinhas.push({
          event_id: e.event_id, supplier_id: p.supplier_id, nome: p.nome,
          transferBase: r2(p.transferBase), transferVat: r2(p.transferVat), transferTotal: r2(p.transferTotal),
          transfer_with_vat: p.transferWithVat, pago_contratos: r2(pago), liquido: d.valor, sentido: d.sentido,
          origem: "partner-statement (buildPartnerStatement)",
        });
        if (e.estagio === "fechado" && d.sentido === "por_liquidar" && d.valor > 0 && pago === 0) {
          alertasSocios.push({ event_id: e.event_id, supplier_id: p.supplier_id, alerta: "acerto_possivelmente_pago_fora_do_sistema" });
        }
      }
    }
    const declared = en?.house.declared ?? 0;
    const iva = en?.house.ivaDeductible ?? 0;
    const residual = en?.house.residual ?? 0;
    return {
      event_id: e.event_id, nome: e.nome, estagio: e.estagio, so_bp: e.so_bp || historico, historico,
      fora_dos_totais: historico,
      resultado_evento: en ? r2(en.eventNetResult) : null,
      partes_socios_total: en ? r2(en.partnersPaidTotal) : null,
      creditos_mp: en ? { parte_casa: r2(declared), iva_devolvido: r2(iva), outros: r2(residual - declared - iva), total: r2(residual) } : null,
      resultado_mp: en ? r2(residual) : null,
      checks_ok: en ? en.checksOk : false,
      alertas: [
        ...(en && !en.checksOk ? ["checks_do_motor_falhados"] : []),
        ...(e.error ? ["erro_ou_timeout"] : []),
        "operacoes_terceiros_nao_incluidas_v1",
      ],
      origem: "motor (computeStatementEngine)",
    };
  });

  const estrutura = assembleStructure(input.structure);
  const counted = eventos.filter((e) => !e.fora_dos_totais && e.resultado_mp != null);
  const somaMp = counted.reduce((s, e) => s + (e.resultado_mp ?? 0), 0);
  const aReceberSocios = socioLinhas.filter((l) => l.sentido === "a_receber").reduce((s, l) => s + l.liquido, 0);
  const porLiquidar = socioLinhas.filter((l) => l.sentido === "por_liquidar").reduce((s, l) => s + l.liquido, 0);

  const resultado_mp_ano = incompleto ? null : { sem_estrutura: r2(somaMp), com_estrutura: r2(somaMp - estrutura.bruto) };
  const socios = {
    linhas: socioLinhas,
    a_receber_total: incompleto ? null : r2(aReceberSocios),
    por_liquidar_total: incompleto ? null : r2(porLiquidar),
    alertas: alertasSocios,
  };

  const pos = base.posicao ?? {};
  const visible = base.meta?.balances_visible === true && pos.caixa != null && pos.cartoes != null
    && base.retido?.total_visiveis != null && base.retido?.total_ocultas != null;
  let saldo_geral: any = null;
  if (visible && !incompleto) {
    const ativos = {
      caixa: val(pos.caixa, "rpc.posicao.caixa"),
      cartoes: val(pos.cartoes, "rpc.posicao.cartoes"),
      retido_visivel: val(base.retido.total_visiveis, "rpc.retido.total_visiveis"),
      retido_ocultas: val(base.retido.total_ocultas, "rpc.retido.total_ocultas"),
      a_receber: val(base.a_receber.total, "rpc.a_receber.total (sem transitórias)"),
      a_receber_socios: val(aReceberSocios, "motor.partner-statement"),
    };
    const passivos = {
      a_pagar: { ...val(base.a_pagar.total, "rpc.a_pagar.total (sem transitórias)"),
        dos_quais_bp_sem_transacao: val(base.alertas?.bp_sem_transacao?.total ?? 0, "rpc.alertas.bp_sem_transacao (já incluído; não somar)") },
      estrutura_por_pagar: val(estrutura.por_pagar, "transactions sem evento (D-ERP323)"),
      socios_por_liquidar: val(porLiquidar, "motor.partner-statement"),
    };
    const at = Object.values(ativos).reduce((s, v) => s + (v.valor ?? 0), 0);
    const pt = (passivos.a_pagar.valor ?? 0) + (passivos.estrutura_por_pagar.valor ?? 0) + (passivos.socios_por_liquidar.valor ?? 0);
    saldo_geral = {
      ativos: { ...ativos, total: r2(at) },
      passivos: { ...passivos, total: r2(pt) },
      posicao_hoje: r2(at - pt),
      notas: [
        "O retido entra por inteiro; parte pode pertencer a sócios.",
        "Transitórias de repasse fora do Saldo Geral (só informativas).",
        "Tudo com IVA. Caixa e retido só se somam aqui, rotulados (D-ERP27).",
      ],
      informativo: {
        transitorias_pagar: val(base.a_pagar.transitorias?.total ?? 0, "rpc.a_pagar.transitorias"),
        transitorias_receber: val(base.a_receber.transitorias?.total ?? 0, "rpc.a_receber.transitorias"),
        acerto: base.acerto_informativo ?? null,
      },
    };
  }

  return {
    meta: {
      version: P5_VERSION, base_version: String(base.meta?.version ?? ""),
      company_id: base.meta?.company_id ?? null, year: base.meta?.year ?? null,
      data_referencia: base.meta?.reference_date ?? null, gerado_em: input.generatedAt,
      eventos_processados: input.events.length - eventos_com_erro.length,
      eventos_com_erro, incompleto, saldos_visiveis: visible,
    },
    eventos, estrutura, resultado_mp_ano, socios, saldo_geral,
  };
}
