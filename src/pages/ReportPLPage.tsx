import ReportPL from "@/components/ReportPL";

export default function ReportPLPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatório P&L</h1>
        <p className="text-sm text-muted-foreground">Previsão vs Realizado por evento</p>
      </div>
      <ReportPL />
    </div>
  );
}
