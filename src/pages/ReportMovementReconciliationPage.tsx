import ReportMovementReconciliation from "@/components/ReportMovementReconciliation";

export default function ReportMovementReconciliationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Movimentações</h1>
        <p className="text-sm text-muted-foreground">Transações por conta, evento e período — liquidadas e em aberto</p>
      </div>
      <ReportMovementReconciliation />
    </div>
  );
}
