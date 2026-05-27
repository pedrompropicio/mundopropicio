// crm-meta-creatives-rehost — back-fill one-shot (invocação manual).
//
// Re-hospeda no bucket próprio os criativos cujo name contém um dos filtros
// (default: simone/ivete/anitta — eventos vivos, ~47). Usa a lógica partilhada
// rehostCreative (ver _shared/rehost-creative.ts) para que o comportamento seja
// idêntico ao re-host automático do sync.
//
// POST { name_filters?: string[], dry_run?: boolean, limit?: number }
// - dry_run=true: só conta e lista (confirmar a contagem antes de processar).
// - limit: tecto de segurança de rows a processar (default 500).
//
// Auth: JWT de utilizador. A company é resolvida server-side
// (authenticateAndResolveCompany) — não aceita company_id do cliente.

import {
  authenticateAndResolveCompany,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/multiTenant.ts";
import { isAlreadyStable, REHOST_BUCKET, rehostCreative } from "../_shared/rehost-creative.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const OLD_PROJECT_REF = "sfohvvlqccmmebvjgibx"; // projeto Supabase ANTIGO (criativos órfãos)
const DEFAULT_FILTERS = ["simone", "ivete", "anitta"];

// Limpa chars que partiriam a sintaxe do filtro .or() do PostgREST.
function sanitizeFilter(f: string): string {
  return f.replace(/[,()*%]/g, "").trim().toLowerCase();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const { callerCompanyId, adminClient } = await authenticateAndResolveCompany(req);
    if (!callerCompanyId) return jsonResponse({ error: "no_active_company" }, 403);

    let body: { name_filters?: string[]; dry_run?: boolean; limit?: number } = {};
    try { body = await req.json(); } catch { /* corpo vazio = defaults */ }

    const filters = (Array.isArray(body.name_filters) && body.name_filters.length > 0
      ? body.name_filters
      : DEFAULT_FILTERS
    ).map(sanitizeFilter).filter(Boolean);
    if (filters.length === 0) return jsonResponse({ error: "no_valid_filters" }, 400);

    const dryRun = body.dry_run === true;
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 2000);

    const orExpr = filters.map((f) => `name.ilike.*${f}*`).join(",");
    const { data: rows, error: qErr } = await (adminClient as any)
      .schema("crm")
      .from("meta_creatives")
      .select("id, meta_creative_id, name, type, file_url, storage_path")
      .eq("company_id", callerCompanyId)
      .or(orExpr)
      .limit(limit);
    if (qErr) return jsonResponse({ error: "query_failed", detail: qErr.message }, 500);

    const matched = rows?.length ?? 0;
    const orphans = (rows ?? [])
      .filter((r: any) => typeof r.file_url === "string" && r.file_url.includes(OLD_PROJECT_REF))
      .map((r: any) => ({ id: r.id, name: r.name }));

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        filters,
        matched,
        already_stable: (rows ?? []).filter((r: any) => isAlreadyStable(r.file_url, SUPABASE_URL)).length,
        orphans_old_project: orphans,
        sample: (rows ?? []).slice(0, 50).map((r: any) => ({ id: r.id, name: r.name, type: r.type })),
      });
    }

    let rehosted = 0;
    let skipped = 0;
    const failed: { id: string; name: string; reason: string }[] = [];

    for (const r of rows ?? []) {
      const res = await rehostCreative(
        adminClient,
        {
          company_id: callerCompanyId,
          path_key: r.meta_creative_id ?? r.id,
          type: r.type,
          file_url: r.file_url,
        },
        { supabaseUrl: SUPABASE_URL },
      );

      if (res.status === "skipped") { skipped++; continue; }
      if (res.status === "failed") {
        failed.push({ id: r.id, name: r.name, reason: res.reason ?? "unknown" });
        continue;
      }

      // rehosted → persistir o URL estável.
      const upd: Record<string, unknown> = {
        file_url: res.file_url,
        storage_bucket: REHOST_BUCKET,
        storage_path: res.storage_path,
        updated_at: new Date().toISOString(),
      };
      // file_mime_type descreve o ficheiro do criativo; para vídeo o ficheiro
      // continua na Meta (só re-hospedámos o poster) — não o sobrescrevemos.
      if (r.type !== "video" && res.mime) upd.file_mime_type = res.mime;

      const { error: uErr } = await (adminClient as any)
        .schema("crm").from("meta_creatives").update(upd).eq("id", r.id);
      if (uErr) {
        failed.push({ id: r.id, name: r.name, reason: `db_update: ${uErr.message}` });
        continue;
      }
      rehosted++;
    }

    return jsonResponse({
      filters,
      matched,
      rehosted,
      skipped,
      failed_count: failed.length,
      failed,
      orphans_old_project: orphans,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
