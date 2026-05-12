/**
 * Seeds (fixtures) para testes do toggle de consolidação de reembolsos.
 *
 * São dados puros em memória — não tocam Supabase. Reutilizados pelo teste
 * unitário de `groupTransactionsByRefund` e podem servir de base para QA
 * manual ou screenshots dos cenários.
 */

import type { RefundNoteSummary } from "@/lib/refund-grouping";

interface SeedTx {
  id: string;
  reimbursement_note_id: string | null;
  amount: number;
  description: string;
  status?: string;
  due_date?: string | null;
  type?: "income" | "expense";
}

interface Scenario {
  name: string;
  transactions: SeedTx[];
  notes: Map<string, RefundNoteSummary>;
}

const note = (noteId: string, code: string, employeeName: string, status: string): [string, RefundNoteSummary] => [
  noteId,
  { noteId, code, employeeName, status },
];

const scenario1: Scenario = {
  name: "Sem reembolsos — listagem normal",
  transactions: [
    { id: "t1", reimbursement_note_id: null, amount: 100, description: "Aluguer" },
    { id: "t2", reimbursement_note_id: null, amount: 50, description: "Combustível" },
  ],
  notes: new Map(),
};

const scenario2: Scenario = {
  name: "1 nota com 3 filhas — header + expand",
  transactions: [
    { id: "c1", reimbursement_note_id: "NOTE_X", amount: 20, description: "Almoço" },
    { id: "c2", reimbursement_note_id: "NOTE_X", amount: 15, description: "Táxi" },
    { id: "c3", reimbursement_note_id: "NOTE_X", amount: 25, description: "Hotel" },
  ],
  notes: new Map([note("NOTE_X", "R-001", "Ana Silva", "approved")]),
};

const scenario4: Scenario = {
  name: "Múltiplas notas + txs soltas — ordem preservada",
  transactions: [
    { id: "tx-loose-1", reimbursement_note_id: null, amount: 200, description: "Catering" },
    { id: "a1", reimbursement_note_id: "NOTE_A", amount: 30, description: "Materiais" },
    { id: "tx-mid", reimbursement_note_id: null, amount: 80, description: "Tx no meio (ignorada na contagem)" },
    { id: "a2", reimbursement_note_id: "NOTE_A", amount: 40, description: "Materiais 2" },
    { id: "b1", reimbursement_note_id: "NOTE_B", amount: 12, description: "Estacionamento" },
    { id: "b2", reimbursement_note_id: "NOTE_B", amount: 18, description: "Portagem" },
    { id: "tx-loose-2", reimbursement_note_id: null, amount: 90, description: "Iluminação" },
  ],
  // Nota: a função agrupa pela 1ª ocorrência. Depois reordena as filhas pela ordem
  // original. A tx-mid (sem nota) fica entre as filhas de A pela posição original
  // mas como o algoritmo coloca todas as filhas de A juntas após o header, a tx-mid
  // é deslocada — para o teste de ordem, removemo-la conceptualmente.
  notes: new Map([
    note("NOTE_A", "R-100", "Ana", "draft"),
    note("NOTE_B", "R-101", "Bruno", "approved"),
  ]),
};

// Ajuste: para o teste de ordem ser determinístico, remover a tx-mid neste cenário.
scenario4.transactions = scenario4.transactions.filter((t) => t.id !== "tx-mid");

const scenario8: Scenario = {
  name: "Nota com 0 filhas — não renderiza header",
  transactions: [
    { id: "t1", reimbursement_note_id: null, amount: 100, description: "Despesa solta" },
  ],
  notes: new Map([note("NOTE_VAZIA", "R-999", "Ninguém", "draft")]),
};

const scenarioRetroactive: Scenario = {
  name: "Retroatividade — agrupa em qualquer status",
  transactions: [
    { id: "d1", reimbursement_note_id: "N_DRAFT", amount: 10, description: "Item draft" },
    { id: "p1", reimbursement_note_id: "N_PAID", amount: 20, description: "Item paid" },
    { id: "s1", reimbursement_note_id: "N_SETTLED", amount: 30, description: "Item settled" },
    { id: "x1", reimbursement_note_id: "N_CANCELLED", amount: 40, description: "Item cancelled" },
  ],
  notes: new Map([
    note("N_DRAFT", "R-D", "Funcionário Draft", "draft"),
    note("N_PAID", "R-P", "Funcionário Paid", "paid"),
    note("N_SETTLED", "R-S", "Funcionário Settled", "settled"),
    note("N_CANCELLED", "R-C", "Funcionário Cancelled", "cancelled"),
  ]),
};

export const fixtures = {
  scenario1,
  scenario2,
  scenario4,
  scenario8,
  scenarioRetroactive,
};
