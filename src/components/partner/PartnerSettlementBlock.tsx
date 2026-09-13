import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/mock-data";

/**
 * (g17) "O seu fechamento" — bloco de topo do Portal do Sócio.
 *
 * Não calcula nada: mostra os números que a edge function `partner-statement`
 * devolve, produzidos pelo MESMO gerador do Encontro de Contas. Vocabulário
 * externo apenas — nunca "fechamento acima", "nível", "pai" ou "filho".
 */
export interface PartnerSettlementBlockData {
  partnerName: string;
  partnerPct: number;
  othersLabel: string;
  othersPct: number;
  cascade: Array<{ label: string; value: number; kind: "base" | "deduction" | "quota" | "term" | "result" }>;
  account: {
    share: number;
    disbursement: number;
    adjustments: number;
    revenuesHeld: Array<{ label: string; value: number }>;
    totalRevenuesHeld: number;
    extrasTotal: number;
    financingToReturn: number;
    transferBase: number;
    transferVat: number;
    transferTotal: number;
    transferWithVat: boolean;
  };
}

interface Props {
  data: PartnerSettlementBlockData;
  onExportPdf: () => void;
  onExportExcel: () => void;
  busy?: boolean;
}

function Row({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? "border-t border-border/60 pt-1.5" : ""}`}>
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""} ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span
        className={`font-mono text-xs tabular-nums ${strong ? "font-bold" : ""} ${
          value < 0 ? "text-red-400" : ""
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export function PartnerSettlementBlock({ data, onExportPdf, onExportExcel, busy }: Props) {
  const a = data.account;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">O seu fechamento</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.partnerName} {data.partnerPct}%
              {data.othersPct > 0 ? ` · ${data.othersLabel} ${data.othersPct}%` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExportPdf} className="h-7 gap-1.5 px-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Prestação de contas (PDF)
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExportExcel} className="h-7 gap-1.5 px-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Excel
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Como se chega à sua parte
            </h3>
            {data.cascade.map((s, i) => (
              <Row
                key={`${s.label}-${i}`}
                label={s.label}
                value={s.value}
                strong={s.kind === "result"}
                muted={s.kind === "deduction"}
              />
            ))}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              A sua conta
            </h3>
            <Row label="A sua parte" value={a.share} />
            <Row label="Despesas do evento que pagou" value={a.disbursement} />
            {a.adjustments !== 0 && <Row label="Ajustes ao desembolso" value={a.adjustments} />}
            {a.revenuesHeld.map((r, i) => (
              <Row key={`${r.label}-${i}`} label={`Receitas em seu poder — ${r.label}`} value={-r.value} muted />
            ))}
            {a.extrasTotal !== 0 && <Row label="Já adiantado" value={-a.extrasTotal} muted />}
            <Row label="Base a transferir" value={a.transferBase} strong />
            {a.transferWithVat && a.transferVat !== 0 && (
              <>
                <Row label="IVA 23%" value={a.transferVat} />
                <Row label="Total a transferir" value={a.transferTotal} strong />
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PartnerSettlementBlock;
