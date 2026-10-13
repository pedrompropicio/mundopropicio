// dbip-city-sync (D-ERP263) — carrega a DB-IP Lite City (CC BY 4.0, "IP geolocation by DB-IP",
// https://db-ip.com) para public.ip_city_ranges, só BR e PT (IPv4+IPv6).
// verify_jwt=true; só service_role. Gunzip em streaming, filtro linha a linha, lotes de 2.000.
// Partes: cada chamada trata até PART_LINES linhas a partir de start_line (retoma por LINHA;
// o gzip não se retoma a meio, por isso cada parte volta a descomprimir desde o início e só
// conta as linhas anteriores sem as interpretar). No fim de uma parte chama-se a si própria
// com o start_line seguinte. A última parte faz a troca atómica (ip_city_ranges_swap).
// Corpo: {} → mês corrente (ou anterior se 404); {month:"YYYY-MM", start_line, run_id}.
import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

const FN = "dbip-city-sync";
const PART_LINES = 2_000_000;
const BATCH = 2000;
const WALL_BUDGET_MS = 110_000;
const url = (m: string) => `https://download.db-ip.com/free/dbip-city-lite-${m}.csv.gz`;

function ym(d: Date) { return d.toISOString().slice(0, 7); }

// CSV: ip_start,ip_end,continent,country,stateprov,city,lat,lon (campos com aspas possíveis)
function parseCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!(await isServiceRoleRequest(req))) return json({ ok: false, error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const t0 = Date.now();
  const startLine = Math.max(0, Number(body?.start_line) || 0);

  // mês: o pedido, senão o corrente, senão o anterior
  let month: string | null = /^\d{4}-\d{2}$/.test(body?.month ?? "") ? body.month : null;
  let res: Response | null = null;
  const tries = month ? [month] : [ym(new Date()), ym(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)))];
  for (const m of tries) {
    const r = await fetch(url(m));
    if (r.ok && r.body) { month = m; res = r; break; }
    await r.body?.cancel();
  }
  const sourceMonth = month ? `${month}-01` : null;

  let runId: string | null = body?.run_id ?? null;
  const runStarted = Number(body?.run_started) || t0;
  if (!runId) {
    runId = await startSyncRun(admin, { function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: false });
  }
  if (!res || !sourceMonth) {
    await finishSyncRun(admin, runId, runStarted, { status: "error", rows_written: 0, details: { error: "ficheiro_indisponivel", tried: tries } });
    return json({ ok: false, error: "ficheiro_indisponivel", tried: tries }, 502);
  }
  if (startLine === 0) await admin.rpc("ip_city_ranges_clear_month", { _month: sourceMonth });

  const reader = res.body!.pipeThrough(new DecompressionStream("gzip")).getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let carry = ""; let pos = 0; let written = 0 + (Number(body?.rows_so_far) || 0); let partRows = 0;
  let buf: Record<string, unknown>[] = []; let eof = false; let stoppedAt: number | null = null;
  const flush = async () => {
    if (!buf.length) return;
    const { error } = await admin.from("ip_city_ranges").insert(buf);
    if (error) throw new Error(`insert: ${error.message}`);
    written += buf.length; partRows += buf.length; buf = [];
  };
  const take = (line: string) => {
    const f = parseCsv(line);
    if (f[3] === "BR" || f[3] === "PT") {
      buf.push({ ip_from: f[0], ip_to: f[1], country: f[3], region: f[4] || null, city: f[5] || null, source_month: sourceMonth });
    }
  };
  // Só procura os marcadores ",SA,BR," / ",EU,PT," (indexOf nativo); não parte o texto todo em linhas.
  const scan = (text: string) => {
    for (const mk of [",SA,BR,", ",EU,PT,"]) {
      let i = text.indexOf(mk);
      while (i !== -1) {
        const a = text.lastIndexOf("\n", i) + 1; let b = text.indexOf("\n", i); if (b === -1) b = text.length;
        take(text.slice(a, b));
        i = text.indexOf(mk, b);
      }
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { eof = true; break; }
      const chunkStart = pos; pos += value.length;
      // Antes do start_byte: só descomprime, não descodifica nem procura.
      if (pos <= startLine) continue;
      const sub = chunkStart < startLine ? value.subarray(startLine - chunkStart) : value;
      const text = carry + dec.decode(sub, { stream: true });
      const nl = text.lastIndexOf("\n");
      if (nl === -1) { carry = text; continue; }
      carry = text.slice(nl + 1);
      scan(text.slice(0, nl));
      if (buf.length >= BATCH) await flush();
      if (pos - startLine >= PART_BYTES || Date.now() - t0 > WALL_BUDGET_MS) {
        stoppedAt = pos - enc.encode(carry).length; break; // início exacto da linha seguinte
      }
    }
    if (eof && carry) take(carry);
    await flush();
  } catch (e) {
    await reader.cancel().catch(() => {});
    await finishSyncRun(admin, runId, runStarted, { status: "error", rows_written: written, details: { error: String(e).slice(0, 300), month, start_byte: startLine, byte: pos } });
    return json({ ok: false, error: String(e).slice(0, 300), month, byte: pos }, 500);
  }
  const lineNo = pos;

  if (!eof && stoppedAt != null) {
    await reader.cancel().catch(() => {});
    const next = { month, start_line: stoppedAt, run_id: runId, run_started: runStarted, rows_so_far: written };
    const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const p = fetch(self, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => r.body?.cancel()).catch((e) => console.warn(`[${FN}] encadear falhou`, String(e)));
    // deno-lint-ignore no-explicit-any
    const ER = (globalThis as any).EdgeRuntime; if (ER) ER.waitUntil(p);
    console.log(`[${FN}] parte ${month} linhas ${startLine}..${stoppedAt} +${partRows} (total ${written}) em ${Date.now() - t0} ms`);
    return json({ ok: true, partial: true, month, start_line: startLine, next_line: stoppedAt, part_rows: partRows, rows_so_far: written });
  }

  const { data: removed } = await admin.rpc("ip_city_ranges_swap", { _month: sourceMonth });
  const { count } = await admin.from("ip_city_ranges").select("*", { count: "exact", head: true }).eq("source_month", sourceMonth);
  await finishSyncRun(admin, runId, runStarted, {
    status: count ? "success" : "no_data", rows_written: count ?? written,
    details: { month, lines: lineNo, rows: count, removed_old: removed, attribution: "IP geolocation by DB-IP (https://db-ip.com)" },
  });
  console.log(`[${FN}] concluído ${month}: ${count} ranges, ${lineNo} linhas, troca removeu ${removed}`);
  return json({ ok: true, month, lines: lineNo, rows: count, removed_old: removed });
});
