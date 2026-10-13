// dbip-city-sync (D-ERP263) — carrega a DB-IP Lite City (CC BY 4.0, "IP geolocation by DB-IP",
// https://db-ip.com) para public.ip_city_ranges, só BR e PT (IPv4+IPv6).
// verify_jwt=true; só service_role.
//
// Partes (o limite de CPU de ~2 s por pedido não chega para descomprimir 693 MB de uma vez):
// cada parte pede por HTTP Range só o pedaço comprimido de que precisa e descomprime ~24 MB com um
// inflate próprio (inflate.ts), retomável em fronteira de bloco DEFLATE: estado = {c_off, bit,
// janela de 32 KB, resto de linha}. Filtra BR/PT linha a linha, grava em lotes, e chama-se a si
// própria com o estado seguinte. A última parte faz a troca atómica (ip_city_ranges_swap).
// Corpo: {} → mês corrente (ou anterior se 404); {month:"YYYY-MM"} força o mês.
import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { gzipHeaderLen, inflatePart, NeedMoreInput } from "./inflate.ts";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";

const FN = "dbip-city-sync";
const TARGET = 8 << 20;       // bytes descomprimidos por parte
const SLICE = 6 << 20;        // bytes comprimidos pedidos por parte (cresce se não chegar)
const SAFE_END = 1 << 20;     // não começa um bloco a menos de 1 MB do fim do pedaço
const BATCH = 2000;
const MAX_PARTS = 300;
const url = (m: string) => `https://download.db-ip.com/free/dbip-city-lite-${m}.csv.gz`;
const ym = (d: Date) => d.toISOString().slice(0, 7);

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

async function range(u: string, from: number, len: number): Promise<{ buf: Uint8Array; total: number }> {
  const r = await fetch(u, { headers: { Range: `bytes=${from}-${from + len - 1}` } });
  if (r.status !== 206 && r.status !== 200) { await r.body?.cancel(); throw new Error(`range ${r.status}`); }
  const total = Number((r.headers.get("content-range") ?? "").split("/")[1]) || Number(r.headers.get("content-length"));
  return { buf: new Uint8Array(await r.arrayBuffer()), total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!(await isServiceRoleRequest(req))) return json({ ok: false, error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const t0 = Date.now();
  const st = body?.state ?? null; // estado da parte anterior

  let month: string | null = /^\d{4}-\d{2}$/.test(body?.month ?? "") ? body.month : null;
  const tries = month ? [month] : [ym(new Date()), ym(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)))];
  if (!st) {
    month = null;
    for (const m of tries) {
      const r = await fetch(url(m), { method: "HEAD" });
      if (r.ok) { month = m; break; }
    }
  }
  const runId: string | null = st?.run_id ?? await startSyncRun(admin, { function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: false });
  const runStarted = Number(st?.run_started) || t0;
  if (!month) {
    await finishSyncRun(admin, runId, runStarted, { status: "error", rows_written: 0, details: { error: "ficheiro_indisponivel", tried: tries } });
    return json({ ok: false, error: "ficheiro_indisponivel", tried: tries }, 502);
  }
  const sourceMonth = `${month}-01`;
  const part = Number(st?.part) || 0;
  let written = Number(st?.rows) || 0;
  const fail = async (e: unknown) => {
    await finishSyncRun(admin, runId, runStarted, { status: "error", rows_written: written, details: { error: String(e).slice(0, 300), month, part } });
    return json({ ok: false, error: String(e).slice(0, 300), month, part }, 500);
  };

  try {
    let cOff: number; let bit: number; let win: Uint8Array; let carry: string;
    if (!st) {
      await admin.rpc("ip_city_ranges_clear_month", { _month: sourceMonth });
      const h = await range(url(month), 0, 64);
      cOff = gzipHeaderLen(h.buf); bit = 0; win = new Uint8Array(0); carry = "";
    } else {
      cOff = st.c_off; bit = st.bit; win = decodeBase64(st.window); carry = st.carry ?? "";
    }

    // pedaço comprimido; se o bloco não couber, pede o dobro
    let slice = SLICE; let r; let total = 0;
    for (;;) {
      const g = await range(url(month), cOff, slice); total = g.total;
      const eof = cOff + g.buf.length >= total;
      try { r = inflatePart(g.buf, bit, win, TARGET, SAFE_END, eof); break; } catch (e) {
        if (e instanceof NeedMoreInput && !eof && slice < (64 << 20)) { slice *= 2; continue; }
        throw e;
      }
    }

    const text = carry + new TextDecoder().decode(r.out, { stream: !r.done });
    const nl = r.done ? text.length : text.lastIndexOf("\n");
    const body2 = nl === -1 ? "" : text.slice(0, nl);
    const nextCarry = nl === -1 ? text : text.slice(nl + 1);
    let rows: Record<string, unknown>[] = [];
    for (const mk of [",SA,BR,", ",EU,PT,"]) {
      let i = body2.indexOf(mk);
      while (i !== -1) {
        const a = body2.lastIndexOf("\n", i) + 1; let b = body2.indexOf("\n", i); if (b === -1) b = body2.length;
        const f = parseCsv(body2.slice(a, b).replace(/\r$/, ""));
        if (f[3] === "BR" || f[3] === "PT") rows.push({ ip_from: f[0], ip_to: f[1], country: f[3], region: f[4] || null, city: f[5] || null, lat: f[6] ? Number(f[6]) : null, lon: f[7] ? Number(f[7]) : null, source_month: sourceMonth });
        i = body2.indexOf(mk, b);
      }
    }
    for (let k = 0; k < rows.length; k += BATCH) {
      const { error } = await admin.from("ip_city_ranges").insert(rows.slice(k, k + BATCH));
      if (error) throw new Error(`insert: ${error.message}`);
    }
    written += rows.length; const partRows = rows.length; rows = [];

    if (!r.done) {
      if (part + 1 >= MAX_PARTS) throw new Error("max_parts");
      const state = {
        run_id: runId, run_started: runStarted, part: part + 1, rows: written,
        c_off: cOff + (r.bit >>> 3), bit: r.bit & 7, window: encodeBase64(r.window), carry: nextCarry,
      };
      const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const p = fetch(self, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ month, state }) })
        .then((x) => x.body?.cancel()).catch((e) => console.warn(`[${FN}] encadear falhou`, String(e)));
      // deno-lint-ignore no-explicit-any
      const ER = (globalThis as any).EdgeRuntime; if (ER) ER.waitUntil(p);
      console.log(`[${FN}] parte ${part} ${month} c_off ${cOff}/${total} +${partRows} (total ${written}) em ${Date.now() - t0} ms`);
      return json({ ok: true, partial: true, month, part, part_rows: partRows, rows_so_far: written });
    }
  } catch (e) {
    return await fail(e);
  }

  const { data: removed } = await admin.rpc("ip_city_ranges_swap", { _month: sourceMonth });
  const { count } = await admin.from("ip_city_ranges").select("*", { count: "exact", head: true }).eq("source_month", sourceMonth);
  await finishSyncRun(admin, runId, runStarted, {
    status: count ? "success" : "no_data", rows_written: count ?? written,
    details: { month, parts: part + 1, rows: count, removed_old: removed, attribution: "IP geolocation by DB-IP (https://db-ip.com)" },
  });
  console.log(`[${FN}] concluído ${month}: ${count} ranges em ${part + 1} partes; troca removeu ${removed}`);
  return json({ ok: true, month, parts: part + 1, rows: count, removed_old: removed });
});
