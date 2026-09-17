/**
 * Camada do painel lateral do Manual de Orientação.
 *
 * O painel tem de ficar ACIMA de qualquer modal, diálogo, sheet ou popover da
 * app. Valores em uso hoje (setembro 2026): diálogos/sheets do shadcn em z-50,
 * diálogo de desambiguação de split e SEPA em z-[60], modais de transação em
 * z-[100]/z-[110], alert-dialog em z-[190]/z-[200], SplitByIvaModal em
 * z-[10000]/z-[10001]. O painel usa 10600 — acima de todos e com margem.
 */
export const HELP_PANEL_Z_INDEX = 10600;
export const HELP_PANEL_Z_CLASS = "z-[10600]";

/** Atributo que marca a raiz do painel (usado pelos guardas de fecho). */
export const HELP_PANEL_ATTR = "data-help-panel";

/** True quando o alvo do evento está dentro do painel de ajuda. */
export function isInsideHelpPanel(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const node = target as Node;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node as { parentElement?: Element | null }).parentElement ?? null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest(`[${HELP_PANEL_ATTR}="true"]`);
}

interface RadixOutsideEvent {
  target?: EventTarget | null;
  detail?: { originalEvent?: { target?: EventTarget | null } };
  preventDefault: () => void;
}

/**
 * Guarda para os eventos "outside" do Radix (Dialog / Sheet / AlertDialog):
 * se a interação veio do painel de ajuda, não fecha o modal.
 */
export function guardHelpPanelOutside<E extends RadixOutsideEvent>(
  handler?: (event: E) => void,
) {
  return (event: E) => {
    const origin = event.detail?.originalEvent?.target ?? event.target ?? null;
    if (isInsideHelpPanel(origin)) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };
}
