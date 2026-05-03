/**
 * Combo/Passe gating rules.
 *
 * Source of truth: Bilhete Combo só existe em eventos do tipo FESTIVAL com
 * múltiplos dias num único local. Não existe em eventos simples de 1 dia
 * nem em sub-eventos de turnê (parent_event_id != null).
 */

export interface ComboGatingInput {
  event_type?: string | null;
  parent_event_id?: string | null;
  event_dates_count: number;
}

export function isComboAllowed(input: ComboGatingInput): boolean {
  const isFestival = input.event_type === "festival";
  const hasDates = (input.event_dates_count ?? 0) >= 1;
  const isTourSplit = !!input.parent_event_id;
  return isFestival && hasDates && !isTourSplit;
}

/**
 * Força lot_kind=simple quando o combo não é permitido. Garante que nem o
 * editor nem a mutação de gravação conseguem persistir um combo indevido.
 */
export function coerceLotKind(
  desired: string | null | undefined,
  gating: ComboGatingInput,
): "simple" | "combo" {
  if (isComboAllowed(gating) && desired === "combo") return "combo";
  return "simple";
}
