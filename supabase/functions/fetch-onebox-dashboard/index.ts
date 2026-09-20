// fetch-onebox-dashboard — captação das vendas do H&K Madrid a partir do painel
// Superset da Onebox, feita no servidor (sem depender do Chrome do Pedro).
//
// Regra: docs/procedimentos/PROC-vendas-onebox-madrid.md manda em tudo. Esta
// função muda a ORIGEM dos dados (login próprio em vez da sessão do browser),
// não muda as regras de extracção, conferência nem escrita.
//
// Body: { dry_run?: boolean, mode?: "hourly"|"daily", inspect?: boolean }
// - dry_run: faz tudo menos escrever; devolve os números que teria gravado.
// - inspect: só diagnóstico — devolve os charts do dashboard e os filtros.
//
// Nunca imprime a palavra-passe nem valores de cookies.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HOST = "https://dash.oneboxtds.com";
const LOGIN_URL = `${HOST}/login/`;
const DASHBOARD_ID = 43;
const FILTER_KEY = "YAu04AgWBog";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const EVENT_ID = "bf9ce2d8-754e-4485-8427-e2d486c39919"; // H&K Madrid
const COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c"; // Mundo Propício
const ECI_ACCOUNT_ID = "00687bfd-8dd7-475a-a530-615605e9d135"; // bilheteira ECI
const SOURCE = "onebox_import";
const IVA_RATE = 10;

// ───────────────────────── cookies (valores nunca saem) ─────────────────────
class Jar {
  private map = new Map<string, string>();
  absorb(res: Response) {
    const raw = (res.headers as any).getSetCookie?.() ??
      (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
    for (const line of raw as string[]) {
      const first = line.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!value || value === "null" || value === '""') this.map.delete(name);
      else this.map.set(name, value);
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  names() {
    return [...this.map.keys()];
  }
}

function extractCsrf(html: string): string | null {
  for (
    const p of [
      /name="csrf_token"[^>]*value="([^"]+)"/i,
      /id="csrf_token"[^>]*value="([^"]+)"/i,
      /"csrf_token"\s*:\s*"([^"]+)"/i,
    ]
  ) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

class OneboxError extends Error {}

async function login(jar: Jar): Promise<string> {
  const user = Deno.env.get("ONEBOX_DASH_USER");
  const pass = Deno.env.get("ONEBOX_DASH_PASSWORD");
  if (!user || !pass) throw new OneboxError("segredos ONEBOX_DASH_* em falta");

  // 1. página de login → csrf
  const r1 = await fetch(LOGIN_URL, {
    redirect: "manual",
    headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "es-ES,es;q=0.9" },
  });
  jar.absorb(r1);
  const html1 = await r1.text();
  if (r1.status === 403 || /just a moment|you have been blocked/i.test(html1)) {
    throw new OneboxError("bloqueio por IP na página de login (403/desafio)");
  }
  const csrfLogin = extractCsrf(html1);
  if (!csrfLogin) throw new OneboxError("csrf_token não encontrado no HTML do login");

  // 2. UMA tentativa de login. Nunca repetir — a conta pode ser bloqueada.
  const r2 = await fetch(LOGIN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html",
      "Accept-Language": "es-ES,es;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": HOST,
      "Referer": LOGIN_URL,
      "Cookie": jar.header(),
    },
    body: new URLSearchParams({ username: user, password: pass, csrf_token: csrfLogin })
      .toString(),
  });
  jar.absorb(r2);
  const body2 = await r2.text();
  const loc = r2.headers.get("location") ?? "";
  if (r2.status === 403) throw new OneboxError("bloqueio por IP no POST de login (403)");
  if (loc.includes("/login") || /name="csrf_token"/i.test(body2)) {
    throw new OneboxError("login recusado: voltou ao /login/ (credenciais ou csrf)");
  }

  // 3. sessão viva?
  const me = await fetch(`${HOST}/api/v1/me/`, {
    redirect: "manual",
    headers: { "User-Agent": UA, "Accept": "application/json", "Cookie": jar.header() },
  });
  const meBody = await me.text();
  if (me.status !== 200) {
    throw new OneboxError(`/api/v1/me/ devolveu ${me.status} (sessão não estabelecida)`);
  }

  // 4. csrf do dashboard, para o X-CSRFToken das chamadas de dados.
  const r4 = await fetch(`${HOST}/superset/dashboard/${DASHBOARD_ID}/`, {
    redirect: "manual",
    headers: { "User-Agent": UA, "Accept": "text/html", "Cookie": jar.header() },
  });
  jar.absorb(r4);
  const html4 = await r4.text();
  const csrf = extractCsrf(html4);
  if (!csrf) throw new OneboxError("csrf_token do dashboard não encontrado");
  void meBody;
  return csrf;
}

