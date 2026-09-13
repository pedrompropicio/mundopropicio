/**
 * (g12) Detalhe expansível do desembolso e das receitas em poder do sócio.
 *
 * SÓ APRESENTAÇÃO. Recebe exactamente as mesmas linhas e totais que já alimentam
 * o resumo e o export de conferência (SSoT: src/lib/partner-disbursement.ts).
 * Nada é recalculado — só se somam as linhas recebidas para provar que o detalhe
 * fecha com o resumo; se não fechar, mostra aviso vermelho.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import { calcIvaAmount, calcTotalWithIva, roundCents } from "@/lib/iva";
import {
  REVENUE_HELD_SOURCE_LABEL,
  sumLineAmounts,
  type BpPaidLine,
  type PartnerAdjustment,
  type RevenueHeldRow,
} from "@/lib/partner-disbursement";

export interface PartnerDisbursementDetailProps {
  bpPaidLines: BpPaidLine[];
  totalBpPaidByPartner: number;
  paidExpenses: Array<{ description: string; amount: number; date: string; category: string; cityLabel: string }>;
  totalPaidByPartner: number;
  totalDisbursement: number;
  adjustments: PartnerAdjustment[];
  totalAdjustments: number;
  revenuesHeld: RevenueHeldRow[];
  totalRevenuesHeld: number;
  financingToReturn: number;
  extras: Array<{ date: string; originLabel?: string; description: string; amount: number }>;
  totalAdvanced: number;
  partnerShare: number;
  transferBase: number;
  transferWithVat: boolean;
  transferVat: number;
  transferTotal: number;
  /** Rubrica de Nível 2 a partir do id da categoria da linha de BP. */
  l2LabelOf: (categoryId?: string | null) => string;
}

const fmtDate = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

function Mismatch({ label, detail, summary }: { label: string; detail: number; summary: number }) {
  const diff = roundCents(detail - summary);
  if (Math.abs(diff) < 0.01) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
      <AlertTriangle className="h-3.5 w-3.5" />
      {label}: detalhe não fecha com o resumo (diferença {formatCurrency(diff)})
    </p>
  );
}

