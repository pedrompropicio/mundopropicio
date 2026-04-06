import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import ReportDREBrasil from "@/components/ReportDREBrasil";

export default function ReportDREBrasilPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Relatório DRE Brasil <HelpTooltip text={helpTexts.reportDREBrasil} /></h1>
        <p className="text-sm text-muted-foreground">Demonstração do Resultado com despesas incluindo IVA — para apresentação a sócios brasileiros</p>
      </div>
      <ReportDREBrasil />
    </div>
  );
}