async function apiGet(jar: Jar, path: string): Promise<any> {
  const res = await fetch(`${HOST}${path}`, {
    redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Accept": "application/json",
      "Referer": `${HOST}/superset/dashboard/${DASHBOARD_ID}/`,
      "Cookie": jar.header(),
    },
  });
  const text = await res.text();
  if (res.status !== 200) throw new OneboxError(`GET ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function chartData(jar: Jar, csrf: string, payload: unknown): Promise<any> {
  const res = await fetch(`${HOST}/api/v1/chart/data`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
      "Origin": HOST,
      "Referer": `${HOST}/superset/dashboard/${DASHBOARD_ID}/`,
      "Cookie": jar.header(),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (res.status !== 200) {
    throw new OneboxError(`POST /api/v1/chart/data → ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let body: { dry_run?: boolean; mode?: string; inspect?: boolean } = {};
  try {
    body = await req.json();
  } catch { /* defaults */ }
  const dryRun = body.dry_run !== false; // por omissão NÃO escreve
  const inspect = body.inspect === true;
  const mode = body.mode === "daily" ? "daily_edge" : "hourly_edge";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const startedAt = new Date();
  const jar = new Jar();
  const audit: Record<string, unknown> = { origem: "edge", dry_run: dryRun };

  const fail = async (motivo: string) => {
    if (!inspect) {
      await admin.from("onebox_sync_runs").insert({
        company_id: COMPANY_ID,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        status: "failed",
        mode,
        triggered_by: "edge",
        error_message: motivo,
        import_audit: audit,
      });
    }
    return json({ status: "failed", motivo, audit }, 200);
  };

  try {
    const csrf = await login(jar);
    audit.login = { ok: true, cookies: jar.names() };

    // ── charts do dashboard (nada cravado no código) ─────────────────────
    const charts = await apiGet(jar, `/api/v1/dashboard/${DASHBOARD_ID}/charts`);
    const slices: any[] = charts?.result ?? [];
    const filterState = await apiGet(
      jar,
      `/api/v1/dashboard/${DASHBOARD_ID}/filter_state/${FILTER_KEY}`,
    );
    let nativeFilters: any[] = [];
    try {
      const fs = JSON.parse(filterState?.value ?? "{}");
      for (const f of Object.values<any>(fs.filters ?? fs ?? {})) {
        const col = f?.extraFormData?.filters?.[0] ?? null;
        if (col) nativeFilters.push(col);
        else if (Array.isArray(f?.filters)) nativeFilters.push(...f.filters);
      }
    } catch { /* filtros ilegíveis → seguem vazios */ }

    if (inspect) {
      return json({
        charts: slices.map((s) => ({
          slice_name: s.slice_name,
          slice_id: s.form_data?.slice_id,
          viz: s.viz_type ?? s.form_data?.viz_type,
          datasource: s.form_data?.datasource,
          groupby: s.form_data?.groupby ?? s.form_data?.all_columns,
          metrics: s.form_data?.metrics,
          adhoc_filters: s.form_data?.adhoc_filters,
        })),
        native_filters: nativeFilters,
        filter_state_raw: filterState,
      });
    }

    const byName = (needle: string) =>
      slices.find((s) => (s.slice_name ?? "").toLowerCase().includes(needle.toLowerCase()));

    const grid = byName("Ventas por Sesion");
    if (!grid) throw new OneboxError("chart 'Ventas por Sesion' não encontrado no dashboard");
    const gridFd = grid.form_data;
    const datasource = gridFd.datasource;
    audit.charts_usados = {
      grelha: { slice_id: gridFd.slice_id, nome: grid.slice_name, datasource },
    };

    const baseFilters = [
      ...nativeFilters,
      ...(gridFd.adhoc_filters ?? []).filter((f: any) => f?.expressionType === "SIMPLE"),
    ];

    const mkPayload = (columns: any[], metrics: any[]) => ({
      datasource: {
        id: Number(String(datasource).split("__")[0]),
        type: String(datasource).split("__")[1] ?? "table",
      },
      force: false,
      result_format: "json",
      result_type: "full",
      queries: [{
        filters: baseFilters,
        extras: { having: "", where: "" },
        applied_time_extras: {},
        columns,
        metrics,
        annotation_layers: [],
        row_limit: 10000,
        series_limit: 0,
        order_desc: true,
        orderby: [],
        post_processing: [],
      }],
      form_data: { ...gridFd, dashboardId: DASHBOARD_ID },
    });

    const metrics = gridFd.metrics ?? [];
    const metricLabel = (m: any) => (typeof m === "string" ? m : m?.label ?? m?.aggregate ?? "");
    const qtyMetric = metrics.find((m: any) => /venta/i.test(metricLabel(m)));
    const facMetric = metrics.find((m: any) => /factur/i.test(metricLabel(m)));
    if (!qtyMetric || !facMetric) {
      throw new OneboxError(
        `métricas de entradas/facturación não identificadas: ${metrics.map(metricLabel).join(", ")}`,
      );
    }
    const QTY = metricLabel(qtyMetric);
    const FAC = metricLabel(facMetric);

    // ── leitura 1: grelha sessão × canal ────────────────────────────────
    const sessionCol = (gridFd.groupby ?? []).find((c: any) =>
      /sesion/i.test(typeof c === "string" ? c : c?.label ?? c?.sqlExpression ?? "")
    ) ?? {
      label: "sesion",
      expressionType: "SQL",
      sqlExpression: "nombresesion || ' ' || horariosesion_mi",
    };
    const channelCol = (gridFd.groupby ?? []).find((c: any) =>
      /canal/i.test(typeof c === "string" ? c : c?.label ?? c?.sqlExpression ?? "")
    ) ?? "nombrecanal";

    const gridRes = await chartData(
      jar,
      csrf,
      mkPayload([sessionCol, channelCol], [qtyMetric, facMetric]),
    );
    const gridRows: any[] = gridRes?.result?.[0]?.data ?? [];
    const sessionKey = typeof sessionCol === "string" ? sessionCol : sessionCol.label;
    const channelKey = typeof channelCol === "string" ? channelCol : channelCol.label;

    // ── leitura 2: série por data de compra ─────────────────────────────
    const dateCol = {
      label: "fecha_compra",
      expressionType: "SQL",
      sqlExpression: "to_char(fechahoracompra,'YYYY-MM-DD')",
    };
    const dailyRes = await chartData(
      jar,
      csrf,
      mkPayload([dateCol], [qtyMetric, facMetric]),
    );
    const dailyRows: any[] = dailyRes?.result?.[0]?.data ?? [];

    // ── leitura 3: resumo do painel ─────────────────────────────────────
    const sumRes = await chartData(jar, csrf, mkPayload([], [qtyMetric, facMetric]));
    const sumRow = sumRes?.result?.[0]?.data?.[0] ?? {};

    const num = (v: unknown) => Number(v ?? 0) || 0;
    const gridQty = gridRows.reduce((a, r) => a + num(r[QTY]), 0);
    const gridFac = gridRows.reduce((a, r) => a + num(r[FAC]), 0);
    const dailyQty = dailyRows.reduce((a, r) => a + num(r[QTY]), 0);
    const dailyFac = dailyRows.reduce((a, r) => a + num(r[FAC]), 0);
    const sumQty = num(sumRow[QTY]);
    const sumFac = num(sumRow[FAC]);

    audit.conferencia = {
      grelha: { entradas: gridQty, facturacion: round2(gridFac), linhas: gridRows.length },
      serie_diaria: { entradas: dailyQty, facturacion: round2(dailyFac), dias: dailyRows.length },
      resumo: { entradas: sumQty, facturacion: round2(sumFac) },
    };

    const ok = gridQty === dailyQty && gridQty === sumQty &&
      cents(gridFac) === cents(dailyFac) && cents(gridFac) === cents(sumFac);
    audit.conferencia_bateu = ok;
    if (!ok) {
      return await fail(
        `conferência tripla não bate: grelha ${gridQty}/${round2(gridFac)}, série ${dailyQty}/${
          round2(dailyFac)
        }, resumo ${sumQty}/${round2(sumFac)}`,
      );
    }

    // ── mapear sessões → zonas do ERP ───────────────────────────────────
    const { data: zones, error: zErr } = await admin
      .from("event_ticket_zones")
      .select("id, name")
      .eq("event_id", EVENT_ID);
    if (zErr) throw new OneboxError(`zonas: ${zErr.message}`);
    const zoneByName = new Map<string, string>(
      (zones ?? []).map((z: any) => [String(z.name).trim(), z.id]),
    );

    // nome da sessão da Onebox → 'DD/MM/AAAA HH:MM'
    const zoneNameOf = (raw: string): string | null => {
      const m = String(raw).match(/(\d{2})[/-](\d{2})[/-](\d{4}).*?(\d{2})[:h](\d{2})/);
      if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
      const iso = String(raw).match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{2}):(\d{2})/);
      if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} ${iso[4]}:${iso[5]}`;
      return null;
    };

    const { data: lots, error: lErr } = await admin
      .from("event_ticket_lots")
      .select("id, zone_id, name")
      .in("zone_id", (zones ?? []).map((z: any) => z.id));
    if (lErr) throw new OneboxError(`lotes: ${lErr.message}`);
    const lotByZone = new Map<string, string>();
    for (const l of lots ?? []) if (!lotByZone.has(l.zone_id)) lotByZone.set(l.zone_id, l.id);

    const today = new Date().toISOString().slice(0, 10);
    const linhas: any[] = [];
    const sessoesSemZona: string[] = [];
    const zonasSemLote: string[] = [];
    const ignoradasZeroEntradas: string[] = [];

    for (const r of gridRows) {
      const qty = num(r[QTY]);
      const fac = round2(num(r[FAC]));
      const rawSession = String(r[sessionKey] ?? "");
      const canal = String(r[channelKey] ?? "").trim();
      if (qty === 0) {
        ignoradasZeroEntradas.push(`${rawSession} / ${canal}`);
        continue;
      }
      const zName = zoneNameOf(rawSession);
      const zoneId = zName ? zoneByName.get(zName) : undefined;
      if (!zoneId) {
        sessoesSemZona.push(rawSession);
        continue;
      }
      const lotId = lotByZone.get(zoneId) ?? null;
      if (!lotId) zonasSemLote.push(zName!);
      linhas.push({
        zone_id: zoneId,
        zone_name: zName,
        lot_id: lotId,
        sale_date: today,
        quantity: qty,
        unit_price: round2(fac / qty),
        total_value: fac,
        notes: `Onebox • ${canal}`,
        source: SOURCE,
        created_by: "onebox_sync",
        financial_account_id: ECI_ACCOUNT_ID,
        company_id: COMPANY_ID,
      });
    }

    const serie = dailyRows
      .map((r) => ({
        sale_date: String(r["fecha_compra"] ?? r[Object.keys(r)[0]] ?? "").slice(0, 10),
        quantity: num(r[QTY]),
        total_value: round2(num(r[FAC])),
      }))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.sale_date))
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date));

    audit.acumulado = {
      linhas: linhas.length,
      entradas: linhas.reduce((a, l) => a + l.quantity, 0),
      facturacion: round2(linhas.reduce((a, l) => a + l.total_value, 0)),
    };
    audit.serie_diaria_dias = serie.length;
    audit.sessoes_sem_zona = sessoesSemZona;
    audit.zonas_sem_lote = zonasSemLote;
    audit.ignoradas_zero_entradas = ignoradasZeroEntradas;

    if (sessoesSemZona.length > 0) {
      return await fail(
        `sessões da Onebox sem zona no ERP (não se cria nada): ${sessoesSemZona.join(", ")}`,
      );
    }
    if (zonasSemLote.length > 0) {
      return await fail(
        `zonas sem lote (precisa de lote com iva_rate=${IVA_RATE}): ${zonasSemLote.join(", ")}`,
      );
    }

    // invariante: soma da série = acumulado
    const invOk = cents(serie.reduce((a, d) => a + d.total_value, 0)) ===
        cents(linhas.reduce((a, l) => a + l.total_value, 0)) &&
      serie.reduce((a, d) => a + d.quantity, 0) === linhas.reduce((a, l) => a + l.quantity, 0);
    audit.invariante_serie_igual_acumulado = invOk;
    if (!invOk) return await fail("série diária não iguala o acumulado a escrever");

    const resultado = {
      status: dryRun ? "dry_run" : "success",
      mode,
      total_entradas: audit.acumulado,
      conferencia: audit.conferencia,
      charts_usados: audit.charts_usados,
      por_sessao: Object.values(
        linhas.reduce((acc: any, l) => {
          acc[l.zone_name] ??= { sessao: l.zone_name, entradas: 0, facturacion: 0, canais: [] };
          acc[l.zone_name].entradas += l.quantity;
          acc[l.zone_name].facturacion = round2(acc[l.zone_name].facturacion + l.total_value);
          acc[l.zone_name].canais.push(`${l.notes.replace("Onebox • ", "")}: ${l.quantity}`);
          return acc;
        }, {}),
      ),
      serie_diaria: serie,
    };

    if (dryRun) {
      await admin.from("onebox_sync_runs").insert({
        company_id: COMPANY_ID,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        status: "dry_run",
        mode,
        triggered_by: "edge",
        import_audit: audit,
      });
      return json(resultado);
    }

    // ── escrita: substituir o acumulado ─────────────────────────────────
    const zoneIds = (zones ?? []).map((z: any) => z.id);
    const { error: dErr } = await admin
      .from("ticket_sales")
      .delete()
      .eq("source", SOURCE)
      .in("zone_id", zoneIds);
    if (dErr) throw new OneboxError(`delete acumulado: ${dErr.message}`);
    const { error: iErr } = await admin.from("ticket_sales").insert(
      linhas.map(({ zone_name: _z, ...row }) => row),
    );
    if (iErr) throw new OneboxError(`insert acumulado: ${iErr.message}`);

    const { error: upErr } = await admin.from("onebox_daily_sales").upsert(
      serie.map((d) => ({ ...d, event_id: EVENT_ID, company_id: COMPANY_ID })),
      { onConflict: "event_id,sale_date" },
    );
    if (upErr) throw new OneboxError(`upsert série diária: ${upErr.message}`);

    await admin.from("onebox_sync_runs").insert({
      company_id: COMPANY_ID,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      status: "success",
      mode,
      triggered_by: "edge",
      import_audit: audit,
    });
    return json(resultado);
  } catch (e) {
    const msg = e instanceof OneboxError
      ? e.message
      : `erro inesperado: ${(e as Error)?.message ?? e}`;
    return await fail(msg);
  }
});
