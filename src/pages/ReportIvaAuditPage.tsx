import HelpTooltip from "@/components/HelpTooltip";
import ReportIvaAudit from "@/components/ReportIvaAudit";

export default function ReportIvaAuditPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          Auditoria de IVA
          <HelpTooltip text="Lista linhas onde o IVA calculado (base × taxa) gera um resíduo de arredondamento maior que a tolerância. Útil para identificar bases que vão produzir totais diferentes dos das faturas." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Verifica consistência IVA conforme Art.º 18.º CIVA — valor por linha, arredondado ao cêntimo.
        </p>
      </div>
      <ReportIvaAudit />
    </div>
  );
}
