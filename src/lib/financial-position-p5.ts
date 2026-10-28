import { z } from "zod";

/** Contrato p5-v3 da edge function `financial-position` (fail-closed; p5-v2 + cobertura_futuros, D-ERP326). */
export const P5_VERSION = "p5-v3";
const amount = z.number().finite();
const count = z.number().int().nonnegative();
const sourced = z.object({ valor: amount.nullable(), origem: z.string().min(1) });

const eventSchema = z.object({
  event_id: z.string().uuid(), nome: z.string(), estagio: z.string(), so_bp: z.boolean(), historico: z.boolean(),
  fora_dos_totais: z.boolean(), motivo_fora: z.enum(["em_curso_projecao", "historico_so_bp", "estagio_fora_dos_totais"]).nullable(), resultado_evento: amount.nullable(), partes_socios_total: amount.nullable(),
  creditos_mp: z.object({ parte_casa: amount, iva_devolvido: amount, outros: amount, total: amount }).nullable(),
  resultado_mp: amount.nullable(), checks_ok: z.boolean(), alertas: z.array(z.string()), origem: z.string(),
});
const structureLine = z.object({ code: z.string().nullable(), nome: z.string(), bruto: amount, n: count });
const partnerLine = z.object({
  event_id: z.string().uuid(), supplier_id: z.string().uuid(), nome: z.string(), transferBase: amount, transferVat: amount,
  transferTotal: amount, transfer_with_vat: z.boolean(), pago_contratos: amount, liquido: amount,
  sentido: z.enum(["a_receber", "por_liquidar", "zero"]), origem: z.string(),
});

const pair = z.object({ com_sem_linha: amount, sem_linha_cobre_bp: amount }).strict();
const futureEvent = z.object({
  event_id: z.string().uuid(), nome: z.string(), estagio: z.enum(["planeamento", "em_curso"]),
  first_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), started: z.boolean(), data_indeterminada: z.boolean(),
  vendas_bruto: amount, fonte_vendas: z.enum(["unica", "indeterminado", "sem_vendas"]),
  bp_total: amount, despesas_pagas: amount, a_pagar_lancado: amount, a_pagar_sem_linha: amount, bp_por_lancar: amount,
  custo_total_projetado: pair, cobertura: pair,
  aporte_socios: z.object({ total: amount, por_transferencia_conta_liquida: amount, pago_direto_automatico: amount,
    linhas: z.array(z.object({ data: z.string().nullable(), descricao: z.string(), conta: z.string().nullable(), valor: amount }).strict()) }).strict(),
  aporte_mp_estimativa: amount.nonnegative(),
  dinheiro_parado_bruto: z.object({ desde_corte: amount, anterior_ao_corte: amount, total: amount }).strict(),
  dinheiro_parado: amount.nonnegative(), caixa_mp_adiantado: amount.nonnegative(),
  necessidade_financiamento: pair,
}).strict();
const futureOffice = z.object({
  account_id: z.string().uuid(), nome: z.string(), vendas_eventos_futuros: amount, retido_conta: amount.nullable(),
  saido_minimo: amount.nonnegative().nullable(), fonte: z.enum(["unica", "indeterminado"]),
  eventos: z.array(z.object({ event_id: z.string().uuid(), vendas: amount }).strict()), nota: z.string().min(1),
}).strict();
export const futureCoverageSchema = z.object({
  meta: z.object({ incompleto: z.boolean(), motivo: z.string().nullable(), nota_bp_provisorio: z.string().min(1), notas: z.record(z.string()) }).strict(),
  eventos: z.array(futureEvent).nullable(),
  bilheteiras: z.array(futureOffice).nullable(),
  total: z.object({
    vendas_futuras: amount, despesas_pagas_futuras: amount, a_pagar_lancado_futuros: amount, a_pagar_sem_linha_futuros: amount,
    bp_por_lancar_futuros: amount, saido_minimo_total: amount.nullable(), aporte_socios_total: amount, aporte_mp_estimativa_total: amount,
    dinheiro_de_eventos_em_conta: amount, caixa_mp_adiantado_total: amount, necessidade: pair,
  }).strict().nullable(),
}).strict().superRefine((v, ctx) => {
  const nulls = v.eventos === null && v.bilheteiras === null && v.total === null;
  if (v.meta.incompleto !== nulls) ctx.addIssue({ code: "custom", message: "cobertura_incompleta_inconsistente" });
});

