import ReportDREBrasil from "@/components/ReportDREBrasil";

export default function ReportDREBrasilPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">DRE - Demonstrativo de Resultado</h1>
        <p className="text-sm text-muted-foreground">Demonstração do Resultado com despesas incluindo IVA — para apresentação a sócios brasileiros</p>
      </div>
      <ReportDREBrasil />
    </div>
  );
}
