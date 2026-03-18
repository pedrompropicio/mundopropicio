import ReportBankStatement from "@/components/ReportBankStatement";

export default function ReportBankStatementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Extrato Bancário</h1>
        <p className="text-sm text-muted-foreground">Movimentações por conta financeira</p>
      </div>
      <ReportBankStatement />
    </div>
  );
}
