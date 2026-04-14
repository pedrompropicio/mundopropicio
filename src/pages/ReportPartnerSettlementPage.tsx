import HelpTooltip from "@/components/HelpTooltip";
import ReportPartnerSettlement from "@/components/ReportPartnerSettlement";

export default function ReportPartnerSettlementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Resumo de Acerto com Sócios <HelpTooltip text="Consolidação de quotas-parte, extras e despesas pagas por sócios em todos os eventos." /></h1>
        <p className="text-sm text-muted-foreground">Visão consolidada do acerto financeiro com cada sócio</p>
      </div>
      <ReportPartnerSettlement />
    </div>
  );
}
