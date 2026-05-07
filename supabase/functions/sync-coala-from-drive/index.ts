// sync-coala-from-drive
// Wrapper que baixa o XLSX da planilha Coala (Google Drive), calcula hash,
// compara com a última execução e (em modo apply) reusa apply-coala-bp para
// garantir paridade 100% com o wizard manual.
//
// POST { configId?, mode: 'dry_run'|'apply', triggeredBy?: 'cron'|'manual' }
//   - se sem configId e triggeredBy='cron' → itera todos os enabled
//   - apply só permitido se a última run dry_run for "limpa" (zero conflitos)
//
// Auth:
//   - manual: JWT do utilizador (admin/manager)
//   - cron: header X-Cron-Secret = COALA_SYNC_CRON_SECRET (ou service-role direto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  parseCoalaXlsx,
  buildValidationReport,
} from "../_shared/coalaParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─────────────────────────────────────────────────────────────────
// Google Drive: refresh token → access token → download bytes
// ─────────────────────────────────────────────────────────────────
async function getDriveAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Secrets do Google Drive em falta (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Falha a obter access_token Google (${r.status}): ${await r.text()}`);
  const j = await r.json();
  return j.access_token as string;
}

async function downloadDriveXlsx(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  // Tenta primeiro como ficheiro binário (XLSX nativo)
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (r.ok) return await r.arrayBuffer();
  // Se for um Google Sheets nativo, tem de exportar como XLSX
  if (r.status === 403 || r.status === 400) {
    const exp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!exp.ok) throw new Error(`Drive export falhou (${exp.status}): ${await exp.text()}`);
    return await exp.arrayBuffer();
  }
  throw new Error(`Drive download falhou (${r.status}): ${await r.text()}`);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

const norm = (s: string): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const moneyKey = (n: number) => Math.round((Number(n) || 0) * 100);

// row_key estável: descrição+valor+data+fornecedor+invoice
const buildRowKey = (r: {
  description: string; netAmount: number; supplier: string | null;
  invoiceRef: string | null; paymentDate: string | null; dueDate: string | null;
}) =>
  [
    norm(r.description),
    moneyKey(r.netAmount),
    norm(r.supplier ?? ""),
    norm(r.invoiceRef ?? ""),
    r.paymentDate ?? "",
    r.dueDate ?? "",
  ].join("|");

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const cronSecretHdr = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("COALA_SYNC_CRON_SECRET");
    const isCron = !!expectedCronSecret && cronSecretHdr === expectedCronSecret;

    // Auth: cron OU JWT de utilizador privilegiado
    let authedUserId: string | null = null;
    let authedEmail: string | null = null;
    if (!isCron) {
      const auth = req.headers.get("Authorization");
      if (!auth) return json({ error: "Não autenticado" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Sessão inválida" }, 401);
      const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: roles } = await admin0.from("user_roles").select("role").eq("user_id", user.id);
      const allowed = new Set(["admin", "manager", "platform_admin"]);
      const has = (roles ?? []).some((r: any) => allowed.has(r.role));
      if (!has) return json({ error: "Sem permissão (admin/manager)" }, 403);
      authedUserId = user.id;
      authedEmail = user.email ?? null;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { configId, mode = "dry_run" } = body ?? {};
    const triggeredBy = isCron ? "cron" : (body?.triggeredBy ?? "manual");
    if (!["dry_run", "apply"].includes(mode)) return json({ error: "mode inválido" }, 400);

    // Carregar configs
    let configs: any[] = [];
    if (configId) {
      const { data, error } = await admin.from("coala_sync_config").select("*").eq("id", configId).maybeSingle();
      if (error || !data) return json({ error: "Config não encontrada" }, 404);
      configs = [data];
    } else if (isCron) {
      const { data, error } = await admin.from("coala_sync_config").select("*").eq("enabled", true);
      if (error) return json({ error: error.message }, 500);
      configs = data ?? [];
    } else {
      return json({ error: "configId obrigatório em chamadas manuais" }, 400);
    }

    if (configs.length === 0) return json({ ok: true, message: "Nenhuma config a processar", runs: [] });

    const runs: any[] = [];
    const driveToken = await getDriveAccessToken();

    for (const cfg of configs) {
      // Cria run em estado running
      const { data: runIns, error: runErr } = await admin.from("coala_sync_runs").insert({
        config_id: cfg.id,
        event_id: cfg.event_id,
        company_id: cfg.company_id,
        mode,
        triggered_by: triggeredBy,
        status: "running",
        triggered_user_id: authedUserId,
      }).select("id").single();
      if (runErr || !runIns) {
        runs.push({ configId: cfg.id, error: `criação de run falhou: ${runErr?.message}` });
        continue;
      }
      const runId = runIns.id as string;

      try {
        // 1. Download XLSX
        const buf = await downloadDriveXlsx(cfg.drive_file_id, driveToken);
        const sha = await sha256Hex(buf);

        // 2. Idempotência: igual à última run success/dry_run? → skipped
        const { data: lastSuccess } = await admin.from("coala_sync_runs")
          .select("id, xlsx_sha256, status, mode")
          .eq("config_id", cfg.id)
          .in("status", ["success", "skipped_unchanged"])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastSuccess && lastSuccess.xlsx_sha256 === sha && mode === "dry_run") {
          await admin.from("coala_sync_runs").update({
            status: "skipped_unchanged",
            xlsx_sha256: sha,
            xlsx_size_bytes: buf.byteLength,
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          await admin.from("coala_sync_config").update({
            last_run_at: new Date().toISOString(),
            last_run_status: "skipped_unchanged",
          }).eq("id", cfg.id);
          runs.push({ runId, configId: cfg.id, status: "skipped_unchanged" });
          continue;
        }

        // 3. Parse + valida
        const parsed = parseCoalaXlsx(buf, "drive-sync");
        const validation = buildValidationReport(parsed);

        // 4. Calcular row_keys atuais e comparar com row_state guardado
        const currentKeys = new Map<string, any>();
        for (const r of parsed.rows) {
          if (r.excluded) continue;
          const k = buildRowKey(r);
          currentKeys.set(k, {
            rowNumber: r.rowNumber,
            description: r.description,
            netAmount: r.netAmount,
            grossAmount: r.grossAmount,
            supplier: r.supplier,
            invoiceRef: r.invoiceRef,
            status: r.status,
            paymentDate: r.paymentDate,
            dueDate: r.dueDate,
          });
        }

        const { data: prevState } = await admin.from("coala_sync_row_state")
          .select("row_key, last_xlsx_payload, manual_override, manual_override_reason, forecast_id")
          .eq("config_id", cfg.id);
        const prevByKey = new Map<string, any>((prevState ?? []).map((s: any) => [s.row_key, s]));

        const newRows: any[] = [];
        const removedRows: any[] = [];
        const conflictRows: any[] = [];
        let updatedCount = 0;

        for (const [k, payload] of currentKeys) {
          if (!prevByKey.has(k)) newRows.push(payload);
        }
        for (const [k, st] of prevByKey) {
          if (!currentKeys.has(k)) {
            if (st.manual_override) {
              conflictRows.push({ rowKey: k, type: "removed_with_override", payload: st.last_xlsx_payload, reason: st.manual_override_reason });
            } else {
              removedRows.push({ rowKey: k, payload: st.last_xlsx_payload });
            }
          }
        }

        // 5. Comparar com BP/TX atual via apply-coala-bp phase=compare
        const fileBase64 = arrayBufferToBase64(buf);
        const compareResp = await fetch(`${SUPABASE_URL}/functions/v1/apply-coala-bp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({
            fileBase64,
            fileName: `drive-${cfg.drive_file_id}.xlsx`,
            fileVersion: "drive-sync",
            eventId: cfg.event_id,
            phase: "compare",
            ackTotals: true,
          }),
        });
        const compareJson = await compareResp.json().catch(() => ({}));

        const hasConflicts = conflictRows.length > 0;
        const hasMismatches = (compareJson?.summary?.valueMismatches ?? 0) > 0;
        const totalRows = currentKeys.size;

        const diff = {
          xlsxVsState: {
            new: newRows,
            removed: removedRows,
            conflicts: conflictRows,
            updatedCount,
          },
          xlsxVsBp: compareJson?.summary ?? null,
          missingInBp: compareJson?.missingInBp ?? [],
          extraInBp: compareJson?.extraInBp ?? [],
          valueMismatches: compareJson?.valueMismatches ?? [],
          sponsors: {
            missing: compareJson?.sponsorMissing ?? [],
            extra: compareJson?.sponsorExtra ?? [],
            mismatch: compareJson?.sponsorMismatch ?? [],
          },
          validation,
        };

        // 6. Apply: bloqueia se houver conflitos com manual_override; senão chama reset_reimport
        if (mode === "apply") {
          if (hasConflicts) {
            await admin.from("coala_sync_runs").update({
              status: "blocked",
              xlsx_sha256: sha,
              xlsx_size_bytes: buf.byteLength,
              file_version: parsed.fileVersion,
              total_rows: totalRows,
              new_count: newRows.length,
              updated_count: updatedCount,
              removed_count: removedRows.length,
              conflict_count: conflictRows.length,
              diff,
              error_message: `${conflictRows.length} conflito(s) com manual_override — apply bloqueado`,
              finished_at: new Date().toISOString(),
            }).eq("id", runId);
            await admin.from("coala_sync_config").update({
              last_run_at: new Date().toISOString(),
              last_run_status: "blocked",
            }).eq("id", cfg.id);
            runs.push({ runId, configId: cfg.id, status: "blocked", conflicts: conflictRows.length });
            continue;
          }

          // Re-import (snapshot automático dentro de apply-coala-bp)
          const applyResp = await fetch(`${SUPABASE_URL}/functions/v1/apply-coala-bp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
            },
            body: JSON.stringify({
              fileBase64,
              fileName: `drive-sync-${cfg.drive_file_id}.xlsx`,
              fileVersion: `drive-${new Date().toISOString().slice(0, 10)}`,
              eventId: cfg.event_id,
              phase: "reset_reimport",
              syncMode: "replace",
              ackTotals: true,
            }),
          });
          const applyJson = await applyResp.json().catch(() => ({}));
          if (!applyResp.ok) {
            throw new Error(`apply-coala-bp falhou (${applyResp.status}): ${JSON.stringify(applyJson)}`);
          }

          // Atualizar row_state com snapshot atual (substitui tudo: este sync usa reset_reimport)
          await admin.from("coala_sync_row_state").delete().eq("config_id", cfg.id);
          if (currentKeys.size > 0) {
            const stateRows = Array.from(currentKeys.entries()).map(([k, payload]) => ({
              config_id: cfg.id,
              row_key: k,
              last_seen_run_id: runId,
              last_xlsx_payload: payload,
              manual_override: false,
            }));
            // bulk insert em chunks de 500
            for (let i = 0; i < stateRows.length; i += 500) {
              await admin.from("coala_sync_row_state").insert(stateRows.slice(i, i + 500));
            }
          }

          await admin.from("coala_sync_runs").update({
            status: "success",
            xlsx_sha256: sha,
            xlsx_size_bytes: buf.byteLength,
            file_version: parsed.fileVersion,
            total_rows: totalRows,
            new_count: newRows.length,
            updated_count: updatedCount,
            removed_count: removedRows.length,
            conflict_count: 0,
            diff: { ...diff, applyResult: applyJson?.summary ?? null },
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          await admin.from("coala_sync_config").update({
            last_run_at: new Date().toISOString(),
            last_run_status: "success",
          }).eq("id", cfg.id);
          runs.push({ runId, configId: cfg.id, status: "success" });
        } else {
          // dry_run
          await admin.from("coala_sync_runs").update({
            status: "success",
            xlsx_sha256: sha,
            xlsx_size_bytes: buf.byteLength,
            file_version: parsed.fileVersion,
            total_rows: totalRows,
            new_count: newRows.length,
            updated_count: updatedCount,
            removed_count: removedRows.length,
            conflict_count: conflictRows.length,
            diff,
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          await admin.from("coala_sync_config").update({
            last_run_at: new Date().toISOString(),
            last_run_status: hasConflicts || hasMismatches ? "needs_review" : "success",
          }).eq("id", cfg.id);
          runs.push({
            runId, configId: cfg.id, status: "success",
            new: newRows.length, removed: removedRows.length, conflicts: conflictRows.length,
            mismatches: compareJson?.summary?.valueMismatches ?? 0,
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        await admin.from("coala_sync_runs").update({
          status: "failed",
          error_message: msg,
          finished_at: new Date().toISOString(),
        }).eq("id", runId);
        await admin.from("coala_sync_config").update({
          last_run_at: new Date().toISOString(),
          last_run_status: "failed",
        }).eq("id", cfg.id);
        runs.push({ runId, configId: cfg.id, status: "failed", error: msg });
      }
    }

    return json({ ok: true, runs });
  } catch (err) {
    console.error("sync-coala-from-drive error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
