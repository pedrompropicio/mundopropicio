import HelpTooltip from "@/components/HelpTooltip";
import ReportTreasuryProjection from "@/components/ReportTreasuryProjection";

export default function ReportTreasuryProjectionPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Projeção de Tesouraria <HelpTooltip text="Saldo bancário projetado combinando transações pendentes e recorrentes." /></h1>
        <p className="text-sm text-muted-foreground">Previsão de saldo de caixa ao longo do tempo</p>
      </div>
      <ReportTreasuryProjection />
    </div>
  );
}
