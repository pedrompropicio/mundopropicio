import ReportContasPagar from "@/components/ReportContasPagar";

export default function ReportContasPagarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">Relatório de despesas pendentes e vencidas</p>
      </div>
      <ReportContasPagar />
    </div>
  );
}