export default function PartnerDisbursementDetail(props: PartnerDisbursementDetailProps) {
  const [open, setOpen] = useState(false);

  const groups = new Map<string, BpPaidLine[]>();
  for (const l of props.bpPaidLines) {
    const key = props.l2LabelOf(l.categoryId) || "—";
    const arr = groups.get(key);
    if (arr) arr.push(l);
    else groups.set(key, [l]);
  }

  const detailBp = sumLineAmounts(props.bpPaidLines);
  const detailTx = sumLineAmounts(props.paidExpenses);
  const detailAdj = sumLineAmounts(props.adjustments);
  const detailHeld = sumLineAmounts(props.revenuesHeld);
  const detailExtras = sumLineAmounts(props.extras);

  return (
    <div className="rounded-lg border border-border/60">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> : <ChevronRight className="mr-1.5 h-3.5 w-3.5" />}
        {open ? "Ocultar detalhe" : "Ver detalhe"}
      </Button>

      {open && (
        <div className="space-y-5 border-t border-border/60 p-3">
          {/* 1a. Linhas do BP em nome do sócio */}
          <section className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Linhas do Business Plan em nome do sócio
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubrica</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Base s/IVA</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">c/IVA</TableHead>
                  <TableHead>Transação</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bpPaidLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-xs text-muted-foreground">Sem linhas.</TableCell>
                  </TableRow>
                )}
                {Array.from(groups.entries()).map(([group, lines]) => (
                  <>
                    {lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-muted-foreground">{l.category}</TableCell>
                        <TableCell className="text-sm">{l.description}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(l.base)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(calcIvaAmount(l.base, l.ivaRate))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(calcTotalWithIva(l.base, l.ivaRate))}
                        </TableCell>
                        <TableCell className="text-xs">{l.hasTransaction ? "Sim" : "Não"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.status}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow key={`${group}-sub`} className="bg-muted/30">
                      <TableCell colSpan={4} className="text-xs font-semibold">Subtotal · {group}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">
                        {formatCurrency(sumLineAmounts(lines))}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </>
                ))}
              </TableBody>
            </Table>
            <p className="text-right text-xs font-bold">
              Total linhas do BP: {formatCurrency(props.totalBpPaidByPartner)}
            </p>
            <Mismatch label="Linhas do BP" detail={detailBp} summary={props.totalBpPaidByPartner} />
          </section>

          {/* 1b. Transações pagas pelo sócio */}
          <section className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Transações pagas pelo sócio
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.paidExpenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-xs text-muted-foreground">Sem transações.</TableCell>
                  </TableRow>
                )}
                {props.paidExpenses.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{fmtDate(e.date)}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(e.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-right text-xs font-bold">
              Total transações: {formatCurrency(props.totalPaidByPartner)}
            </p>
            <Mismatch label="Transações pagas pelo sócio" detail={detailTx} summary={props.totalPaidByPartner} />
            <p className="text-right text-sm font-bold">
              Desembolso efectivo: {formatCurrency(props.totalDisbursement)}
            </p>
            <Mismatch
              label="Desembolso efectivo"
              detail={roundCents(detailBp + detailTx)}
              summary={props.totalDisbursement}
            />
          </section>

          {/* 2. Ajustes ao desembolso */}
          <section className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ajustes ao desembolso</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.adjustments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground">Sem ajustes.</TableCell>
                  </TableRow>
                )}
                {props.adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{fmtDate(a.date)}</TableCell>
                    <TableCell className="text-sm">{a.description}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(a.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-right text-xs font-bold">Total ajustes: {formatCurrency(props.totalAdjustments)}</p>
            <Mismatch label="Ajustes ao desembolso" detail={detailAdj} summary={props.totalAdjustments} />
          </section>

          {/* 3. Receitas em poder do sócio */}
          <section className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Receitas em poder do sócio
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Conta / operação</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.revenuesHeld.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-xs text-muted-foreground">Sem receitas.</TableCell>
                  </TableRow>
                )}
                {props.revenuesHeld.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{REVENUE_HELD_SOURCE_LABEL[r.source]}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.accountName}</TableCell>
                    <TableCell className="text-sm">{r.description}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-right text-xs font-bold">Total receitas: {formatCurrency(props.totalRevenuesHeld)}</p>
            <Mismatch label="Receitas em poder do sócio" detail={detailHeld} summary={props.totalRevenuesHeld} />
          </section>

          {/* 4. Extras / adiantamentos */}
          <section className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extras / adiantamentos</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.extras.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-xs text-muted-foreground">Sem extras.</TableCell>
                  </TableRow>
                )}
                {props.extras.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{fmtDate(e.date)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.originLabel || "—"}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(e.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-right text-xs font-bold">Total já adiantado: {formatCurrency(props.totalAdvanced)}</p>
            <Mismatch label="Extras / adiantamentos" detail={detailExtras} summary={props.totalAdvanced} />
          </section>

          {/* Rodapé — a conta por extenso */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider text-muted-foreground">A conta por extenso</p>
            <p className="font-mono leading-relaxed">
              participação {formatCurrency(props.partnerShare)} + desembolso{" "}
              {formatCurrency(props.totalDisbursement)} {props.totalAdjustments < 0 ? "−" : "+"} ajustes{" "}
              {formatCurrency(Math.abs(props.totalAdjustments))} − receitas em poder{" "}
              {formatCurrency(props.totalRevenuesHeld)} − já adiantado {formatCurrency(props.totalAdvanced)} ={" "}
              <strong>{formatCurrency(props.transferBase)}</strong>
              {props.transferWithVat && (
                <>
                  {" "}
                  + IVA 23% {formatCurrency(props.transferVat)} ={" "}
                  <strong>{formatCurrency(props.transferTotal)}</strong>
                </>
              )}
            </p>
            <Mismatch
              label="Financiamento a devolver"
              detail={roundCents(detailBp + detailTx + detailAdj - detailHeld)}
              summary={props.financingToReturn}
            />
            <Mismatch
              label="Base a transferir"
              detail={roundCents(props.partnerShare + props.financingToReturn - props.totalAdvanced)}
              summary={props.transferBase}
            />
          </div>
        </div>
      )}
    </div>
  );
}
