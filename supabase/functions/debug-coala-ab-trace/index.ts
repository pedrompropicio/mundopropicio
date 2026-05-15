// debug-coala-ab-trace
// Baixa o XLSX da Coala do Drive e devolve TODAS as linhas da aba "Base Custos"
// cujo CC, Centro de Custo, Descrição ou Nome Empresa contém termos A&B.
// Service-role only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { parseCoalaXlsx, EXCLUDED_CC } from "../_shared/coalaParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const norm = (s: any): string =>
  String(s ?? "")
    .normalize("NFKC").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const num = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

async function getDriveAccessToken(): Promise<string> {
  for (const [a, b, c] of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN"],
    ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REFRESH_TOKEN"],
  ]) {
    const id = Deno.env.get(a), sec = Deno.env.get(b), rt = Deno.env.get(c);
    if (!id || !sec || !rt) continue;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: sec, refresh_token: rt, grant_type: "refresh_token" }),
    });
    const j = await r.json();
    if (r.ok && j?.access_token) return j.access_token;
  }
  throw new Error("Sem secrets Google Drive");
}

async function dl(fileId: string, tok: string): Promise<ArrayBuffer> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (r.ok) return r.arrayBuffer();
  const exp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
    { headers: { Authorization: `Bearer ${tok}` } },
  );
  if (!exp.ok) throw new Error(`Drive ${exp.status}`);
  return exp.arrayBuffer();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { configId } = await req.json().catch(() => ({}));
    if (!configId) return json({ error: "configId obrigatório" }, 400);

    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, svc);
    const { data: cfg, error } = await sb.from("coala_sync_config").select("drive_file_id, file_version").eq("id", configId).single();
    if (error || !cfg) return json({ error: "config não encontrada" }, 404);

    const tok = await getDriveAccessToken();
    const buf = await dl(cfg.drive_file_id, tok);

    // Raw scan
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames.find((n) => norm(n) === "base custos")!;
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
    const headers = matrix[1] || [];
    const idx = (label: string) => headers.findIndex((h: any) => norm(h) === norm(label));
    const C = {
      ccBase: idx("CC base"),
      centroCusto: idx("Centro Custo"),
      descricao: idx("Descrição"),
      valorNet: idx("Valor Total s/ IVA"),
      nomeEmpresa: idx("Nome Empresa"),
    };

    // Termos A&B candidatos
    const KEYWORDS = ["bebida", "alimento", "a&b", " bar", "bar ", "repasse", "f&b", "alimentos", "bebidas", "comida", "drink"];
    const hits: any[] = [];
    let totalNetAll = 0;
    let abCandidateNet = 0;

    for (let r = 2; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row) continue;
      const cc = String(row[C.ccBase] ?? "");
      const cCusto = String(row[C.centroCusto] ?? "");
      const desc = String(row[C.descricao] ?? "");
      const sup = String(row[C.nomeEmpresa] ?? "");
      const net = num(row[C.valorNet]);
      if (net > 0) totalNetAll += net;

      const blob = norm([cc, cCusto, desc, sup].join(" | "));
      if (!KEYWORDS.some((k) => blob.includes(k))) continue;

      const ccN = norm(cc);
      const cCustoN = norm(cCusto);
      const excludedByParser = EXCLUDED_CC.includes(ccN) || EXCLUDED_CC.includes(cCustoN);
      if (!excludedByParser && net > 0) abCandidateNet += net;

      hits.push({
        rowNumber: r + 1,
        cc, cCusto, descricao: desc, supplier: sup,
        net: +net.toFixed(2),
        ccNorm: ccN, cCustoNorm: cCustoN,
        excludedByParser,
        excludeMatch: excludedByParser ? (EXCLUDED_CC.includes(ccN) ? `cc='${ccN}'` : `cCusto='${cCustoN}'`) : null,
      });
    }

    // Run parser oficial p/ totals confirmados
    const parsed = parseCoalaXlsx(buf, cfg.file_version || "debug");

    return json({
      ok: true,
      EXCLUDED_CC,
      sheet: sheetName,
      totals: {
        rawNetAllRows: +totalNetAll.toFixed(2),
        parserNetSum: parsed.totals.netSum,
        parserExcludedLines: parsed.totals.excludedLines,
        abHitsTotal: hits.length,
        abHitsExcluded: hits.filter(h => h.excludedByParser).length,
        abHitsNotExcluded: hits.filter(h => !h.excludedByParser).length,
        abHitsNotExcludedNetSum: +abCandidateNet.toFixed(2),
      },
      hits,
    });
  } catch (e) {
    return json({ error: (e as Error).message, stack: (e as Error).stack }, 500);
  }
});
