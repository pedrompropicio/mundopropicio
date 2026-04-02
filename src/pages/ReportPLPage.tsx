import ReportPL from "@/components/ReportPL";

export default function ReportPLPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Relatório Business Plan</h1>
        <p className="text-sm text-muted-foreground">Previsão vs Realizado por evento</p>
      </div>
      <ReportPL />
    </div>
  );
}
