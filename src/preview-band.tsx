// TEMPORÁRIO — harness visual para validar o cabeçalho de rubrica do BP.
import { createRoot } from "react-dom/client";
import "./index.css";
const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

import { orphanBucketLabel } from "@/lib/bp-tx-matching";
import { CheckCircle2, ChevronRight } from "lucide-react";

const band = { code: "2.6.08", name: "Despesas Extras", previsto: 5228.63, realizado: 1744.9, count: 39 };
const lines = [
  { d: "Fita Gaffes", a: 102.7 },
  { d: "Imporfibras", a: 3097 },
  { d: "Controlo de pragas", a: 202.5 },
  { d: "Extras - Equipe", a: 388.76 },
  { d: "Material de produção GrupoOnda/MP", a: 1437.67 },
];

function App() {
  return (
    <div className="p-3">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border/30">
          <tr className="bg-secondary/10 border-t border-border/30">
            <td colSpan={8} className="py-2 pl-2 text-xs font-semibold text-foreground">
              <span className="text-muted-foreground mr-1">2.6</span>Operação
            </td>
          </tr>
          <tr className="bg-secondary/5 border-t border-border/20">
            <td colSpan={8} className="py-1.5 pl-3 pr-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[11px] font-semibold text-foreground">
                  <span className="text-muted-foreground">{band.code}</span>
                  <span className="mx-1 text-muted-foreground/60">·</span>
                  {band.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-mono">{formatCurrency(band.previsto)}</span> previsto
                  <span className="mx-1">·</span>
                  <span className="font-mono">{formatCurrency(band.realizado)}</span> realizado
                  <span className="ml-1">({band.count} tx)</span>
                </span>
              </div>
            </td>
          </tr>
          {lines.map((l) => (
            <tr key={l.d}>
              <td className="py-2 pl-6 pr-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <p className="font-medium text-xs">{l.d}</p>
                </div>
              </td>
              <td className="py-2 text-right font-mono text-xs text-warning">{formatCurrency(l.a)}</td>
            </tr>
          ))}
          <tr className="bg-muted/20">
            <td colSpan={7} className="py-2 pl-6 pr-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs font-medium italic text-muted-foreground">
                    {orphanBucketLabel("expense")}
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium not-italic text-muted-foreground">
                      21 transação(ões)
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Sem previsto · Realizado <span className="font-mono">{formatCurrency(459.54)}</span>
                  </p>
                </div>
              </div>
            </td>
            <td className="py-2 text-right pr-2"><span className="text-[10px] text-muted-foreground">—</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
