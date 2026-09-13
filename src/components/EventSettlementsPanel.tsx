/**
 * Painel "Apuramentos" — SÓ LEITURA (épica #146, sub-tarefas (a)→(c)).
 *
 * (a) espelho de `event_partners` em `event_settlements` + participantes.
 * (b) perímetro: linhas de BP/transações marcadas com `event_settlement_id`.
 * (c) motor: resultado por base, quota do pai, partes, residual da MP e conferências.
 *
 * NENHUM cálculo do sistema consome isto: o Fecho, o card e o Encontro de Contas
 * continuam a ler `event_partners`. Sem edição nesta peça.
 */
import { Layers, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/mock-data";
import { useEventSettlementEngine } from "@/hooks/useEventSettlementEngine";
import type { EngineCheck, SettlementNodeResult } from "@/lib/event-settlement-engine";
import { EventThirdPartyOperationsPanel } from "@/components/EventThirdPartyOperationsPanel";

interface Props {
  eventId: string;
}

const fmtPct = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v)}%`;

function CheckSeal({ check }: { check: EngineCheck }) {
  const Icon = check.ok ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
        check.ok
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-destructive/50 bg-destructive/10 text-destructive"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {check.label} — <strong>{check.ok ? "confere" : "NÃO confere"}</strong>{" "}
        (diferença {formatCurrency(check.value)})
      </span>
    </div>
  );
}

export function EventSettlementsPanel({ eventId }: Props) {
  const {
    result,
    isLoading,
    basis,
    settlements,
    rawOperations,
    rawParticipations,
    hasAbModule,
  } = useEventSettlementEngine(eventId);

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar apuramentos…</p>;
  if (!result || result.nodes.length === 0)
    return <p className="text-sm text-muted-foreground">Este evento ainda não tem apuramentos.</p>;

  const renderNode = (n: SettlementNodeResult) => (
    <div key={n.id} className={n.depth > 0 ? "ml-4 border-l border-border/60 pl-4" : ""}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{n.name}</span>
        {n.parentId && (
          <Badge variant="outline" className="text-xs">
            {fmtPct(n.parentSharePct)} do apuramento acima
            {n.parentQuotaBasis === "net_result_gross_expenses" ? " · despesas c/IVA" : " · despesas s/IVA"}
            {n.parentQuota != null && ` = ${formatCurrency(n.parentQuota)}`}
          </Badge>
        )}
        {n.isSealed && <Badge className="text-xs">Selado</Badge>}
        <Badge variant="secondary" className="text-[10px]">
          Perímetro: {n.perimeter.isRoot ? "resto do evento · " : ""}
          {n.perimeter.bpLines} linha(s) de BP · {n.perimeter.txLines} transação(ões)
        </Badge>
      </div>

      <div className="mb-3 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border border-border/60 p-2">
          <div className="text-muted-foreground">Receitas s/IVA</div>
          <div className="font-semibold">{formatCurrency(n.perimeter.revenueNet)}</div>
        </div>
        <div className="rounded-md border border-border/60 p-2">
          <div className="text-muted-foreground">Despesas s/IVA · c/IVA</div>
          <div className="font-semibold">
            {formatCurrency(n.perimeter.expensesNet)} · {formatCurrency(n.perimeter.expensesGross)}
          </div>
        </div>
        <div className="rounded-md border border-border/60 p-2">
          <div className="text-muted-foreground">Resultado s/IVA</div>
          <div className="font-semibold">{formatCurrency(n.resultNet)}</div>
        </div>
        <div className="rounded-md border border-border/60 p-2">
          <div className="text-muted-foreground">Resultado c/IVA</div>
          <div className="font-semibold">{formatCurrency(n.resultGross)}</div>
        </div>
      </div>

      {n.childQuotasNet !== 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Quotas levadas por apuramentos abaixo: {formatCurrency(n.childQuotasNet)} · fica neste
          apuramento {formatCurrency(n.moneyNet)}.
        </p>
      )}

      {n.participants.length === 0 ? (
        <p className="mb-4 text-xs text-muted-foreground">Sem participantes.</p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participante</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Base</TableHead>
                <TableHead className="text-right">Parte</TableHead>
                <TableHead>Pago aqui</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.participants.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.kind === "house" && (
                      <Badge variant="outline" className="ml-2 text-[10px]">casa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{p.mode === "settles" ? "Acerta" : "Nominal"}</TableCell>
                  <TableCell className="text-right text-xs">
                    {fmtPct(p.effectivePct)}
                    {p.lossPct !== null && p.lossPct !== p.profitPct && (
                      <span className="text-muted-foreground"> (lucro {fmtPct(p.profitPct)} · perda {fmtPct(p.lossPct)})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.usesGrossExpenses ? "Despesas c/IVA" : "Despesas s/IVA"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(p.share)}</TableCell>
                  <TableCell className="text-xs">
                    {p.kind === "house"
                      ? "—"
                      : p.mode === "settles"
                        ? "Pago aqui"
                        : "Nominal (acerta noutro apuramento)"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {result.nodes.filter((c) => c.parentId === n.id).map(renderNode)}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Vista informativa. Critério de custo em uso: despesas{" "}
        {basis.expenseSource === "committed" ? "previsto + excedido" : "realizado"} ·{" "}
        {basis.includeOverhead ? "com overhead" : "sem overhead"} — o mesmo do Encontro de Contas.
      </p>

      {result.errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          <ul className="list-disc pl-4">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.nodes.filter((n) => !n.parentId).map(renderNode)}

      <EventThirdPartyOperationsPanel
        eventId={eventId}
        result={result}
        settlements={settlements as any}
        rawOperations={rawOperations}
        rawParticipations={rawParticipations}
        hasAbModule={hasAbModule}
      />

      <div className="rounded-lg border border-border/60 p-3">
        <div className="mb-2 text-sm font-semibold">Mundo Propício residual</div>
        <div className="grid gap-2 text-xs sm:grid-cols-5">
          <div>
            <div className="text-muted-foreground">Residual total</div>
            <div className="font-semibold">{formatCurrency(result.house.residual)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Declarada</div>
            <div className="font-semibold">{formatCurrency(result.house.declared)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">IVA dedutível</div>
            <div className="font-semibold">{formatCurrency(result.house.ivaDeductible)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Nominal − real</div>
            <div className="font-semibold">{formatCurrency(result.house.nominalGap)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Resto (tem de ser 0)</div>
            <div className={`font-semibold ${result.house.rest !== 0 ? "text-destructive" : ""}`}>
              {formatCurrency(result.house.rest)}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Resultado s/IVA do evento {formatCurrency(result.eventNetResult)} · partes pagas aos sócios{" "}
          {formatCurrency(result.partnersPaidTotal)}.
        </p>
      </div>

      <div className="space-y-2">
        <CheckSeal check={result.c1} />
        <CheckSeal check={result.c2} />
      </div>

      <p className="text-xs text-muted-foreground">
        Dados ao vivo — não substitui o Encontro de Contas até à peça (e).
      </p>
    </div>
  );
}
