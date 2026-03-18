import ReportDRE from "@/components/ReportDRE";

export default function ReportDREPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatório DRE</h1>
        <p className="text-sm text-muted-foreground">Demonstração do Resultado do Exercício por evento</p>
      </div>
      <ReportDRE />
    </div>
  );
}
