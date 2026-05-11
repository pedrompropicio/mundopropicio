import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import "./strategy-print.css";

function fmtEur(n: number | null | undefined, frac = 0) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: frac });
}
function fmtNum(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 2 });
}

export default function CrmStrategyPrint() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["crm-strategy-print", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let event: any = null;
      if (data.event_id) {
        const { data: e } = await supabase.from("events").select("id, name, date, location, tickets_total").eq("id", data.event_id).maybeSingle();
        event = e ?? null;
      }
      return { ...data, event };
    },
  });

  useEffect(() => {
    if (data && !isLoading) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [data, isLoading]);

  if (isLoading) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> A preparar PDF…</div>;
  }
  if (!data) return <div className="p-8">Estratégia não encontrada.</div>;
  const plan = data.generated_plan as any;
  if (!plan) return <div className="p-8">Esta estratégia ainda não tem plano gerado.</div>;

  const summary = plan.summary ?? {};
  const phases: any[] = plan.phases ?? [];
  const scaling: any[] = plan.scaling_rules ?? [];
  const kpis = plan.kpis_global ?? {};
  const risks: any[] = plan.risks_and_warnings ?? [];
  const brief = plan.creative_brief ?? {};
  const manualApply: string = plan.manual_apply_instructions ?? "";
  const generatedDate = data.generated_at ? new Date(data.generated_at).toLocaleDateString("pt-PT") : "—";

  const phaseCampaigns = new Map<string, any[]>();
  for (const c of plan.recommended_campaigns ?? []) {
    const arr = phaseCampaigns.get(c.phase_id) ?? [];
    arr.push(c);
    phaseCampaigns.set(c.phase_id, arr);
  }

  return (
    <div className="strategy-print">
      <button onClick={() => window.print()} className="no-print print-btn">Imprimir / Salvar PDF</button>

      <section className="cover page-break-after">
        <div className="cover-brand">MUNDO PROPÍCIO · MP AUDIENCE</div>
        <h1 className="cover-title">{data.name}</h1>
        {data.event && (
          <div className="cover-event">
            <div className="cover-event-name">{data.event.name}</div>
            {data.event.date && <div className="cover-event-date">{new Date(data.event.date).toLocaleDateString("pt-PT")}</div>}
            {data.event.location && <div className="cover-event-location">{data.event.location}</div>}
          </div>
        )}
        <div className="cover-kpis">
          <div><span>Meta de receita</span><strong>{fmtEur(data.goal_revenue_eur)}</strong></div>
          <div><span>Verba recomendada</span><strong>{fmtEur(summary.recommended_total_budget_eur)}</strong></div>
          <div><span>ROAS esperado</span><strong>{summary.expected_overall_roas ? `${fmtNum(summary.expected_overall_roas)}x` : "—"}</strong></div>
          <div><span>Vendas esperadas</span><strong>{fmtNum(summary.expected_purchases)}</strong></div>
        </div>
        <div className="cover-meta">
          Gerado em {generatedDate} · {plan.summary?.feasibility ? `Viabilidade ${plan.summary.feasibility}` : ""}
        </div>
      </section>

      <section className="page-break-after">
        <h2>Sumário executivo</h2>
        {summary.feasibility_reason && <p>{summary.feasibility_reason}</p>}
        <table className="kpi-table">
          <tbody>
            <tr><th>Verba total recomendada</th><td>{fmtEur(summary.recommended_total_budget_eur)}</td></tr>
            <tr><th>Compras esperadas</th><td>{fmtNum(summary.expected_purchases)}</td></tr>
            <tr><th>Receita esperada</th><td>{fmtEur(summary.expected_revenue_eur)}</td></tr>
            <tr><th>ROAS esperado</th><td>{summary.expected_overall_roas ? `${fmtNum(summary.expected_overall_roas)}x` : "—"}</td></tr>
            <tr><th>CPA esperado</th><td>{summary.expected_cpa_eur != null ? fmtEur(summary.expected_cpa_eur, 2) : "—"}</td></tr>
            <tr><th>Viabilidade</th><td>{summary.feasibility ?? "—"} (confiança: {summary.confidence ?? "—"})</td></tr>
          </tbody>
        </table>
      </section>

      {phases.length > 0 && (
        <section>
          <h2>Fases da campanha</h2>
          {phases.map((p, idx) => {
            const camps = phaseCampaigns.get(p.id) ?? [];
            return (
              <div key={p.id ?? idx} className="phase-block">
                <h3>Fase {idx + 1}: {p.name}</h3>
                <div className="phase-meta">D-{p.days_from_event_start} → D-{p.days_from_event_end} ({p.duration_days}d) · Objetivo: {p.objective} · Verba diária: {fmtEur(p.daily_budget_eur)} · Total: {fmtEur(p.total_phase_budget_eur)}</div>
                {p.primary_audiences?.length > 0 && (
                  <>
                    <div className="phase-sub">Audiences</div>
                    <ul>{p.primary_audiences.map((a: any, i: number) => <li key={i}>{a.type}: {a.description}{a.estimated_size ? ` (${a.estimated_size})` : ""}</li>)}</ul>
                  </>
                )}
                {p.creative_focus && <div><strong>Criativo:</strong> {p.creative_focus}</div>}
                {p.target_kpis && (
                  <div className="phase-kpis">
                    <strong>KPIs alvo:</strong> CPM máx {p.target_kpis.cpm_eur_max != null ? fmtEur(p.target_kpis.cpm_eur_max, 2) : "—"} · CTR mín {p.target_kpis.ctr_pct_min ?? "—"}% · CPA máx {p.target_kpis.cpa_eur_max != null ? fmtEur(p.target_kpis.cpa_eur_max, 2) : "—"} · ROAS mín {p.target_kpis.roas_min ?? "—"}x
                  </div>
                )}
                {p.success_criteria_to_next_phase && <div><strong>Passa à próxima quando:</strong> {p.success_criteria_to_next_phase}</div>}
                {p.learning_phase_note && <div className="phase-note">{p.learning_phase_note}</div>}
                {camps.length > 0 && (
                  <>
                    <div className="phase-sub">Campanhas recomendadas</div>
                    {camps.map((c: any, ci: number) => (
                      <div key={ci} className="campaign-block">
                        <div><strong>{c.campaign_name}</strong> ({c.objective} · {fmtEur(c.daily_budget_eur)}/dia · {c.duration_days}d)</div>
                        {c.adsets?.map((a: any, ai: number) => (
                          <div key={ai} className="adset-block">
                            <em>{a.adset_name}</em> — opt: {a.optimization_goal} · billing: {a.billing_event} · creative: {a.creative_type_recommended}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}

      {scaling.length > 0 && (
        <section className="page-break-before">
          <h2>Regras de scaling</h2>
          <table className="rules-table">
            <thead><tr><th>Trigger</th><th>Action</th><th>Rationale</th></tr></thead>
            <tbody>
              {scaling.map((r, i) => <tr key={i}><td>{r.trigger}</td><td><strong>{r.action}</strong></td><td>{r.rationale}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}

      {kpis && Object.keys(kpis).length > 0 && (
        <section>
          <h2>KPIs globais esperados</h2>
          <table className="kpi-table">
            <tbody>
              <tr><th>Impressões</th><td>{fmtNum(kpis.expected_total_impressions)}</td></tr>
              <tr><th>Reach</th><td>{fmtNum(kpis.expected_total_reach)}</td></tr>
              <tr><th>Clicks</th><td>{fmtNum(kpis.expected_total_clicks)}</td></tr>
              <tr><th>Frequência média</th><td>{fmtNum(kpis.expected_avg_frequency)}</td></tr>
              <tr><th>Compras</th><td>{fmtNum(kpis.expected_total_purchases)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {risks.length > 0 && (
        <section>
          <h2>Riscos & avisos</h2>
          {risks.map((r, i) => (
            <div key={i} className="risk-block">
              <strong>[{r.severity?.toUpperCase()}] {r.title}</strong>
              <div>{r.description}</div>
            </div>
          ))}
        </section>
      )}

      {brief && Object.keys(brief).length > 0 && (
        <section>
          <h2>Creative brief</h2>
          {brief.primary_message && <p><strong>Mensagem central:</strong> {brief.primary_message}</p>}
          {brief.tone && <p><strong>Tom:</strong> {brief.tone}</p>}
          {brief.must_include?.length > 0 && <p><strong>Deve incluir:</strong> {brief.must_include.join(", ")}</p>}
          {brief.avoid?.length > 0 && <p><strong>Evitar:</strong> {brief.avoid.join(", ")}</p>}
        </section>
      )}

      {manualApply && (
        <section>
          <h2>Como aplicar no Ads Manager</h2>
          <p style={{ whiteSpace: "pre-line" }}>{manualApply}</p>
        </section>
      )}

      <div className="footer-meta">
        Estratégia gerada por MP Audience (IA Gemini 2.5 Flash) · {generatedDate} · ID {data.id.slice(0, 8)}
      </div>
    </div>
  );
}
