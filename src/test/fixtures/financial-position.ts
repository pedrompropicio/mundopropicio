import type { FinancialPosition } from "@/lib/financial-position";
const stages = ["em_curso", "em_fecho", "fechado", "planeamento"] as const;
const payable = () => ({ total: 121, bp: 80, bp_linhas: 3, linhas_contrato_cache: 1, sublinhas: { lancado: 20, confirmado: 10, por_rever: 40, ajustado: 10, partner_paid_fora_do_total: 99 }, sem_bp: { total: 11, n: 1 }, so_transacoes: { total: 30, n: 2 } });
const account = { account_id: "10000000-0000-4000-8000-000000000001", name: "Conta de teste", saldo: 100 };
export function financialPositionFixture(): FinancialPosition {
  return {
    meta: { company_id: "10000000-0000-4000-8000-000000000002", year: 2026, reference_date: "2026-10-27", timezone: "Europe/Lisbon", version: "p4-v1", balances_visible: true, notes: "Teste sintético" },
    eventos_por_estagio: { em_fecho: [{ event_id: "10000000-0000-4000-8000-000000000003", name: "Evento de teste", first_day: "2026-01-01", started: true, sub_events: 2 }] },
    caixa: [{ ...account, type: "bank", is_hidden: false, cutoff: "2026-08-31" }], cartoes: [account],
    retido: { visivel: [account], ocultas: [account], total_visiveis: 100, total_ocultas: 100 },
    a_pagar: { por_estagio: Object.fromEntries(stages.map(s => [s, payable()])) as FinancialPosition["a_pagar"]["por_estagio"], total: 484, transitorias: { total: 5, itens: [{ reason: "repasse", n: 1, aberto: 5 }] } },
    a_receber: { por_estagio: Object.fromEntries(stages.map(s => [s, { total: 25, n: 1 }])) as FinancialPosition["a_receber"]["por_estagio"], total: 100, transitorias: { total: 2, itens: [] } },
    acerto_informativo: { fora_do_total: true, contas: [account], a_recuperar_caucao: { total: 34000, n: 1 } },
    operacoes_terceiros_informativo: [], alertas: { pago_acima_do_bp: { n: 2, excesso: 4 }, bp_sem_transacao: { n: 3, total: 9, por_rever_n: 2 } },
    // Deliberately not the sum of detail rows: display must use the RPC fields.
    posicao: { caixa: 100, cartoes: 100, caixa_e_cartoes: 4321.98, retido_visiveis: 8765.43, a_pagar: 5432.1, a_receber: 6789.12, nota: "Lado a lado" },
  };
}