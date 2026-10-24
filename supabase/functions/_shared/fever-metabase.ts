// Partilhado entre fetch-fever-reports (API server-side) e fever-ingest-browser (JWT via bookmarklet).
// Download dos XLSX do Metabase embedded + parser + importador.
import { parseFeverXlsxBuffers, groupFeverLots } from "./fever-parser.ts";
import { runFeverImport } from "./fever-import-server.ts";

export const FEVER_CLIENT_VERSION_FALLBACK = "w.12.1.0";
export const FEVER_APPLICATION_ID = "84a4434b-d722-47dd-a247-9a073055e023";

export const METABASE_PARAMS = encodeURIComponent(JSON.stringify({
  purchase_date: null,
  event_date: null,
  granularity: ["Day"],
  tag: null,
  ticket_type: ["Exclude add-ons"],
  purchase_channel: null,
}));

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export interface DownloadedXlsx { label: string; filename: string; bytes: Uint8Array }

/** Baixa os 2 XLSX do Metabase embedded com o JWT dado. Valida magic bytes PK. */
export async function downloadFeverXlsx(cfg: any, metabaseJwt: string): Promise<DownloadedXlsx[]> {
  const cards = [
    { dashcard: cfg.card_sales_dashcard, card: cfg.card_sales_card, label: "sales_per_ticket_type", filename: "sales_per_ticket_type_and_ticket_price.xlsx" },
    { dashcard: cfg.card_tickets_dashcard, card: cfg.card_tickets_card, label: "tickets_per_purchase_date", filename: "tickets_per_ticket_type_and_purchase_date.xlsx" },
  ];
  const downloaded: DownloadedXlsx[] = [];
  for (const c of cards) {
    const xlsxUrl = `https://feverzone.metabaseapp.com/api/embed/dashboard/${metabaseJwt}/dashcard/${c.dashcard}/card/${c.card}/xlsx?parameters=${METABASE_PARAMS}&format_rows=true&pivot_results=false`;
    const r = await fetchWithTimeout(xlsxUrl, { headers: { "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }, 45000);
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      const expired = r.status === 401 || r.status === 403;
      throw Object.assign(
        new Error(expired
          ? "JWT do Metabase expirou — voltar ao FeverZone e clicar outra vez no bookmarklet."
          : `XLSX ${c.label} ${r.status}: ${text}`),
        { phase: expired ? "metabase_jwt_expired" : `xlsx_${c.label}_http_${r.status}` },
      );
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw Object.assign(new Error(`XLSX ${c.label} inválido (size=${buf.length}, magic=${buf[0]?.toString(16)} ${buf[1]?.toString(16)})`), { phase: `xlsx_${c.label}_invalid_magic` });
    }
    downloaded.push({ label: c.label, filename: c.filename, bytes: buf });
    console.log(`[fever-metabase] ${c.label} ok size=${buf.length}`);
  }
  return downloaded;
}

/** Parser + conta financeira Fever + importador. Devolve auditoria e ficheiros. */
export async function runFeverPipeline(opts: {
  admin: any;
  cfg: any;
  downloaded: DownloadedXlsx[];
  triggeredBy?: string | null;
}): Promise<{ filesAudit: any[]; audit: any }> {
  const { admin, cfg, downloaded, triggeredBy } = opts;
  const salesXlsx = downloaded.find(d => d.label === "tickets_per_purchase_date")!;
  const pricesXlsx = downloaded.find(d => d.label === "sales_per_ticket_type")!;
  const filesAudit = [
    { name: salesXlsx.filename, size: salesXlsx.bytes.length, sheet_name: "sales" },
    { name: pricesXlsx.filename, size: pricesXlsx.bytes.length, sheet_name: "prices" },
  ];

  let parseResult: any, grouped: any;
  try {
    parseResult = parseFeverXlsxBuffers(salesXlsx.bytes.buffer, pricesXlsx.bytes.buffer);
    console.log(`[fever-metabase] parsed: lots=${parseResult.lots.length} sales=${parseResult.sales.length} qty=${parseResult.totals.totalQty} gross=${parseResult.totals.totalGross} warns=${parseResult.warnings.length}`);
    grouped = groupFeverLots(parseResult.lots);
  } catch (e: any) {
    throw Object.assign(new Error(`Parser: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
  }

  const { data: feverAcc } = await admin.from("financial_accounts")
    .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
    .ilike("name", "%fever%").limit(1).maybeSingle();
  if (!feverAcc) {
    throw Object.assign(new Error("Conta financeira Fever não encontrada"), { phase: "import_failed", filesAudit });
  }

  let audit: any;
  try {
    audit = await runFeverImport({
      supabase: admin, eventId: cfg.event_id, feverAccountId: feverAcc.id,
      parseResult, grouped, filenames: { sales: salesXlsx.filename, prices: pricesXlsx.filename },
      triggeredBy: triggeredBy || null,
    });
  } catch (e: any) {
    throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
  }

  return { filesAudit, audit };
}
