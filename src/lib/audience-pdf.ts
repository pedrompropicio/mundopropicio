// Helpers para exportar análises do módulo Audience como PDF.
// Abre nova janela com HTML auto-contido + auto-trigger de print.

function escapeHtml(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface PrintAsPdfOpts {
  bodyHtml: string;
  documentTitle: string;
  footerText?: string;
}

export function printAsPdf(opts: PrintAsPdfOpts) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Permite popups neste site para gerar o PDF.");
    return;
  }
  const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.documentTitle)}</title>
  <style>
    @page { margin: 14mm 12mm; size: A4; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1f2937;
      background: #fff;
      line-height: 1.5;
      font-size: 10.5pt;
      padding: 0 4mm;
    }
    h1 { font-size: 20pt; margin: 0 0 4px 0; color: #0e7490; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-size: 12pt; margin: 18px 0 6px; color: #0e7490; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    h3 { font-size: 11pt; margin: 10px 0 4px; font-weight: 600; }
    .subtitle { color: #6b7280; font-size: 10pt; margin-bottom: 16px; }
    .meta { font-size: 9pt; color: #6b7280; }
    .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; page-break-inside: avoid; margin-bottom: 10px; }
    .card.success { border-color: #10b981; background: #ecfdf5; }
    .card.warn { border-color: #f59e0b; background: #fffbeb; }
    .card.danger { border-color: #ef4444; background: #fef2f2; }
    .card.cyan { border-color: #06b6d4; background: #ecfeff; }
    .card.purple { border-color: #a855f7; background: #faf5ff; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .grid { display: grid; gap: 8px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    .badge.high { background: #fee2e2; color: #b91c1c; }
    .badge.medium { background: #fef3c7; color: #92400e; }
    .badge.low { background: #e5e7eb; color: #374151; }
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.danger { background: #fee2e2; color: #b91c1c; }
    .badge.info { background: #cffafe; color: #155e75; }
    ul { margin: 4px 0; padding-left: 18px; }
    li { margin-bottom: 4px; }
    .mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 9pt; color: #6b7280; }
    .score-pill { display: inline-flex; flex-direction: column; align-items: center; padding: 6px 12px; border-radius: 8px; border: 2px solid; font-weight: 700; min-width: 80px; text-align: center; }
    .score-pill .big { font-size: 18pt; line-height: 1; }
    .score-pill .small { font-size: 9pt; opacity: 0.7; }
    .stat-box { padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 4px; }
    .stat-box .label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
    .stat-box .value { font-size: 12pt; font-weight: 700; margin-top: 2px; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8.5pt; color: #6b7280; text-align: center; }
    .toolbar { position: fixed; top: 12px; right: 12px; z-index: 9999; display: flex; gap: 8px; }
    .btn { padding: 8px 14px; background: #0891b2; color: white; border: none; border-radius: 6px; font-size: 10.5pt; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
    .btn:hover { background: #0e7490; }
    .btn.outline { background: white; color: #0e7490; border: 1px solid #0e7490; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn" onclick="window.print()">🖨️ Imprimir / PDF</button>
    <button class="btn outline" onclick="window.close()">Fechar</button>
  </div>
  ${opts.bodyHtml}
  <div class="footer">${escapeHtml(opts.footerText ?? "MP Audience")} · Gerado em ${new Date().toLocaleString("pt-PT")}</div>
  <script>
    setTimeout(() => { try { window.print(); } catch(e) {} }, 700);
  </script>
</body>
</html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ═══ Pixel Health ═══

export function printPixelHealth(pixelsData: any, onlyUsed: boolean) {
  if (!pixelsData) return;
  const pixels = (onlyUsed ? pixelsData.pixels_used_in_active_campaigns : pixelsData.all_pixels) ?? [];

  const renderPixel = (px: any): string => {
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
      return `<li><span class="badge ${badge}">${icon}</span> ${escapeHtml(c.label)} — <span class="mono">${escapeHtml(c.value)}</span> <span class="mono">(${c.pts}/${c.max})</span></li>`;
    };

    return `
      <div class="card ${cls}">
        <div class="row">
          <div style="flex: 1; min-width: 0;">
            <h3 style="margin: 0;">${escapeHtml(px.name)}</h3>
            <div class="mono">ID: ${escapeHtml(px.id)}</div>
            <div style="margin-top: 6px; font-size: 10pt; color: ${textColor};">${escapeHtml(px.health.message)}</div>
          </div>
          <div class="score-pill" style="border-color: ${color}; color: ${textColor};">
            <span class="big">${escapeHtml(px.grade)}</span>
            <span class="small">${px.score}/100</span>
          </div>
        </div>

        <div class="grid grid-2" style="margin-top: 10px;">
          <div class="stat-box">
            <div class="label">🛒 Bilheteira (site)</div>
            <div class="value">${px.site_score}/${px.site_max}</div>
          </div>
          <div class="stat-box">
            <div class="label">⚙️ Meta (config)</div>
            <div class="value">${px.meta_score}/${px.meta_max}</div>
          </div>
        </div>

        ${px.linked_campaigns?.length > 0 ? `
          <h3>🎯 Campanhas ativas (${px.linked_campaigns.length})</h3>
          <ul>${px.linked_campaigns.map((c: any) => `<li>${escapeHtml(c.name)}</li>`).join("")}</ul>
        ` : ""}

        ${px.domains?.length > 0 ? `
          <h3>🌐 Domínios detetados (${px.domains.length})</h3>
          <ul>${px.domains.slice(0, 8).map((d: any) => `<li><span class="mono">${escapeHtml(d.domain)}</span> — ${d.count.toLocaleString("pt-PT")} eventos</li>`).join("")}</ul>
        ` : ""}

        ${siteChecks.length > 0 ? `
          <h3>🛒 Checks da bilheteira</h3>
          <ul>${siteChecks.map(renderCheck).join("")}</ul>
        ` : ""}

        ${metaChecks.length > 0 ? `
          <h3>⚙️ Checks da Meta</h3>
          <ul>${metaChecks.map(renderCheck).join("")}</ul>
        ` : ""}

        ${siteRecs.length > 0 ? `
          <h3>🛒 Ações para o dev da bilheteira</h3>
          <ul>${siteRecs.map((r: any) => `<li><span class="badge ${r.priority}">${r.priority}</span> ${escapeHtml(r.text)}</li>`).join("")}</ul>
        ` : ""}

        ${metaRecs.length > 0 ? `
          <h3>⚙️ Ações no Events Manager / Business Manager</h3>
          <ul>${metaRecs.map((r: any) => `<li><span class="badge ${r.priority}">${r.priority}</span> ${escapeHtml(r.text)}</li>`).join("")}</ul>
        ` : ""}

        <div class="grid grid-4" style="margin-top: 10px;">
          <div class="stat-box"><div class="label">Eventos 7d</div><div class="value">${px.stats_7d.total_events.toLocaleString("pt-PT")}</div></div>
          <div class="stat-box"><div class="label">Users únicos</div><div class="value">${px.stats_7d.unique_events.toLocaleString("pt-PT")}</div></div>
          <div class="stat-box"><div class="label">Média/dia</div><div class="value">${px.stats_7d.events_per_day_avg.toLocaleString("pt-PT")}</div></div>
          <div class="stat-box"><div class="label">Tipos eventos</div><div class="value">${px.stats_7d.event_types.length}</div></div>
        </div>

        ${px.stats_7d.event_types?.length > 0 ? `
          <h3>📊 Top eventos (últimos 7d)</h3>
          <ul>${px.stats_7d.event_types.slice(0, 8).map((et: any) => `<li><span class="mono">${escapeHtml(et.event)}</span> — ${et.count.toLocaleString("pt-PT")} (${et.unique_count.toLocaleString("pt-PT")} únicos)</li>`).join("")}</ul>
        ` : ""}
      </div>
    `;
  };

  const bodyHtml = `
    <h1>Pixel Health Report</h1>
    <p class="subtitle">${pixels.length} pixel${pixels.length !== 1 ? "s" : ""} ${onlyUsed ? "em campanhas ativas" : "encontrado" + (pixels.length !== 1 ? "s" : "")} · Snapshot ${new Date(pixelsData.fetched_at).toLocaleString("pt-PT")}</p>
    ${pixels.length === 0 ? `<div class="card"><p class="meta">Nenhum pixel a apresentar.</p></div>` : pixels.map(renderPixel).join("")}
  `;

  printAsPdf({
    documentTitle: `Pixel Health ${new Date().toISOString().slice(0, 10)}`,
    footerText: "MP Audience — Pixel Health Report",
    bodyHtml,
  });
}

// ═══ Campaign Analyze ═══

export function printCampaignAnalysis(analyzeData: any) {
  if (!analyzeData?.analysis) return;
  const a = analyzeData.analysis;
  const c = analyzeData.campaign ?? {};
  const verdictCls = a.verdict === "excelente" || a.verdict === "bom" ? "success" : a.verdict === "regular" ? "warn" : "danger";
  const verdictBadge = a.verdict === "excelente" || a.verdict === "bom" ? "success" : a.verdict === "regular" ? "medium" : "danger";

  const bodyHtml = `
    <h1>Análise IA da Campanha</h1>
    <p class="subtitle">${escapeHtml(c.name ?? "")}</p>

    <div class="card ${verdictCls}">
      <span class="badge ${verdictBadge}">${escapeHtml(a.verdict ?? "—")}</span>
      <p style="margin-top: 8px;">${escapeHtml(a.summary ?? "")}</p>
    </div>

    ${a.strengths?.length > 0 ? `
      <h2>✅ Pontos fortes</h2>
      <ul>${a.strengths.map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    ` : ""}

    ${a.weaknesses?.length > 0 ? `
      <h2>⚠️ Pontos fracos</h2>
      <ul>${a.weaknesses.map((w: string) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
    ` : ""}

    ${a.recommendations?.length > 0 ? `
      <h2>💡 Recomendações</h2>
      ${a.recommendations.map((r: any) => `
        <div class="card">
          <div style="display: flex; gap: 8px; align-items: flex-start;">
            <span class="badge ${r.priority}">${escapeHtml(r.priority)}</span>
            <div style="flex: 1;">
              <strong>${escapeHtml(r.action)}</strong>
              <div style="color: #6b7280; font-size: 9.5pt; margin-top: 3px;">${escapeHtml(r.rationale)}</div>
            </div>
          </div>
        </div>
      `).join("")}
    ` : ""}

    <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #6b7280;">
      Análise baseada em ${analyzeData.period?.days_with_data ?? 0} dia${analyzeData.period?.days_with_data === 1 ? "" : "s"} de dados.
      Gerada em ${new Date(analyzeData.generated_at).toLocaleString("pt-PT")}.
    </div>
  `;

  printAsPdf({
    documentTitle: `Análise ${c.name ?? "Campanha"} ${new Date().toISOString().slice(0, 10)}`,
    footerText: `MP Audience — Análise IA · ${c.name ?? ""}`,
    bodyHtml,
  });
}

// ═══ AI Audience Coach ═══

export function printAudienceCoach(coachData: any) {
  if (!coachData?.coach) return;
  const co = coachData.coach;
  const c = coachData.campaign ?? {};
  const verdictCls = co.verdict === "excelente" || co.verdict === "bom" ? "success" : co.verdict === "regular" ? "warn" : "danger";
  const verdictBadge = co.verdict === "excelente" || co.verdict === "bom" ? "success" : co.verdict === "regular" ? "medium" : "danger";

  const bodyHtml = `
    <h1>AI Audience Coach</h1>
    <p class="subtitle">${escapeHtml(c.name ?? "")}</p>

    <div class="card purple">
      <div class="row">
        <div>
          <span class="meta" style="text-transform: uppercase; font-size: 8.5pt;">Artista detetado:</span>
          <strong style="margin-left: 6px;">${escapeHtml(coachData.detected_artist ?? "—")}</strong>
        </div>
        <span class="badge ${verdictBadge}">${escapeHtml(co.verdict ?? "—")}</span>
      </div>
      <p style="margin-top: 8px;">${escapeHtml(co.summary ?? "")}</p>
    </div>

    ${co.diagnostic?.length > 0 ? `
      <h2>🔍 Diagnóstico do targeting atual</h2>
      <ul>${co.diagnostic.map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
    ` : ""}

    ${co.missed_opportunities?.length > 0 ? `
      <h2>💡 Oportunidades perdidas</h2>
      <ul>${co.missed_opportunities.map((o: string) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
    ` : ""}

    ${co.recommendations?.length > 0 ? `
      <h2>🎯 Recomendações priorizadas</h2>
      ${co.recommendations.map((r: any) => `
        <div class="card">
          <div style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px;">
            <span class="badge ${r.priority}">${escapeHtml(r.priority)}</span>
            <strong style="flex: 1;">${escapeHtml(r.action)}</strong>
          </div>
          <div style="color: #6b7280; font-size: 9.5pt;">${escapeHtml(r.rationale)}</div>
          ${r.how ? `<div style="margin-top: 6px; padding-left: 8px; border-left: 2px solid #06b6d4; font-size: 9.5pt;"><strong>Como:</strong> ${escapeHtml(r.how)}</div>` : ""}
        </div>
      `).join("")}
    ` : ""}

    ${co.suggested_audiences?.length > 0 ? `
      <h2>✨ Audiências sugeridas para testar</h2>
      ${co.suggested_audiences.map((au: any) => `
        <div class="card cyan">
          <div class="row" style="margin-bottom: 4px;">
            <strong>${escapeHtml(au.name)}</strong>
            <span class="badge info">${escapeHtml(au.type)}</span>
          </div>
          <div class="meta">${escapeHtml(au.spec)}</div>
          <div style="color: #0e7490; font-size: 9.5pt; margin-top: 4px;">${escapeHtml(au.estimated_size)}</div>
        </div>
      `).join("")}
    ` : ""}

    <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #6b7280;">
      Análise baseada em: ${coachData.context_used?.current_adsets ?? 0} adsets · ${coachData.context_used?.top_performers_count ?? 0} top performers · ${coachData.context_used?.interests_found ?? 0} interesses · ${coachData.context_used?.custom_audiences_count ?? 0} custom audiences.
      Gerada em ${new Date(coachData.generated_at).toLocaleString("pt-PT")}.
    </div>
  `;

  printAsPdf({
    documentTitle: `Audience Coach ${c.name ?? "Campanha"} ${new Date().toISOString().slice(0, 10)}`,
    footerText: `MP Audience — Audience Coach · ${c.name ?? ""}`,
    bodyHtml,
  });
}
