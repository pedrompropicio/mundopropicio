import HelpTooltip from "@/components/HelpTooltip";
import ReportPendencyIndex from "@/components/ReportPendencyIndex";

export default function ReportPendencyIndexPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">Índice de Pendências <HelpTooltip text="Painel com documentos em falta, transações sem categoria e aprovações pendentes." /></h1>
        <p className="text-sm text-muted-foreground">Visão geral de todas as pendências operacionais</p>
      </div>
      <ReportPendencyIndex />
    </div>
  );
}
