/**
 * Posição por contraparte de uma conta de circuito (D-ERP69).
 *
 * Decomposição do saldo da conta: entradas pagas = adiantado por conta do
 * terceiro; saídas pagas = já devolvido. Sem filtro por rubrica — a soma de
 * todas as linhas, incluindo "Sem contraparte atribuída", tem de dar exactamente
 * a posição da conta. Se não der, aparece como erro.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCounterpartyPositions } from "@/lib/circuit-account";

interface Props {
  lines: any[];
  /** Saldo de abertura do período (entra na conferência da posição). */
  openingBalance: number;
  /** Posição da conta = saldo final do extrato. */
  position: number;
}

export function CircuitPositionPanel({ lines, openingBalance, position }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = buildCounterpartyPositions(lines);
  const sumRows = rows.reduce((s, r) => s + r.position, 0);
  const reconciled = Math.abs(sumRows + openingBalance - position) <= 0.01;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Posição por contraparte</h3>
        <p className="text-xs text-muted-foreground">
          Quanto foi adiantado por conta de cada terceiro, quanto já devolveu e a diferença.
        </p>
      </div>

      {!reconciled && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A soma das contrapartes ({formatCurrency(sumRows + openingBalance)}) não coincide com a
            posição do rateio ({formatCurrency(position)}). Há movimentos que o painel não explica.
          </span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contraparte</TableHead>
            <TableHead className="text-right">Adiantado</TableHead>
            <TableHead className="text-right">Devolvido</TableHead>
            <TableHead className="text-right">Diferença</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                Sem movimentos no período.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <Fragment key={r.key}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setExpanded(expanded === r.key ? null : r.key)}
              >
                <TableCell className="text-sm">
                  <span className="flex items-center gap-1.5">
                    {expanded === r.key ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {r.name}
                    {r.key === "__none__" && (
                      <span className="text-[10px] text-warning">
                        — atribuir o terceiro torna a posição legível
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(r.advanced)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(r.returned)}</TableCell>
                <TableCell
                  className={`text-right font-mono text-sm font-semibold ${r.position >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {formatCurrency(r.position)}
                </TableCell>
              </TableRow>
              {expanded === r.key &&
                r.transactions.map((t: any) => (
                  <TableRow key={`${r.key}-${t.id}`} className="bg-secondary/20">
                    <TableCell className="pl-8 text-xs text-muted-foreground">
                      {formatDatePT(t.date)} · {t.description}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(t.signedAmount) >= 0 ? formatCurrency(Number(t.signedAmount)) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(t.signedAmount) < 0 ? formatCurrency(Math.abs(Number(t.signedAmount))) : ""}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
            </Fragment>
          ))}
          {openingBalance !== 0 && (
            <TableRow>
              <TableCell className="text-xs italic text-muted-foreground">
                Saldo inicial do período
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-mono text-sm">{formatCurrency(openingBalance)}</TableCell>
            </TableRow>
          )}
          <TableRow>
            <TableCell className="text-sm font-bold uppercase tracking-wider">Posição do rateio</TableCell>
            <TableCell />
            <TableCell />
            <TableCell
              className={`text-right font-mono text-sm font-bold ${position >= 0 ? "text-success" : "text-destructive"}`}
            >
              {formatCurrency(position)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export default CircuitPositionPanel;
