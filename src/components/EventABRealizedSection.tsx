import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { useEventABRealized } from "@/hooks/useEventABRealized";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

/**
 * Secção "Realizado (fecho)" do módulo A&B — read-only, alimentada pelas
 * transações do evento (ver useEventABRealized). Não substitui o planeamento.
 */
export default function EventABRealizedSection({
  eventId,
  moduleReceita = null,
}: {
  eventId: string;
  /**
   * Receita A&B calculada pelo módulo no cenário Real, passada apenas quando
   * há facturação real do operador informada. Serve para uma leitura
   * informativa de reconciliação — não corrige nem substitui nada.
   */
  moduleReceita?: number | null;
}) {
  const navigate = useNavigate();
  const r = useEventABRealized(eventId);


  const goToTx = (id: string) => navigate(`/transacoes?highlight=${id}`);

  return (
    <Card className="border-dashed">
      <CardHeader className="flex-row items-start justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <CardTitle>Realizado (fecho)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Origem: transações do evento (ref. de acerto). Somente leitura — sem re-digitação de dados.
          </p>
          {r.references.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {r.references.map((ref) => (
                <Badge key={ref} variant="outline" className="font-mono text-[10px]">
                  {ref}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {r.hasData && (r.incomeLines[0] || r.expenseLines[0]) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => goToTx((r.incomeLines[0] ?? r.expenseLines[0]).id)}
          >
            <ExternalLink className="h-4 w-4 mr-2" /> Ver transações
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {r.isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">A carregar…</p>
        ) : !r.hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sem fecho de A&B lançado.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Receita A&B (quota MP)</div>
                <div className="text-lg font-semibold tabular-nums text-primary">{fmtEUR(r.receita)}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Despesas descontadas</div>
                <div className="text-lg font-semibold tabular-nums text-destructive">{fmtEUR(r.despesas)}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Resultado líquido A&B</div>
                <div
                  className={
                    "text-lg font-semibold tabular-nums " +
                    (r.resultado >= 0 ? "text-emerald-600" : "text-rose-600")
                  }
                >
                  {fmtEUR(r.resultado)}
                </div>
              </div>
            </div>

            {moduleReceita != null && (
              <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">Leitura informativa</div>
                <div className="tabular-nums">
                  Módulo A&B (cenário Real, com facturação real): {fmtEUR(moduleReceita)} · Receita
                  lançada em transações: {fmtEUR(r.receita)} · Diferença:{" "}
                  {fmtEUR(moduleReceita - r.receita)}
                </div>
                <p>
                  Divergência é esperada enquanto o fecho não estiver completo (podem faltar
                  lançamentos ou existir despesas descontadas na quota). O módulo não corrige as
                  transações.
                </p>
              </div>
            )}



            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rubrica</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.incomeLines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {l.categoryCode ?? "—"} {l.categoryName ?? ""}
                      </TableCell>
                      <TableCell className="text-sm">{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {fmtEUR(l.amount)}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => goToTx(l.id)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {r.expenseLines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {l.categoryCode ?? "—"} {l.categoryName ?? ""}
                      </TableCell>
                      <TableCell className="text-sm">{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        −{fmtEUR(l.amount)}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => goToTx(l.id)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={2}>Resultado líquido A&B</TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums " +
                        (r.resultado >= 0 ? "text-emerald-600" : "text-rose-600")
                      }
                    >
                      {fmtEUR(r.resultado)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
