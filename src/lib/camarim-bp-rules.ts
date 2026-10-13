/**
 * D-ERP264 — despesas de camarim seguem as regras de BP das transações.
 *
 * Espelho cliente do trigger `enforce_camarim_item_bp_line` (a regra vive na base)
 * e da verificação de saldo por linha da `close-camarim-session`.
 */
import { computeBpFit, round2, sessionBaseAmount, lineLabel } from "@/lib/camarim-integrate";

export type CamarimBpScopeValue = "master_common" | "local_city" | "mixed";

/** Evento cujo BP paga o item: master_common → Master da sessão (sem recurso ao local); resto → evento principal. */
export function itemTargetEvent(
  scope: CamarimBpScopeValue,
  session: { masterEventId: string | null; primaryEventId: string | null },
): { eventId: string | null; error: string | null } {
  if (scope === "mixed") return { eventId: null, error: null };
  if (scope === "master_common") {
    if (!session.masterEventId) {
      return { eventId: null, error: 'Verba "BP Master" escolhida, mas esta sessão não tem evento Master. Escolhe "BP Local (cidade)".' };
    }
    return { eventId: session.masterEventId, error: null };
  }
  return { eventId: session.primaryEventId ?? session.masterEventId, error: null };
}

export interface CamarimLineOption {
  id: string;
  event_id: string;
  description: string | null;
  specification: string | null;
  amount: number;
  realized: number;
}

/**
 * Pode gravar? Devolve o motivo da recusa ou null.
 * `lines` = linhas 2.6.04 vivas do evento de destino.
 */
export function itemBpLineError(args: {
  scope: CamarimBpScopeValue;
  target: { eventId: string | null; error: string | null };
  targetEventName?: string | null;
  withBp: boolean;
  lines: CamarimLineOption[];
  selectedLine: { id: string; event_id: string } | null;
}): string | null {
  const { scope, target, withBp, lines, selectedLine } = args;
  if (scope === "mixed") return selectedLine ? "Talão misto não leva linha de BP: a linha escolhe-se em cada parte da divisão." : null;
  if (target.error) return target.error;
  if (selectedLine) {
    if (selectedLine.event_id !== target.eventId) {
      return `Linha de BP recusada: não pertence ao BP do evento "${args.targetEventName ?? "de destino"}".`;
    }
    return null;
  }
  if (withBp && lines.length === 0) {
    return `O BP do evento "${args.targetEventName ?? "de destino"}" não tem nenhuma linha 2.6.04 — Camarins. Cria a linha no BP desse evento (ou muda a verba do item) antes de gravar.`;
  }
  return null;
}

/** Aviso (não bloqueia o lançamento): o item fica acima do saldo da linha. */
export function itemLineWarning(line: CamarimLineOption | null, itemBase: number): string | null {
  if (!line) return null;
  const fit = computeBpFit(line, itemBase);
  if (fit.fits) return null;
  return `Este item fica ${fit.excess.toFixed(2)} € acima do saldo da linha (disponível ${fit.disponivel.toFixed(2)} €). Podes gravar, mas a integração fica bloqueada até se ajustar a verba.`;
}

type ItemAmounts = { bp_forecast_id?: string | null; base_amount?: number | null; total_amount?: number | null; iva_amount?: number | null };

/** Linhas próprias dos itens sem saldo para os itens (mesma conta das transações). */
export function lineShortfalls(
  items: ItemAmounts[],
  lines: Array<Pick<CamarimLineOption, "id" | "description" | "specification" | "amount" | "realized">>,
): Array<{ forecastId: string; label: string; falta: number }> {
  const byLine = new Map<string, ItemAmounts[]>();
  for (const it of items) {
    if (!it.bp_forecast_id) continue;
    const arr = byLine.get(it.bp_forecast_id) ?? [];
    arr.push(it);
    byLine.set(it.bp_forecast_id, arr);
  }
  const out: Array<{ forecastId: string; label: string; falta: number }> = [];
  for (const [fid, its] of byLine) {
    const line = lines.find((l) => l.id === fid);
    if (!line) {
      out.push({ forecastId: fid, label: "(linha não encontrada)", falta: round2(sessionBaseAmount(its)) });
      continue;
    }
    const fit = computeBpFit(line, sessionBaseAmount(its));
    if (!fit.fits) out.push({ forecastId: fid, label: lineLabel(line), falta: fit.excess });
  }
  return out;
}

export function shortfallMessage(s: { label: string; falta: number }) {
  return `A linha de BP "${s.label}" não tem saldo para os itens desta sessão: faltam ${s.falta.toFixed(2).replace(".", ",")} €. Ajusta a verba da linha no BP antes de integrar.`;
}

/**
 * Pré-visualização do acerto (D-ERP156): recebido (adiantamento + reforços − devoluções),
 * gasto pela gestora (adiantamento + bolso), saldo. Gastar acima do recebido nunca bloqueia.
 */
export function settlementPreview(received: number, spent: number) {
  const balance = round2(received - spent);
  const type: "balanced" | "reinforcement" | "refund" =
    Math.abs(balance) < 0.01 ? "balanced" : balance > 0 ? "refund" : "reinforcement";
  const abs = Math.abs(balance).toFixed(2).replace(".", ",");
  const message =
    type === "balanced"
      ? "Saldo zero — sem acerto."
      : type === "reinforcement"
        ? `A MP reembolsa ${abs} € à gestora.`
        : `A gestora devolve ${abs} €.`;
  return { received: round2(received), spent: round2(spent), balance, type, message };
}
