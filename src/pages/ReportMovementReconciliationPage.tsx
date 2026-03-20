import ReportMovementReconciliation from "@/components/ReportMovementReconciliation";

export default function ReportMovementReconciliationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Movimentações</h1>
        <p className="text-sm text-muted-foreground">Relatório de movimentações por conta e período para conciliação bancária</p>
      </div>
      <ReportMovementReconciliation />
    </div>
  );
}
