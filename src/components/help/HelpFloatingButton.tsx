import { BookOpen } from "lucide-react";
import { useHelpPanel } from "@/contexts/HelpPanelContext";

/**
 * Botão flutuante do manual — abre o painel lateral com o capítulo da rota
 * atual (não navega para /ajuda).
 */
export default function HelpFloatingButton() {
  const { openHelp } = useHelpPanel();
  return (
    <button
      type="button"
      onClick={() => openHelp()}
      aria-label="Abrir o Manual de Orientação"
      title="Manual de Orientação"
      className="fixed bottom-5 right-5 z-40 hidden h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-primary shadow-lg backdrop-blur transition-colors hover:bg-accent md:flex"
    >
      <BookOpen className="h-5 w-5" />
    </button>
  );
}
