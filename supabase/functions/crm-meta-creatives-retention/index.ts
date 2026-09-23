// crm-meta-creatives-retention — retenção dos ficheiros do bucket crm-meta-creatives (#209).
//
// Body: { dry_run: boolean, days?: number = 183, max_files?: number = 500 }
//   max_delete é aceite como sinónimo de max_files (compat. com o cron de 20/09).
//   days = 183 (≈6 meses) é a regra decidida a 23/09/2026 para a classe A.
// Auth: service_role apenas (cron-callable). Sem JWT de utilizador.
//
// Classes, por esta ordem:
//  A) Criativo com anúncio cuja campanha tem linked_event_id: data final do evento
//     (max(events.date) do evento e dos sub-eventos) < hoje − days E nenhum anúncio
//     do criativo com effective_status='ACTIVE' → apaga o FICHEIRO (API de storage,
//     nunca DELETE em storage.objects) e limpa storage_path/file_url/file_size_bytes.
//     A linha e os metadados (meta_creative_id, image_hash, video_id, análise) ficam.
//  B) Ficheiro sem linha correspondente:
//       - stem não é meta_creative_id de linha nenhuma → órfão → apagar;
//       - stem é meta_creative_id de uma linha cujo storage_path é outro caminho:
//           * se esse outro ficheiro existe no bucket → duplicado → apagar;
//           * se NÃO existe → é a única cópia → apontar storage_path/file_url para
//             este ficheiro e registar (nunca apagar).
//  C) Criativo com anúncio mas campanha SEM linked_event_id → NÃO apaga. Só lista,
//     agrupado por empresa e campanha, para expurgo manual.
//
// Nunca apaga ficheiro de criativo com anúncio ACTIVE. Nunca apaga mais de max_delete
// por corrida. Erros por ficheiro vão para errors[] e a corrida continua.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUCKET = "crm-meta-creatives";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAGE = 1000;
const SAMPLE_MAX = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type FileEntry = { path: string; folder: string; stem: string; size: number };

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// deno-lint-ignore no-explicit-any
async function listAllFiles(admin: any, errors: unknown[]): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const { data: top, error: topErr } = await admin.storage.from(BUCKET).list("", {
    limit: PAGE,
    sortBy: { column: "name", order: "asc" },
  });
  if (topErr) {
    errors.push({ scope: "list_root", detail: topErr.message });
    return out;
  }
  const folders: string[] = [];
  for (const it of top ?? []) {
    if (it.id) {
      out.push({ path: it.name, folder: "", stem: stemOf(it.name), size: it.metadata?.size ?? 0 });
    } else {
      folders.push(it.name);
    }
  }
  for (const folder of folders) {
    let offset = 0;
    // paginação explícita — o bucket tem milhares de ficheiros por pasta
    while (true) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        errors.push({ scope: `list_${folder}`, offset, detail: error.message });
        break;
      }
      for (const it of data ?? []) {
        if (!it.id) continue; // sub-pasta: não há convenção com sub-níveis
        out.push({
          path: `${folder}/${it.name}`,
          folder,
          stem: stemOf(it.name),
          size: it.metadata?.size ?? 0,
        });
      }
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function readAll(query: (from: number, to: number) => any): Promise<any[]> {
  const rows: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);
  try {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("invalid_jwt_shape");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.role !== "service_role") {
      return json({ error: "forbidden", detail: "service_role required" }, 403);
    }
  } catch (e) {
    return json({ error: "invalid_jwt", detail: (e as Error).message }, 401);
  }

  let body: { dry_run?: boolean; days?: number; max_files?: number; max_delete?: number } = {};
  try { body = await req.json(); } catch { /* corpo vazio = defaults */ }
  const dryRun = body.dry_run !== false; // default seguro: simulação
  const days = Math.min(Math.max(body.days ?? 183, 0), 3650); // 183 ≈ 6 meses
  const maxDelete = Math.min(Math.max(body.max_files ?? body.max_delete ?? 500, 0), 5000);

  // deno-lint-ignore no-explicit-any
  const admin: any = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();
  const errors: unknown[] = [];

  try {
    // 1) Inventário do bucket
    const files = await listAllFiles(admin, errors);
    const byPath = new Map<string, FileEntry>();
    for (const f of files) byPath.set(f.path, f);

    // 2) Linhas de crm.meta_creatives
    const creatives = await readAll((from, to) =>
      admin.schema("crm").from("meta_creatives")
        .select("id, company_id, name, storage_path, file_url, file_size_bytes, meta_creative_id")
        .order("id", { ascending: true }).range(from, to)
    );
    const rowByPath = new Map<string, any>();
    const rowByMetaId = new Map<string, any>();
    for (const r of creatives) {
      if (r.storage_path) rowByPath.set(r.storage_path, r);
      if (r.meta_creative_id) rowByMetaId.set(String(r.meta_creative_id), r);
    }

    // 3) Espelho de anúncios e campanhas
    const ads = await readAll((from, to) =>
      admin.schema("crm").from("meta_ad_snapshot")
        .select("meta_creative_id, effective_status, external_campaign_id, company_id, updated_time")
        .not("meta_creative_id", "is", null)
        .order("id", { ascending: true }).range(from, to)
    );
    const campaigns = await readAll((from, to) =>
      admin.schema("crm").from("meta_campaign_snapshot")
        .select("external_campaign_id, company_id, name, stop_time, updated_time, linked_event_id, effective_status")
        .order("id", { ascending: true }).range(from, to)
    );
    const campByExt = new Map<string, any>();
    for (const c of campaigns) campByExt.set(String(c.external_campaign_id), c);

    type AdsInfo = { active: boolean; eventIds: Set<string>; campaigns: Set<string> };
    const adsByCreative = new Map<string, AdsInfo>();
    for (const a of ads) {
      const key = String(a.meta_creative_id);
      let info = adsByCreative.get(key);
      if (!info) {
        info = { active: false, eventIds: new Set(), campaigns: new Set() };
        adsByCreative.set(key, info);
      }
      if (String(a.effective_status ?? "").toUpperCase() === "ACTIVE") info.active = true;
      if (a.external_campaign_id) {
        info.campaigns.add(String(a.external_campaign_id));
        const camp = campByExt.get(String(a.external_campaign_id));
        if (camp?.linked_event_id) info.eventIds.add(String(camp.linked_event_id));
      }
    }

    // 4) Datas finais dos eventos (evento + sub-eventos)
    const events = await readAll((from, to) =>
      admin.from("events").select("id, parent_event_id, date")
        .order("id", { ascending: true }).range(from, to)
    );
    const ownDate = new Map<string, string | null>();
    const childrenOf = new Map<string, string[]>();
    for (const e of events) {
      ownDate.set(e.id, e.date ?? null);
      if (e.parent_event_id) {
        const arr = childrenOf.get(e.parent_event_id) ?? [];
        arr.push(e.id);
        childrenOf.set(e.parent_event_id, arr);
      }
    }
    function finalDate(eventId: string): string | null {
      let max = ownDate.get(eventId) ?? null;
      for (const child of childrenOf.get(eventId) ?? []) {
        const d = ownDate.get(child) ?? null;
        if (d && (!max || d > max)) max = d;
      }
      return max;
    }
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // 5) Classificação
    const classA: FileEntry[] = [];
    const classBOrphan: FileEntry[] = [];
    const classBDup: { file: FileEntry; canonical: string }[] = [];
    const classBRepoint: { file: FileEntry; rowId: string }[] = [];
    const classC: FileEntry[] = [];
    const skippedActiveFiles: FileEntry[] = [];
    let classCBytes = 0;
    const classCGroups = new Map<string, {
      company_id: string | null; campaign_id: string; campaign_name: string | null;
      stop_time: string | null; last_updated_time: string | null;
      creatives: number; bytes: number; active_ads: number;
    }>();
    const seenCreativePerGroup = new Set<string>();

    for (const f of files) {
      const row = rowByPath.get(f.path);
      if (row) {
        const metaId = row.meta_creative_id ? String(row.meta_creative_id) : null;
        const info = metaId ? adsByCreative.get(metaId) : undefined;
        if (!info) continue; // sem anúncio no espelho → fora de âmbito nesta versão
        if (info.active) { skippedActiveFiles.push(f); continue; }
        if (info.eventIds.size > 0) {
          let newest: string | null = null;
          for (const ev of info.eventIds) {
            const d = finalDate(ev);
            if (d && (!newest || d > newest)) newest = d;
          }
          if (newest && newest < cutoff) classA.push(f);
          continue;
        }
        // Classe C — campanha sem evento: só lista.
        classC.push(f);
        classCBytes += f.size;
        for (const campId of info.campaigns) {
          const camp = campByExt.get(campId);
          const g = classCGroups.get(campId) ?? {
            company_id: camp?.company_id ?? row.company_id ?? null,
            campaign_id: campId,
            campaign_name: camp?.name ?? null,
            stop_time: camp?.stop_time ?? null,
            last_updated_time: camp?.updated_time ?? null,
            creatives: 0, bytes: 0, active_ads: 0,
          };
          const dedupe = `${campId}::${metaId}`;
          if (!seenCreativePerGroup.has(dedupe)) {
            seenCreativePerGroup.add(dedupe);
            g.creatives += 1;
            g.bytes += f.size;
          }
          classCGroups.set(campId, g);
        }
        continue;
      }

      // Sem linha para este caminho
      const target = rowByMetaId.get(f.stem);
      if (!target) { classBOrphan.push(f); continue; }
      const canonical = target.storage_path as string | null;
      if (canonical && byPath.has(canonical) && canonical !== f.path) {
        classBDup.push({ file: f, canonical });
      } else {
        classBRepoint.push({ file: f, rowId: target.id });
      }
    }

    for (const [campId, g] of classCGroups) {
      let active = 0;
      for (const a of ads) {
        if (String(a.external_campaign_id) === campId &&
            String(a.effective_status ?? "").toUpperCase() === "ACTIVE") active++;
      }
      g.active_ads = active;
      classCGroups.set(campId, g);
    }

    const sum = (arr: { size: number }[]) => arr.reduce((s, x) => s + (x.size ?? 0), 0);
    const counts = {
      files_scanned: files.length,
      class_a: { count: classA.length, bytes: sum(classA) },
      class_b_orphan: { count: classBOrphan.length, bytes: sum(classBOrphan) },
      class_b_duplicate: { count: classBDup.length, bytes: sum(classBDup.map((d) => d.file)) },
      class_b_repoint: { count: classBRepoint.length, bytes: sum(classBRepoint.map((d) => d.file)) },
      class_c_listed_only: { count: classC.length, bytes: classCBytes },
      skipped_active: skippedActiveFiles.length,
      // "Protegidos" = nunca apagados: anúncio activo + campanha sem evento +
      // única cópia (classe B a repontar).
      protected_total: {
        count: skippedActiveFiles.length + classC.length + classBRepoint.length,
        bytes: sum(skippedActiveFiles) + classCBytes + sum(classBRepoint.map((d) => d.file)),
      },
    };
    const mb = (b: number) => Math.round((b / (1024 * 1024)) * 10) / 10;
    const mbByGroup = {
      orfaos_mb: mb(counts.class_b_orphan.bytes),
      duplicados_mb: mb(counts.class_b_duplicate.bytes),
      ligados_mais_6_meses_mb: mb(counts.class_a.bytes),
      protegidos_mb: mb(counts.protected_total.bytes),
      unica_copia_a_repontar_mb: mb(counts.class_b_repoint.bytes),
    };

    // 6) Execução (só quando dry_run=false)
    let deletedCount = 0;
    let deletedBytes = 0;
    let repointed = 0;
    const deletedPaths: string[] = [];
    const logRows: { path: string; grupo: string; bytes: number; company_id: string | null; creative_id: string | null }[] = [];

    if (!dryRun) {
      // A) apagar ficheiro + limpar apontadores na linha
      for (const f of classA) {
        if (deletedCount >= maxDelete) break;
        try {
          const { error: delErr } = await admin.storage.from(BUCKET).remove([f.path]);
          if (delErr) throw new Error(delErr.message);
          const row = rowByPath.get(f.path);
          const { error: updErr } = await admin.schema("crm").from("meta_creatives")
            .update({
              storage_path: null,
              file_url: null,
              file_size_bytes: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (updErr) throw new Error(`db_update: ${updErr.message}`);
          deletedCount++; deletedBytes += f.size; deletedPaths.push(f.path);
          logRows.push({
            path: f.path, grupo: "ligado_evento_mais_6_meses", bytes: f.size,
            company_id: row?.company_id ?? null, creative_id: row?.id ?? null,
          });
        } catch (e) {
          errors.push({ class: "A", path: f.path, detail: (e as Error).message });
        }
      }
      // B) órfãos e duplicados — em lotes pela API de storage.
      const bGroups: { grupo: string; entries: FileEntry[] }[] = [
        { grupo: "orfao", entries: classBOrphan },
        { grupo: "duplicado", entries: classBDup.map((d) => d.file) },
      ];
      const BATCH = 100;
      for (const { grupo, entries } of bGroups) {
        for (let i = 0; i < entries.length; i += BATCH) {
          if (deletedCount >= maxDelete) break;
          const lote = entries.slice(i, i + BATCH).slice(0, Math.max(maxDelete - deletedCount, 0));
          if (!lote.length) break;
          const { error: delErr } = await admin.storage
            .from(BUCKET).remove(lote.map((f) => f.path));
          if (delErr) {
            errors.push({ class: "B", grupo, paths: lote.length, detail: delErr.message });
            continue;
          }
          for (const f of lote) {
            deletedCount++; deletedBytes += f.size; deletedPaths.push(f.path);
            logRows.push({
              path: f.path, grupo, bytes: f.size,
              company_id: rowByMetaId.get(f.stem)?.company_id ?? null,
              creative_id: grupo === "duplicado" ? (rowByMetaId.get(f.stem)?.id ?? null) : null,
            });
          }
        }
      }
      // B) única cópia → apontar a linha para este ficheiro
      for (const item of classBRepoint) {
        try {
          const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(item.file.path);
          const { error: updErr } = await admin.schema("crm").from("meta_creatives")
            .update({
              storage_bucket: BUCKET,
              storage_path: item.file.path,
              file_url: pub.publicUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.rowId);
          if (updErr) throw new Error(updErr.message);
          repointed++;
        } catch (e) {
          errors.push({ class: "B-repoint", path: item.file.path, detail: (e as Error).message });
        }
      }
    }

    const sample = {
      class_a: classA.slice(0, SAMPLE_MAX).map((f) => f.path),
      class_b_orphan: classBOrphan.slice(0, SAMPLE_MAX).map((f) => f.path),
      class_b_duplicate: classBDup.slice(0, SAMPLE_MAX).map((d) => ({ path: d.file.path, canonical: d.canonical })),
      class_b_repoint: classBRepoint.slice(0, SAMPLE_MAX).map((d) => d.file.path),
      class_c_groups: [...classCGroups.values()]
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, SAMPLE_MAX),
      deleted: deletedPaths.slice(0, SAMPLE_MAX),
    };

    const runRow = {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      dry_run: dryRun,
      days,
      max_delete: maxDelete,
      files_scanned: counts.files_scanned,
      class_a_count: counts.class_a.count,
      class_a_bytes: counts.class_a.bytes,
      class_b_orphan_count: counts.class_b_orphan.count,
      class_b_orphan_bytes: counts.class_b_orphan.bytes,
      class_b_duplicate_count: counts.class_b_duplicate.count,
      class_b_duplicate_bytes: counts.class_b_duplicate.bytes,
      class_b_repointed_count: dryRun ? counts.class_b_repoint.count : repointed,
      class_c_count: counts.class_c_listed_only.count,
      class_c_bytes: counts.class_c_listed_only.bytes,
      skipped_active_count: skippedActiveFiles.length,
      deleted_count: deletedCount,
      deleted_bytes: deletedBytes,
      error_count: errors.length,
      errors,
      sample,
    };

    const { data: inserted, error: insErr } = await admin.schema("crm")
      .from("meta_creatives_retention_runs").insert(runRow).select("id").single();
    if (insErr) errors.push({ scope: "run_insert", detail: insErr.message });

    // Registo ficheiro-a-ficheiro do que saiu do bucket (nunca em dry_run).
    if (logRows.length) {
      for (let i = 0; i < logRows.length; i += 500) {
        const { error: logErr } = await admin.schema("crm")
          .from("meta_creatives_retention_log")
          .insert(logRows.slice(i, i + 500).map((r) => ({ ...r, run_id: inserted?.id ?? null })));
        if (logErr) errors.push({ scope: "retention_log_insert", detail: logErr.message });
      }
    }

    return json({
      run_id: inserted?.id ?? null,
      dry_run: dryRun,
      days,
      max_files: maxDelete,
      max_delete: maxDelete,
      ...counts,
      mb_por_grupo: mbByGroup,
      logged_rows: logRows.length,
      deleted_count: deletedCount,
      deleted_bytes: deletedBytes,
      repointed,
      error_count: errors.length,
      errors: errors.slice(0, 50),
      sample,
    });
  } catch (e) {
    errors.push({ scope: "fatal", detail: (e as Error).message });
    await admin.schema("crm").from("meta_creatives_retention_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      dry_run: dryRun,
      days,
      max_delete: maxDelete,
      error_count: errors.length,
      errors,
    });
    return json({ error: "retention_failed", detail: (e as Error).message, errors }, 500);
  }
});
