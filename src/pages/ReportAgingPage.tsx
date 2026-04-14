import HelpTooltip from "@/components/HelpTooltip";
import ReportAging from "@/components/ReportAging";

export default function ReportAgingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Aging de Contas a Pagar <HelpTooltip text="Classificação de contas a pagar por faixa de vencimento." /></h1>
        <p className="text-sm text-muted-foreground">Distribuição de valores pendentes por antiguidade</p>
      </div>
      <ReportAging />
    </div>
  );
}
