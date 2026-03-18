import ReportContasPagar from "@/components/ReportContasPagar";

export default function ReportContasPagarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">Relatório de despesas pendentes e vencidas</p>
      </div>
      <ReportContasPagar />
    </div>
  );
}
