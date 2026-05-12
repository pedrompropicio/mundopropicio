import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./audience-print.css";

const STORAGE_KEY = "audience-print-data";
const MAX_AGE_MS = 5 * 60 * 1000;

interface StoredPayload {
  type: "pixel-health" | "campaign-analysis" | "audience-coach" | "audit-report";
  payload: any;
  ts: number;
}

function loadPayload(expectedType: string): StoredPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    if (parsed.type !== expectedType) return null;
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatEur(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
}
function formatNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-PT");
}
function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function formatRoas(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
}

export default function AudiencePrint() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<StoredPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!type) {
      setError("Tipo não especificado");
      return;
    }
    const loaded = loadPayload(type);
    if (!loaded) {
      setError("Dados não encontrados ou expiraram. Volta atrás e clica novamente em \"Exportar PDF\".");
      return;
    }
    setData(loaded);
  }, [type]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      try { window.print(); } catch (e) { console.error(e); }
    }, 700);
    return () => clearTimeout(t);
  }, [data]);

  if (error) {
    return (
      <div className="audience-print">
        <div className="doc">
          <div className="print-toolbar">
            <button onClick={() => navigate(-1)}>← Voltar</button>
          </div>
          <div className="empty-state">
            <h2>Não foi possível gerar o PDF</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="audience-print">
        <div className="doc">
          <div className="empty-state">A carregar…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="audience-print">
      <div className="print-toolbar no-print">
        <button onClick={() => navigate(-1)} aria-label="Voltar">
          ← Voltar
        </button>
      </div>

      <div className="doc">
        {type === "pixel-health" && <PixelHealthView {...data.payload} />}
        {type === "campaign-analysis" && <CampaignAnalysisView {...data.payload} />}
        {type === "audience-coach" && <AudienceCoachView {...data.payload} />}
        {type === "audit-report" && <AuditReportView {...data.payload} />}

        <div className="footer-doc">
          MP Audience · Gerado em {new Date().toLocaleString("pt-PT")}
        </div>
      </div>

      <div className="print-action no-print">
        <button onClick={() => window.print()}>
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>
    </div>
  );
}

function PixelHealthView({ pixelsData, onlyUsed }: { pixelsData: any; onlyUsed: boolean }) {
  const pixels = (onlyUsed ? pixelsData.pixels_used_in_active_campaigns : pixelsData.all_pixels) ?? [];

  return (
    <>
      <h1>Pixel Health Report</h1>
      <p className="subtitle">
        {pixels.length} pixel{pixels.length !== 1 ? "s" : ""}
        {onlyUsed ? " em campanhas ativas" : ""} · Snapshot {new Date(pixelsData.fetched_at).toLocaleString("pt-PT")}
      </p>
      {pixels.length === 0 ? (
        <div className="card"><p className="meta">Nenhum pixel a apresentar.</p></div>
      ) : (
        pixels.map((px: any) => <PixelCard key={px.id} px={px} />)
      )}
    </>
  );
}

