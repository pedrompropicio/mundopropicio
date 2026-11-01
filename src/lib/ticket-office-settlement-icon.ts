// #313 (Lote A, pontos 1-2): estado do ícone «Fechar evento» no painel de saldo da bilheteira.
// Função pura (testável). Um fecho estornado (status = 'reversed') conta como «sem fecho».
export type SettlementIconEstado = "sem_fecho" | "rascunho" | "confirmado_sem_repasse" | "confirmado";

export interface SettlementIconState<S = any> {
  estado: SettlementIconEstado;
  settlement: S | null;
  titulo: string;
}

export const SETTLEMENT_ICON_TITLES = {
  sem_fecho: "Fechar evento nesta bilheteira",
  rascunho: "Fecho em rascunho · a aguardar repasse",
  confirmado_sem_repasse: "Fecho confirmado · repasse por lançar",
  confirmado: "Fecho confirmado",
} as const;

export function settlementIconState<
  S extends {
    id?: string;
    event_id?: string | null;
    financial_account_id?: string | null;
    status?: string | null;
    transfer_transaction_id?: string | null;
    created_at?: string | null;
  },
>(fechos: S[] | null | undefined, eventId: string, officeId: string): SettlementIconState<S> {
  const doEvento = (fechos || []).filter(
    (s) =>
      s.event_id === eventId &&
      s.status !== "reversed" &&
      (s.financial_account_id == null || s.financial_account_id === officeId),
  );
  // Havendo mais do que um (duplicados legados), prefere confirmado, depois o mais recente.
  const ordenados = [...doEvento].sort((a, b) => {
    const pa = a.status === "confirmed" ? 0 : 1;
    const pb = b.status === "confirmed" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  const s = ordenados[0];
  if (!s) return { estado: "sem_fecho", settlement: null, titulo: SETTLEMENT_ICON_TITLES.sem_fecho };
  if (s.status === "draft") return { estado: "rascunho", settlement: s, titulo: SETTLEMENT_ICON_TITLES.rascunho };
  if (!s.transfer_transaction_id) {
    return { estado: "confirmado_sem_repasse", settlement: s, titulo: SETTLEMENT_ICON_TITLES.confirmado_sem_repasse };
  }
  return { estado: "confirmado", settlement: s, titulo: SETTLEMENT_ICON_TITLES.confirmado };
}
