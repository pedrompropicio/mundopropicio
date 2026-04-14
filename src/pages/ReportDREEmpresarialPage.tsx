import HelpTooltip from "@/components/HelpTooltip";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";

export default function ReportDREEmpresarialPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          DRE Empresarial
          <HelpTooltip text="Demonstração do Resultado consolidado da empresa, combinando o resultado operacional dos eventos com os custos corporativos (salários, obrigações fiscais, encargos financeiros, serviços e estrutura), numa visão mensal." />
        </h1>
        <p className="text-sm text-muted-foreground">Resultado consolidado mensal — Eventos + Custos Corporativos</p>
      </div>
      <ReportDREEmpresarial />
    </div>
  );
}
