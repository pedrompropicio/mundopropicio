import ReportBankStatement from "@/components/ReportBankStatement";

export default function ReportBankStatementPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Extrato Bancário</h1>
        <p className="text-sm text-muted-foreground">Movimentações por conta financeira</p>
      </div>
      <ReportBankStatement />
    </div>
  );
}
