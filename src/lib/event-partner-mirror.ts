/**
 * Espelho de sócios do evento (event_partners) a partir dos participantes dos fechamentos.
 *
 * Regra (épica #146, correcção B — igual à função SQL
 * `event_partners_sync_from_settlements`):
 * - existe uma linha por cada `supplier_id` que seja participante `partner` em QUALQUER
 *   fechamento do evento;
 * - os valores vêm do participante `settles` se existir; caso contrário do `nominal`
 *   (primeiro o do fechamento raiz, depois o mais antigo por `created_at`);
 * - só desaparece quando o sócio não está em nenhum fechamento.
 */

export type MirrorParticipant = {
  supplier_id: string | null;
  participant_kind: string;
  mode: string;
  profit_pct: number | null;
  loss_pct: number | null;
  expense_includes_iva: boolean | null;
  can_order: boolean | null;
  can_pay: boolean | null;
  created_at: string;
  /** true quando o fechamento do participante é a raiz (parent_id nulo) */
  is_root: boolean;
};

export type MirrorPartner = {
  supplier_id: string;
  percentage: number | null;
  loss_percentage: number | null;
  expense_includes_iva: boolean | null;
  can_order: boolean | null;
  can_pay: boolean | null;
};

function rank(p: MirrorParticipant): [number, number, number] {
  return [
    p.mode === "settles" ? 0 : 1,
    p.is_root ? 0 : 1,
    new Date(p.created_at).getTime(),
  ];
}

function better(a: MirrorParticipant, b: MirrorParticipant): MirrorParticipant {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
  }
  return a;
}

export function resolveMirrorPartners(participants: MirrorParticipant[]): MirrorPartner[] {
  const best = new Map<string, MirrorParticipant>();
  for (const p of participants) {
    if (p.participant_kind !== "partner" || !p.supplier_id) continue;
    const cur = best.get(p.supplier_id);
    best.set(p.supplier_id, cur ? better(cur, p) : p);
  }
  return [...best.entries()]
    .map(([supplier_id, p]) => ({
      supplier_id,
      percentage: p.profit_pct,
      loss_percentage: p.loss_pct,
      expense_includes_iva: p.expense_includes_iva,
      can_order: p.can_order,
      can_pay: p.can_pay,
    }))
    .sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
}
