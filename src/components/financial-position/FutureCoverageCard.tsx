import { useFinancialPositionP5 } from "@/hooks/useFinancialPositionP5";
import { formatPositionAmount } from "@/lib/financial-position";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CoverageScenarioModal } from "./CoverageScenarioModal";
import { ExplainButton } from "./ExplainSheet";
import { explainNeed, explainRevenue, type Breakdown } from "@/lib/financial-position-explain";
import { revenueCoverage } from "../../../supabase/functions/_shared/ticketing/planning-forecast";

type Coverage = FinancialPositionP5["cobertura_futuros"];

/** P5b (D-ERP326): cartão só informativo. A UI completa é o P6b. Sempre todos os anos (eventos futuros podem ser do ano seguinte). */
export function FutureCoverageView({ data }: { data: Coverage }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { isAdmin, isManager } = useAuth();
  const t = data.total;
  const projected = data.receita_prevista;
  const revenue = projected ?? (t && typeof t.necessidade.com_sem_linha === "number" && typeof t.necessidade.sem_linha_cobre_bp === "number"
    ? revenueCoverage({ com_sem_linha: t.necessidade.com_sem_linha, sem_linha_cobre_bp: t.necessidade.sem_linha_cobre_bp }, t.vendas_futuras, t.saido_minimo_total) : null);
  const row = (label: string, v: number | null, b?: Breakdown) => <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="flex items-center gap-1 tabular-nums">{formatPositionAmount(v)}{b && <ExplainButton breakdown={b} />}</dd></div>;
  const ex = revenue ? explainRevenue(data, revenue) : null;
  const need = (label: string, v: number | null, b: Breakdown, big = true) => <div className={big ? "rounded-md bg-muted/30 p-3" : "p-3"}><div className="flex items-start justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p><ExplainButton breakdown={b} /></div><p className="text-xl font-semibold tabular-nums">{formatPositionAmount(v)}</p></div>;
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
        {need("Necessidade — com faturas sem linha", t.necessidade.com_sem_linha, explainNeed(data, "com_sem_linha"))}
        {need("Necessidade — faturas sem linha cobrem BP", t.necessidade.sem_linha_cobre_bp, explainNeed(data, "sem_linha_cobre_bp"))}
      </div>
      {revenue && <>
        <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-8">
          {row("Receita considerada", revenue.receita_considerada_total, ex?.considered)}
          {row("Potencial após saído mínimo", revenue.potencial_total, ex?.potential)}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          {ex && need("Com receita — com faturas sem linha", revenue.necessidade_com_receita?.com_sem_linha ?? null, ex.withRevenue("com_sem_linha"), false)}
          {ex && need("Com receita — faturas sem linha cobrem BP", revenue.necessidade_com_receita?.sem_linha_cobre_bp ?? null, ex.withRevenue("sem_linha_cobre_bp"), false)}
        </div>
      </>}
      <div className="divide-y divide-border border-t border-border">
        {data.eventos?.map(event => {
          const forecast = projected?.eventos.find(e => e.event_id === event.event_id);
          return <div key={event.event_id} className="py-3 space-y-2"><div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-medium">{event.nome}</p><p className="text-xs text-muted-foreground">{forecast ? `Previsão bruta: ${formatPositionAmount(forecast.previsao_bruta)}` : "Real"}</p>
              {forecast && <p className="text-xs text-muted-foreground">Considerada: {formatPositionAmount(forecast.receita_considerada)} · Potencial: {forecast.potencial == null ? forecast.fonte_potencial : formatPositionAmount(forecast.potencial)}</p>}</div>
            {(isAdmin || isManager) && <Button variant="outline" size="sm" onClick={() => setEditingId(event.event_id)}>Cenário de receita</Button>}
          </div>
          {forecast && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Eventos e sessões · {forecast.eventos.length}</summary>
            <div className="divide-y divide-border pl-3">{forecast.eventos.map(detail => <div key={detail.event_id} className="py-2 space-y-1">
              <div className="flex flex-wrap justify-between gap-2"><p>{detail.nome}</p>{(isAdmin || isManager) && <Button variant="ghost" size="sm" onClick={() => setEditingId(detail.event_id)}>Cenário</Button>}</div>
              <p className="text-xs text-muted-foreground">{detail.cenario.modo === "previsao" ? "Previsão" : "Real"} · {detail.cenario.percentagem}%{detail.herdado ? " · herdado" : ""} · {detail.fonte === "sem_previsao" ? "sem previsão" : detail.fonte}</p>
              <p className="text-xs tabular-nums">Previsão: {formatPositionAmount(detail.previsao_bruta)} · Considerada: {formatPositionAmount(detail.receita_considerada)}</p>
            </div>)}</div>
          </details>}
          </div>;
        })}
      </div>
      {projected && <p className="text-xs text-muted-foreground">Sem previsão: {projected.eventos_sem_previsao} · Projeção de receita, não é recebível.</p>}
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
