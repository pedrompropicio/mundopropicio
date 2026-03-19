import ReportCashFlow from "@/components/ReportCashFlow";

export default function ReportCashFlowPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Fluxo de Caixa</h1>
        <p className="text-sm text-muted-foreground">Receitas vs despesas por período, com opção de separação por evento</p>
      </div>
      <ReportCashFlow />
    </div>
  );
}
