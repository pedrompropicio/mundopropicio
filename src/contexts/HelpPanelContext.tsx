import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Estado do painel lateral do Manual de Orientação.
 *
 * Montado uma única vez no layout: os tooltips e o botão flutuante só pedem
 * `openHelp({ slug?, anchor? })`. Sem slug, o painel resolve o artigo pela rota.
 */
export interface OpenHelpArgs {
  slug?: string;
  anchor?: string;
}

interface HelpPanelValue {
  open: boolean;
  slug: string | null;
  anchor: string | null;
  openHelp: (args?: OpenHelpArgs) => void;
  closeHelp: () => void;
  setOpen: (open: boolean) => void;
}

const HelpPanelContext = createContext<HelpPanelValue | null>(null);

export function HelpPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);

  const openHelp = useCallback((args?: OpenHelpArgs) => {
    setSlug(args?.slug ?? null);
    setAnchor(args?.anchor ?? null);
    setOpen(true);
  }, []);

  const closeHelp = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, slug, anchor, openHelp, closeHelp, setOpen }),
    [open, slug, anchor, openHelp, closeHelp],
  );

  return <HelpPanelContext.Provider value={value}>{children}</HelpPanelContext.Provider>;
}

/**
 * Devolve o controlador do painel. Fora do provider (ex.: ecrãs públicos), o
 * `openHelp` não faz nada — nunca rebenta.
 */
export function useHelpPanel(): HelpPanelValue {
  const ctx = useContext(HelpPanelContext);
  if (ctx) return ctx;
  return {
    open: false,
    slug: null,
    anchor: null,
    openHelp: () => {},
    closeHelp: () => {},
    setOpen: () => {},
  };
}

/** True quando existe painel montado (para esconder o "Saber mais" onde não há). */
export function useHasHelpPanel(): boolean {
  return useContext(HelpPanelContext) !== null;
}