export const financialPositionP5Schema = z.object({
  meta: z.object({
    version: z.literal(P5_VERSION), base_version: z.string().min(1), company_id: z.string().uuid(),
    year: z.number().int().nullable(), data_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), gerado_em: z.string(),
    eventos_processados: count, eventos_com_erro: z.array(z.object({ event_id: z.string().uuid(), nome: z.string(), motivo: z.string() })),
    incompleto: z.boolean(), saldos_visiveis: z.boolean(), duracao_ms: count.optional(),
  }),
  eventos: z.array(eventSchema),
  estrutura: z.object({
    bruto: amount, linhas: count, por_pagar: amount, por_pagar_n: count, origem: z.string(),
    por_categoria: z.array(structureLine.extend({ ebitda_class: z.string().nullable(), alerta: z.string().nullable() })),
    excluidas: z.array(structureLine.extend({ motivo: z.string() })),
  }),
  resultado_mp_ano: z.object({
    sem_estrutura: amount, com_estrutura: amount,
    participacoes: z.object({
      cloudscape: z.object({ valor: amount, linhas: count, origem: z.string().min(1) }).strict(),
    }).strict(),
    total_mp: amount,
  }).strict().nullable(),
  socios: z.object({
    linhas: z.array(partnerLine),
    a_receber_total: amount.nullable(), por_liquidar_total: amount.nullable(),
    alertas: z.array(z.object({ event_id: z.string().uuid(), supplier_id: z.string().uuid(), alerta: z.string() })),
  }),
  projecao_em_curso: z.object({
    eventos: z.array(eventSchema.pick({ event_id: true, nome: true, estagio: true, resultado_evento: true, resultado_mp: true, partes_socios_total: true })),
    socios_linhas: z.array(partnerLine), resultado_mp_total: amount.nullable(),
    socios_a_receber_total: amount.nullable(), socios_por_liquidar_total: amount.nullable(), nota: z.string().min(1),
  }),
  saldo_geral: z.object({
    ativos: z.object({ caixa: sourced, cartoes: sourced, retido_visivel: sourced, retido_ocultas: sourced, a_receber: sourced, a_receber_socios: sourced, total: amount }),
    passivos: z.object({ a_pagar: sourced.extend({ dos_quais_bp_sem_transacao: sourced }), estrutura_por_pagar: sourced, socios_por_liquidar: sourced, total: amount }),
    posicao_hoje: amount, notas: z.array(z.string()),
    informativo: z.object({ transitorias_pagar: sourced, transitorias_receber: sourced, acerto: z.unknown() }),
  }).nullable(),
  cobertura_futuros: futureCoverageSchema,
}).superRefine((v, ctx) => {
  if (!v.meta.saldos_visiveis && v.saldo_geral !== null) ctx.addIssue({ code: "custom", message: "saldo_geral_sem_permissao" });
  if (v.meta.incompleto && (v.resultado_mp_ano !== null || v.saldo_geral !== null)) ctx.addIssue({ code: "custom", message: "parcial_somado" });
  const countedIds = new Set(v.eventos.filter((e) => e.estagio === "em_fecho" || e.estagio === "fechado").map((e) => e.event_id));
  const projectionIds = new Set(v.eventos.filter((e) => e.estagio === "em_curso" || e.estagio === "planeamento").map((e) => e.event_id));
  if (v.eventos.some((e) => e.fora_dos_totais === countedIds.has(e.event_id)
    || (projectionIds.has(e.event_id) && e.motivo_fora !== "em_curso_projecao"))) ctx.addIssue({ code: "custom", message: "estagio_inconsistente" });
  if (v.socios.linhas.some((l) => !countedIds.has(l.event_id))) ctx.addIssue({ code: "custom", message: "socio_projecao_nos_totais" });
  if (v.projecao_em_curso.socios_linhas.some((l) => !projectionIds.has(l.event_id))
    || v.projecao_em_curso.eventos.length !== projectionIds.size
    || new Set(v.projecao_em_curso.eventos.map((e) => e.event_id)).size !== projectionIds.size
    || v.projecao_em_curso.eventos.some((e) => !projectionIds.has(e.event_id) || !["em_curso", "planeamento"].includes(e.estagio))) ctx.addIssue({ code: "custom", message: "projecao_inconsistente" });
});

export type FinancialPositionP5 = z.infer<typeof financialPositionP5Schema>;

export function parseFinancialPositionP5(raw: unknown): FinancialPositionP5 {
  const r = financialPositionP5Schema.safeParse(raw);
  if (!r.success) throw new Error("financial_position_invalid_response");
  return r.data;
}