function PixelCard({ px }: { px: any }) {
  const cls = px.health.status === "healthy" ? "success" : px.health.status === "warning" ? "warn" : "danger";
  const color = px.health.status === "healthy" ? "#10b981" : px.health.status === "warning" ? "#f59e0b" : "#ef4444";
  const textColor = px.health.status === "healthy" ? "#065f46" : px.health.status === "warning" ? "#92400e" : "#b91c1c";
  const siteChecks = (px.checks ?? []).filter((c: any) => c.source === "site");
  const metaChecks = (px.checks ?? []).filter((c: any) => c.source === "meta");
  const siteRecs = (px.recommendations ?? []).filter((r: any) => r.source === "site");
  const metaRecs = (px.recommendations ?? []).filter((r: any) => r.source === "meta");

  const renderCheck = (c: any) => {
    const full = c.pts === c.max;
    const partial = c.pts > 0 && c.pts < c.max;
    const icon = full ? "✓" : partial ? "⚠" : "✗";
    const badge = full ? "success" : partial ? "warn" : "danger";
    return (
      <li key={c.key}>
        <span className={`badge ${badge}`}>{icon}</span> {c.label} — <span className="mono">{c.value}</span> <span className="mono">({c.pts}/{c.max})</span>
      </li>
    );
  };

  return (
    <div className={`card ${cls}`}>
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{px.name}</h3>
          <div className="mono">ID: {px.id}</div>
          <div style={{ marginTop: 6, fontSize: "10pt", color: textColor }}>{px.health.message}</div>
        </div>
        <div className="score-pill" style={{ borderColor: color, color: textColor }}>
          <span className="big">{px.grade}</span>
          <span className="small">{px.score}/100</span>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="stat-box"><div className="label">🛒 Bilheteira (site)</div><div className="value">{px.site_score}/{px.site_max}</div></div>
        <div className="stat-box"><div className="label">⚙️ Meta (config)</div><div className="value">{px.meta_score}/{px.meta_max}</div></div>
      </div>

      {px.linked_campaigns?.length > 0 && (
        <>
          <h3>🎯 Campanhas ativas ({px.linked_campaigns.length})</h3>
          <ul>{px.linked_campaigns.map((c: any) => <li key={c.id}>{c.name}</li>)}</ul>
        </>
      )}

      {px.domains?.length > 0 && (
        <>
          <h3>🌐 Domínios detetados ({px.domains.length})</h3>
          <ul>{px.domains.slice(0, 8).map((d: any) => (
            <li key={d.domain}><span className="mono">{d.domain}</span> — {d.count.toLocaleString("pt-PT")} eventos</li>
          ))}</ul>
        </>
      )}

      {siteChecks.length > 0 && (<><h3>🛒 Checks da bilheteira</h3><ul>{siteChecks.map(renderCheck)}</ul></>)}
      {metaChecks.length > 0 && (<><h3>⚙️ Checks da Meta</h3><ul>{metaChecks.map(renderCheck)}</ul></>)}

      {siteRecs.length > 0 && (
        <>
          <h3>🛒 Ações para o dev da bilheteira</h3>
          <ul>{siteRecs.map((r: any, i: number) => (
            <li key={i}><span className={`badge ${r.priority}`}>{r.priority}</span> {r.text}</li>
          ))}</ul>
        </>
      )}
      {metaRecs.length > 0 && (
        <>
          <h3>⚙️ Ações no Events Manager / Business Manager</h3>
          <ul>{metaRecs.map((r: any, i: number) => (
            <li key={i}><span className={`badge ${r.priority}`}>{r.priority}</span> {r.text}</li>
          ))}</ul>
        </>
      )}

      <div className="grid grid-4" style={{ marginTop: 10 }}>
        <div className="stat-box"><div className="label">Eventos 7d</div><div className="value">{px.stats_7d.total_events.toLocaleString("pt-PT")}</div></div>
        <div className="stat-box"><div className="label">Users únicos</div><div className="value">{px.stats_7d.unique_events.toLocaleString("pt-PT")}</div></div>
        <div className="stat-box"><div className="label">Média/dia</div><div className="value">{px.stats_7d.events_per_day_avg.toLocaleString("pt-PT")}</div></div>
        <div className="stat-box"><div className="label">Tipos eventos</div><div className="value">{px.stats_7d.event_types.length}</div></div>
      </div>

      {px.stats_7d.event_types?.length > 0 && (
        <>
          <h3>📊 Top eventos (últimos 7d)</h3>
          <ul>{px.stats_7d.event_types.slice(0, 8).map((et: any) => (
            <li key={et.event}><span className="mono">{et.event}</span> — {et.count.toLocaleString("pt-PT")} ({et.unique_count.toLocaleString("pt-PT")} únicos)</li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

function CampaignAnalysisView({ analyzeData }: { analyzeData: any }) {
  const a = analyzeData.analysis;
  const c = analyzeData.campaign ?? {};
  const m = analyzeData.metrics ?? {};
  const f = analyzeData.funnel ?? {};
  const p = analyzeData.period ?? {};

  const verdictCls = a.verdict === "excelente" || a.verdict === "bom" ? "success" : a.verdict === "regular" ? "warn" : "danger";
  const verdictBadge = a.verdict === "excelente" || a.verdict === "bom" ? "success" : a.verdict === "regular" ? "medium" : "danger";

  const atcRate = f.view_content > 0 ? f.add_to_cart / f.view_content : null;
  const icRate = f.add_to_cart > 0 ? f.initiate_checkout / f.add_to_cart : null;
  const purchRate = f.initiate_checkout > 0 ? f.purchases / f.initiate_checkout : null;

  return (
    <>
      <h1>Análise IA da Campanha</h1>
      <p className="subtitle">{c.name ?? ""}</p>

      <h2>📊 Performance da Campanha</h2>
      <p className="meta" style={{ marginBottom: 8 }}>
        Período: {p.from && p.to ? `${p.from} a ${p.to}` : `últimos ${p.days_back ?? 30} dias`} · {p.days_with_data ?? 0} dia(s) com dados ·{" "}
        Status: <strong>{c.status ?? "—"}</strong> · Objetivo: <strong>{c.objective ?? "—"}</strong>
      </p>

      <div className="grid grid-4">
        <div className="stat-box highlight">
          <div className="label">ROAS</div>
          <div className="value" style={{ color: m.roas >= 2 ? "#059669" : m.roas >= 1 ? "#d97706" : "#dc2626" }}>
            {formatRoas(m.roas)}
          </div>
        </div>
        <div className="stat-box">
          <div className="label">Gasto</div>
          <div className="value">{formatEur(m.spend_eur)}</div>
        </div>
        <div className="stat-box">
          <div className="label">Receita</div>
          <div className="value" style={{ color: "#059669" }}>{formatEur(m.revenue_eur)}</div>
        </div>
        <div className="stat-box">
          <div className="label">Conversões</div>
          <div className="value">{formatNum(m.purchases)}</div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginTop: 8 }}>
        <div className="stat-box"><div className="label">Impressões</div><div className="value">{formatNum(m.impressions)}</div></div>
        <div className="stat-box"><div className="label">Alcance</div><div className="value">{formatNum(m.reach)}</div></div>
        <div className="stat-box"><div className="label">Cliques</div><div className="value">{formatNum(m.clicks)}</div></div>
        <div className="stat-box"><div className="label">CTR</div><div className="value">{formatPct(m.ctr)}</div></div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 8 }}>
        <div className="stat-box"><div className="label">CPC médio</div><div className="value">{formatEur(m.cpc_eur)}</div></div>
        <div className="stat-box"><div className="label">Frequência</div><div className="value">{m.frequency != null ? m.frequency.toFixed(2) : "—"}</div></div>
        <div className="stat-box"><div className="label">CPM</div><div className="value">{m.impressions > 0 ? formatEur((m.spend_eur ?? 0) / (m.impressions / 1000)) : "—"}</div></div>
      </div>

      {(f.view_content > 0 || f.purchases > 0 || f.add_to_cart > 0) && (
        <>
          <h2>🔄 Funil de conversão</h2>
          <div className="grid grid-5">
            <div className="stat-box">
              <div className="label">View Content</div>
              <div className="value">{formatNum(f.view_content)}</div>
            </div>
            <div className="stat-box">
              <div className="label">Add to Cart</div>
              <div className="value">{formatNum(f.add_to_cart)}</div>
              {atcRate != null && <div className="delta">{(atcRate * 100).toFixed(1)}%</div>}
            </div>
            <div className="stat-box">
              <div className="label">Initiate Checkout</div>
              <div className="value">{formatNum(f.initiate_checkout)}</div>
              {icRate != null && <div className="delta">{(icRate * 100).toFixed(1)}%</div>}
            </div>
            <div className="stat-box highlight">
              <div className="label">Purchases</div>
              <div className="value">{formatNum(f.purchases)}</div>
              {purchRate != null && <div className="delta">{(purchRate * 100).toFixed(1)}%</div>}
            </div>
            <div className="stat-box">
              <div className="label">Leads</div>
              <div className="value">{formatNum(f.leads)}</div>
            </div>
          </div>
          <p className="meta" style={{ marginTop: 4 }}>
            Taxas mostram conversão face ao passo anterior (ex: ATC/VC, IC/ATC, Purchase/IC).
          </p>
        </>
      )}

      <h2>🧠 Análise IA</h2>
      <div className={`card ${verdictCls}`}>
        <span className={`badge ${verdictBadge}`}>{a.verdict ?? "—"}</span>
        <p style={{ marginTop: 8 }}>{a.summary ?? ""}</p>
      </div>

      {a.strengths?.length > 0 && (
        <>
          <h3>✅ Pontos fortes</h3>
          <ul>{a.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
        </>
      )}

      {a.weaknesses?.length > 0 && (
        <>
          <h3>⚠️ Pontos fracos</h3>
          <ul>{a.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
        </>
      )}

      {a.recommendations?.length > 0 && (
        <>
          <h3>💡 Recomendações priorizadas</h3>
          {a.recommendations.map((r: any, i: number) => (
            <div key={i} className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span className={`badge ${r.priority}`}>{r.priority}</span>
                <div style={{ flex: 1 }}>
                  <strong>{r.action}</strong>
                  <div style={{ color: "#6b7280", fontSize: "9.5pt", marginTop: 3 }}>{r.rationale}</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <p className="meta" style={{ marginTop: 16 }}>
        Análise gerada em {new Date(analyzeData.generated_at).toLocaleString("pt-PT")}.
      </p>
    </>
  );
}

function AudienceCoachView({ coachData }: { coachData: any }) {
  const co = coachData.coach;
  const c = coachData.campaign ?? {};
  const verdictBadge = co.verdict === "excelente" || co.verdict === "bom" ? "success" : co.verdict === "regular" ? "medium" : "danger";

  return (
    <>
      <h1>AI Audience Coach</h1>
      <p className="subtitle">{c.name ?? ""}</p>

      <div className="card purple">
        <div className="row">
          <div>
            <span className="meta" style={{ textTransform: "uppercase", fontSize: "8.5pt" }}>Artista detetado:</span>
            <strong style={{ marginLeft: 6 }}>{coachData.detected_artist ?? "—"}</strong>
          </div>
          <span className={`badge ${verdictBadge}`}>{co.verdict ?? "—"}</span>
        </div>
        <p style={{ marginTop: 8 }}>{co.summary ?? ""}</p>
      </div>

      {co.diagnostic?.length > 0 && (
        <>
          <h2>🔍 Diagnóstico do targeting atual</h2>
          <ul>{co.diagnostic.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>
        </>
      )}

      {co.missed_opportunities?.length > 0 && (
        <>
          <h2>💡 Oportunidades perdidas</h2>
          <ul>{co.missed_opportunities.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>
        </>
      )}

      {co.recommendations?.length > 0 && (
        <>
          <h2>🎯 Recomendações priorizadas</h2>
          {co.recommendations.map((r: any, i: number) => (
            <div key={i} className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                <span className={`badge ${r.priority}`}>{r.priority}</span>
                <strong style={{ flex: 1 }}>{r.action}</strong>
              </div>
              <div style={{ color: "#6b7280", fontSize: "9.5pt" }}>{r.rationale}</div>
              {r.how && (
                <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid #06b6d4", fontSize: "9.5pt" }}>
                  <strong>Como:</strong> {r.how}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {co.suggested_audiences?.length > 0 && (
        <>
          <h2>✨ Audiências sugeridas para testar</h2>
          {co.suggested_audiences.map((au: any, i: number) => (
            <div key={i} className="card cyan">
              <div className="row" style={{ marginBottom: 4 }}>
                <strong>{au.name}</strong>
                <span className="badge info">{au.type}</span>
              </div>
              <div className="meta">{au.spec}</div>
              <div style={{ color: "#0e7490", fontSize: "9.5pt", marginTop: 4 }}>{au.estimated_size}</div>
            </div>
          ))}
        </>
      )}

      <p className="meta" style={{ marginTop: 16 }}>
        Análise baseada em: {coachData.context_used?.current_adsets ?? 0} adsets · {coachData.context_used?.top_performers_count ?? 0} top performers · {coachData.context_used?.interests_found ?? 0} interesses · {coachData.context_used?.custom_audiences_count ?? 0} custom audiences.
        Gerada em {new Date(coachData.generated_at).toLocaleString("pt-PT")}.
      </p>
    </>
  );
}
