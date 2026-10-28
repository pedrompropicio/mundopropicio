import { useFinancialPositionP5 } from "@/hooks/useFinancialPositionP5";
import { formatPositionAmount } from "@/lib/financial-position";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CoverageScenarioModal } from "./CoverageScenarioModal";

type Coverage = FinancialPositionP5["cobertura_futuros"];

/** P5b (D-ERP326): cartão só informativo. A UI completa é o P6b. Sempre todos os anos (eventos futuros podem ser do ano seguinte). */
export function FutureCoverageView({ data }: { data: Coverage }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { isAdmin, isManager } = useAuth();
  const t = data.total;
  const projected = data.receita_prevista;
  const row = (label: string, v: number | null) => <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatPositionAmount(v)}</dd></div>;
  return <section aria-label="Cobertura de eventos futuros" className="space-y-3 rounded-md border border-border p-5">
    <h2 className="text-lg font-semibold">Cobertura de eventos futuros</h2>
    <p className="text-sm text-muted-foreground">{data.meta.nota_bp_provisorio}</p>
    {data.meta.incompleto || !t ? <p role="status" className="text-muted-foreground">Indisponível neste momento (incompleto).</p> : <>
      <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-8">
        {row("Vendas futuras", t.vendas_futuras)}
        {row("Despesas pagas", t.despesas_pagas_futuras)}
        {row("A pagar lançado", t.a_pagar_lancado_futuros)}
        {row("BP por lançar", t.bp_por_lancar_futuros)}
        {row("Aporte de sócios", t.aporte_socios_total)}
        {row("Aporte MP (estimativa)", t.aporte_mp_estimativa_total)}
        {row("Dinheiro de eventos em conta", t.dinheiro_de_eventos_em_conta)}
        {row("Caixa MP adiantado", t.caixa_mp_adiantado_total)}
        {row("Saído mínimo das bilheteiras", t.saido_minimo_total)}
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-muted/30 p-3"><p className="text-sm text-muted-foreground">Necessidade — com faturas sem linha</p><p className="text-xl font-semibold tabular-nums">{formatPositionAmount(t.necessidade.com_sem_linha)}</p></div>
        <div className="rounded-md bg-muted/30 p-3"><p className="text-sm text-muted-foreground">Necessidade — faturas sem linha cobrem BP</p><p className="text-xl font-semibold tabular-nums">{formatPositionAmount(t.necessidade.sem_linha_cobre_bp)}</p></div>
      </div>
      {projected && <>
        <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-8">
          {row("Receita considerada", projected.receita_considerada_total)}
          {row("Potencial após saído mínimo", projected.potencial_total)}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-3"><p className="text-sm text-muted-foreground">Com receita — com faturas sem linha</p><p className="text-xl font-semibold tabular-nums">{formatPositionAmount(projected.necessidade_com_receita?.com_sem_linha ?? null)}</p></div>
          <div className="p-3"><p className="text-sm text-muted-foreground">Com receita — faturas sem linha cobrem BP</p><p className="text-xl font-semibold tabular-nums">{formatPositionAmount(projected.necessidade_com_receita?.sem_linha_cobre_bp ?? null)}</p></div>
        </div>
      </>}
      <div className="divide-y divide-border border-t border-border">
        {data.eventos?.map(event => {
          const forecast = projected?.eventos.find(e => e.event_id === event.event_id);
          return <div key={event.event_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-sm font-medium">{event.nome}</p><p className="text-xs text-muted-foreground">Previsão bruta: {formatPositionAmount(forecast?.previsao_bruta ?? null)}</p></div>
            {(isAdmin || isManager) && <Button variant="outline" size="sm" onClick={() => setEditingId(event.event_id)}>Cenário de receita</Button>}
          </div>;
        })}
      </div>
      <p className="text-xs text-muted-foreground">{data.meta.notas.necessidade} {data.meta.notas.aporte_mp}</p>
    </>}
    {editingId && <CoverageScenarioModal eventId={editingId} onClose={() => setEditingId(null)} />}
  </section>;
}

export function FutureCoverageCard() {
  const q = useFinancialPositionP5(null);
  if (q.isLoading) return <p role="status" className="text-muted-foreground">A carregar cobertura de eventos futuros…</p>;
  if (q.isError || !q.data) return null;
  return <FutureCoverageView data={q.data.cobertura_futuros} />;
}
