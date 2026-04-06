import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportArtistCache from "@/components/ReportArtistCache";

export default function ReportArtistCachePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Relatório de Cachê do Artista
          <HelpTooltip text={helpTexts.reportArtistCache || "Demonstrativo completo do cachê de cada artista, incluindo cálculo variável, extras a descontar e valor líquido a pagar."} />
        </h1>
        <p className="text-sm text-muted-foreground">Demonstrativo analítico do cachê por artista com deduções e extras</p>
      </div>
      <ReportArtistCache />
    </div>
  );
}
