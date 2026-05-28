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
  const credentialSets = [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN"],
    ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REFRESH_TOKEN"],
  ] as const;

  const attempts: string[] = [];
  for (const [idName, secretName, refreshName] of credentialSets) {
    const clientId = Deno.env.get(idName);
    const clientSecret = Deno.env.get(secretName);
    const refreshToken = Deno.env.get(refreshName);
    if (!clientId || !clientSecret || !refreshToken) continue;

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
    const payload = await r.json().catch(async () => ({ raw: await r.text() }));
    if (r.ok && payload?.access_token) return payload.access_token as string;
    attempts.push(`${idName}/${secretName}/${refreshName}: ${r.status} ${payload?.error ?? "erro"}`);
  }

  if (attempts.length === 0) {
    throw new Error("Secrets do Google Drive em falta (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).");
  }
  throw new Error(`Falha a obter access_token Google. Tentativas: ${attempts.join("; ")}`);
}

function extractDriveFileId(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) throw new Error("drive_file_id vazio");
  // Já é um ID puro (sem '/' nem 'http')
  if (!s.includes("/") && !s.startsWith("http")) return s;
  // Padrões comuns: /d/{id}/, /spreadsheets/d/{id}/, ?id={id}, /file/d/{id}
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  throw new Error(`Não consegui extrair o file ID de: ${s}`);
}

async function downloadDriveXlsx(fileIdOrUrl: string, accessToken: string): Promise<ArrayBuffer> {
  const fileId = extractDriveFileId(fileIdOrUrl);
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

const jwtRole = (authHeader: string | null): string | null => {
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch {
    return null;
  }
};

const moneyKey = (n: number) => Math.round((Number(n) || 0) * 100);

// Considera invoiceRef "fraca" valores triviais como "-", "n/a", "0", "fatura", etc.
const isInvoiceRefStrong = (ref: string | null | undefined): boolean => {
  if (!ref) return false;
  const n = norm(ref);
  if (n.length < 3) return false;
  if (/^(n\/?a|na|sem|s\/n|sn|nd|0+|-+|x+|fatura|recibo|fact|inv)$/.test(n)) return false;
  return true;
};

// IDENTITY KEY (forte): supplier + invoiceRef. Só quando ambos existem.
// Imune a renomeação de descrição, mudança de valor (split em parcelas), mudança de data.
export const buildIdentityKey = (r: {
  supplier: string | null;
  invoiceRef: string | null;
}): string | null => {
  const sup = norm(r.supplier ?? "");
  if (!sup) return null;
  if (!isInvoiceRefStrong(r.invoiceRef)) return null;
  return `inv::${sup}::${norm(r.invoiceRef ?? "")}`;
};

// FALLBACK KEY: linhas sem fatura. supplier + centerCusto + valor (cents) + rowNumber.
// O rowNumber dá uma âncora posicional; o resto permite detetar a mesma linha
// mesmo que se acrescente "X parcela" à descrição.
export const buildFallbackKey = (r: {
  rowNumber: number;
  supplier: string | null;
  rawCenterCusto: string | null;
  netAmount: number;
}): string =>
  [
    "fb",
    r.rowNumber,
    norm(r.supplier ?? ""),
    norm(r.rawCenterCusto ?? ""),
    moneyKey(r.netAmount),
  ].join("::");

// LEGACY KEY: chave antiga (descrição+valor+data+supplier+invoice+due). Mantida
// SÓ para migração one-shot a partir de coala_sync_decisions/runs anteriores.
export const buildLegacyKey = (r: {
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

// Hash compacto do payload para detetar mudanças entre runs sem comparar tudo.
const buildApplyHash = (r: {
  description: string; netAmount: number; paymentDate: string | null;
  dueDate: string | null; status: string | null;
}): string =>
  [
    norm(r.description),
    moneyKey(r.netAmount),
    r.paymentDate ?? "",
    r.dueDate ?? "",
    r.status ?? "",
  ].join("|");

// Chave efetiva (a usada em xlsxVsState). Prefere identity; cai para fallback.
const buildRowKey = (r: {
  description: string; netAmount: number; supplier: string | null;
  invoiceRef: string | null; paymentDate: string | null; dueDate: string | null;
  rowNumber: number; rawCenterCusto: string | null;
}): string =>
  buildIdentityKey(r) ?? buildFallbackKey(r);

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const cronSecretHdr = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("COALA_SYNC_CRON_SECRET");
    const auth = req.headers.get("Authorization");
    const isServiceRole = auth === `Bearer ${SERVICE_ROLE}` || jwtRole(auth) === "service_role";
    const isCron = !!expectedCronSecret && cronSecretHdr === expectedCronSecret;

    // Auth: cron OU JWT de utilizador privilegiado
    let authedUserId: string | null = null;
    let authedEmail: string | null = null;
    if (!isCron && !isServiceRole) {
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
    const { configId, mode = "dry_run", basedOnRunId } = body ?? {};
    const triggeredBy = isCron ? "cron" : (body?.triggeredBy ?? "manual");
    if (!["dry_run", "apply", "auto_apply"].includes(mode)) return json({ error: "mode inválido" }, 400);

    // ─────────────────────────────────────────────────────────────
    // Modo auto_apply manual: re-baixa o XLSX da config, chama
    // apply-coala-bp phase=auto_apply usando basedOnRunId.
    // ─────────────────────────────────────────────────────────────
    if (mode === "auto_apply") {
      if (!basedOnRunId) return json({ error: "auto_apply requer basedOnRunId" }, 400);
      const { data: baseRun } = await admin.from("coala_sync_runs")
        .select("id, config_id, event_id, company_id").eq("id", basedOnRunId).maybeSingle();
      if (!baseRun) return json({ error: "Run base não encontrada" }, 404);
      const { data: cfg } = await admin.from("coala_sync_config").select("*").eq("id", baseRun.config_id).maybeSingle();
      if (!cfg) return json({ error: "Config não encontrada" }, 404);
      const tok = await getDriveAccessToken();
      const buf = await downloadDriveXlsx(cfg.drive_file_id, tok);
      const fileBase64 = arrayBufferToBase64(buf);
      const aaResp = await fetch(`${SUPABASE_URL}/functions/v1/apply-coala-bp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({
          fileBase64,
          fileName: `drive-auto-${cfg.drive_file_id}.xlsx`,
          fileVersion: `drive-auto-${new Date().toISOString().slice(0, 10)}`,
          eventId: cfg.event_id,
          phase: "auto_apply",
          basedOnRunId,
          configId: cfg.id,
          ackTotals: true,
        }),
      });
      const aaJson = await aaResp.json().catch(() => ({}));
      if (!aaResp.ok || !aaJson?.ok) {
        return json({ error: "auto_apply falhou", detail: aaJson }, 500);
      }
      // Marca a run base como auto_applied
      await admin.from("coala_sync_runs").update({
        status: "auto_applied",
        diff: null, // limpa diff já consumido
      }).eq("id", basedOnRunId);
      await admin.from("coala_sync_config").update({
        last_run_at: new Date().toISOString(),
        last_run_status: "auto_applied",
      }).eq("id", cfg.id);
      return json({ ok: true, mode: "auto_apply", basedOnRunId, audit: aaJson?.audit ?? null });
    }


    // Se for apply baseado numa dry-run revista, exige decisão para TODAS as
    // diferenças (validate/ignore/edit). Caso contrário, bloqueia.
    let decisionsByKey: Map<string, any> = new Map();
    if (mode === "apply" && basedOnRunId) {
      const { data: baseRun } = await admin.from("coala_sync_runs")
        .select("id, diff").eq("id", basedOnRunId).maybeSingle();
      const { data: decs } = await admin.from("coala_sync_decisions")
        .select("row_key, diff_kind, decision, custom_amount, notes")
        .eq("run_id", basedOnRunId);
      decisionsByKey = new Map((decs ?? []).map((d: any) => [`${d.row_key}::${d.diff_kind}`, d]));
      const d: any = baseRun?.diff ?? {};
      const expected: string[] = [];
      for (const m of d.valueMismatches ?? [])
        expected.push(`${m.rowKey ?? `vm:${m.description}:${m.fileAmount}`}::value_mismatch`);
      for (const r of d.missingInBp ?? [])
        expected.push(`miss:${r.description}:${r.netAmount}::new_row`);
      for (const r of d.extraInBp ?? [])
        expected.push(`extra:${r.id}::extra_in_bp`);
      for (const r of d.txMissing ?? [])
        expected.push(`txmiss:${r.description}:${r.netAmount}::tx_missing`);
      for (const m of d.txValueMismatches ?? [])
        expected.push(`txvm:${m.txId ?? m.description}:${m.fileAmount}::tx_value_mismatch`);
      for (const r of d.txExtra ?? [])
        expected.push(`txextra:${r.id}::tx_extra`);
      for (const r of d.xlsxVsState?.removed ?? [])
        expected.push(`${r.rowKey ?? `rm:${r.payload?.description}`}::removed_row`);
      for (const r of d.xlsxVsState?.conflicts ?? [])
        expected.push(`${r.rowKey}::conflict`);
      for (const s of d.sponsors?.mismatch ?? [])
        expected.push(`sp:${s.description ?? s.name}::sponsor_mismatch`);
      const missing = expected.filter((k) => !decisionsByKey.has(k));
      if (missing.length > 0) {
        return json({ error: `Faltam ${missing.length} decisão(ões) na run base ${basedOnRunId}` }, 400);
      }
    }

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

      // Captura o modifiedTime do Drive (gravado em cfg.last_modified_time no fim do sync com sucesso)
      let driveModifiedTime: string | null = null;
      try {
        const fileId = extractDriveFileId(cfg.drive_file_id);
        console.log(`[modifiedTime] cfg=${cfg.id} fileId=${fileId} (raw=${String(cfg.drive_file_id).slice(0, 80)})`);
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime,name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          { headers: { Authorization: `Bearer ${driveToken}` } },
        );
        console.log(`[modifiedTime] HTTP ${metaRes.status} for cfg=${cfg.id}`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          driveModifiedTime = meta?.modifiedTime ?? null;
          console.log(`[modifiedTime] Captured: ${driveModifiedTime} for file: ${meta?.name ?? "?"}`);
          // SKIP pré-download se modifiedTime <= last_modified_time processado
          if (mode === "dry_run" && driveModifiedTime && cfg.last_modified_time) {
            const drv = new Date(driveModifiedTime).getTime();
            const last = new Date(cfg.last_modified_time).getTime();
            if (Number.isFinite(drv) && Number.isFinite(last) && drv <= last) {
              await admin.from("coala_sync_runs").update({
                status: "skipped_unchanged",
                diff: {
                  skipped: true,
                  reason: "drive_modified_time_unchanged",
                  driveModifiedTime,
                  lastProcessed: cfg.last_modified_time,
                  fileName: meta?.name ?? null,
                },
                finished_at: new Date().toISOString(),
              }).eq("id", runId);
              await admin.from("coala_sync_config").update({
                last_run_at: new Date().toISOString(),
                last_run_status: "skipped_unchanged",
              }).eq("id", cfg.id);
              runs.push({ runId, configId: cfg.id, status: "skipped_unchanged", reason: "drive_modified_time_unchanged" });
              continue;
            }
          }
        } else {
          const errBody = await metaRes.text().catch(() => "");
          console.warn(`[modifiedTime] Drive metadata HTTP ${metaRes.status}: ${errBody.slice(0, 300)}`);
        }
      } catch (e) {
        console.error("[modifiedTime] error, fallback: download —", (e as Error).message);
      }
      console.log(`[modifiedTime] final driveModifiedTime=${driveModifiedTime} (will write to cfg=${cfg.id} at end of run)`);

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
          const identityKey = buildIdentityKey(r);
          const fallbackKey = buildFallbackKey(r);
          const k = identityKey ?? fallbackKey;
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
            rawCenterCusto: r.rawCenterCusto,
            // metadados de identidade (escritos no row_state em apply)
            _identityKey: identityKey,
            _fallbackKey: fallbackKey,
            _legacyKey: buildLegacyKey(r),
            _applyHash: buildApplyHash(r),
            _supplierNorm: norm(r.supplier ?? ""),
            _invoiceRefNorm: norm(r.invoiceRef ?? ""),
            _centerCustoNorm: norm(r.rawCenterCusto ?? ""),
            _netAmountCents: moneyKey(r.netAmount),
          });
        }

        const { data: prevState } = await admin.from("coala_sync_row_state")
          .select("row_key, identity_key, fallback_key, last_xlsx_payload, manual_override, manual_override_reason, forecast_id")
          .eq("config_id", cfg.id);
        // Mapeia por row_key (chave atual) E por identity_key (continuidade quando
        // só o fallback mudou de posição mas a fatura é a mesma).
        const prevByKey = new Map<string, any>();
        for (const s of (prevState ?? [])) {
          prevByKey.set(s.row_key, s);
          if (s.identity_key && !prevByKey.has(s.identity_key)) {
            prevByKey.set(s.identity_key, s);
          }
        }


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
        if (!compareResp.ok || !compareJson?.ok || !compareJson?.summary) {
          throw new Error(
            `Comparação BP/TX falhou (${compareResp.status}): ${JSON.stringify(compareJson).slice(0, 500)}`,
          );
        }

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
          renameOnly: compareJson?.renameOnly ?? [],
          splitPending: compareJson?.splitPending ?? [],
          txMissing: compareJson?.txMissing ?? [],
          txValueMismatches: compareJson?.txValueMismatches ?? [],
          txExtra: compareJson?.txExtra ?? [],
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
            ...(driveModifiedTime ? { last_modified_time: driveModifiedTime } : {}),
          }).eq("id", cfg.id);
          runs.push({ runId, configId: cfg.id, status: "success", summary: applyJson?.summary ?? null });
        } else {
          // dry_run
          const sev = compareJson?.summary?.severity ?? { auto: 0, review: 0 };
          const autoCount = Number(sev.auto) || 0;
          const reviewCount = Number(sev.review) || 0;
          const canEscalate = !hasConflicts && reviewCount === 0 && autoCount > 0 && cfg.auto_apply_enabled !== false;

          await admin.from("coala_sync_runs").update({
            status: canEscalate ? "success" : (reviewCount > 0 ? "needs_review" : "success"),
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

          let escalation: any = null;
          if (canEscalate) {
            try {
              const aaResp = await fetch(`${SUPABASE_URL}/functions/v1/apply-coala-bp`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SERVICE_ROLE}`,
                  apikey: SERVICE_ROLE,
                },
                body: JSON.stringify({
                  fileBase64,
                  fileName: `drive-auto-${cfg.drive_file_id}.xlsx`,
                  fileVersion: `drive-auto-${new Date().toISOString().slice(0, 10)}`,
                  eventId: cfg.event_id,
                  phase: "auto_apply",
                  basedOnRunId: runId,
                  configId: cfg.id,
                  ackTotals: true,
                }),
              });
              const aaJson = await aaResp.json().catch(() => ({}));
              if (aaResp.ok && aaJson?.ok) {
                escalation = { status: "auto_applied", audit: aaJson.audit };
                await admin.from("coala_sync_runs").update({
                  status: "auto_applied",
                  diff: { ...diff, autoApplyAudit: aaJson.audit },
                }).eq("id", runId);
              } else {
                escalation = { status: "auto_apply_failed", error: aaJson };
                await admin.from("coala_sync_runs").update({
                  status: "needs_review",
                  diff: { ...diff, escalation },
                }).eq("id", runId);
              }
            } catch (e) {
              escalation = { status: "auto_apply_failed", error: (e as Error).message };
              await admin.from("coala_sync_runs").update({
                status: "needs_review",
                diff: { ...diff, escalation },
              }).eq("id", runId);
            }
          }

          await admin.from("coala_sync_config").update({
            last_run_at: new Date().toISOString(),
            last_run_status: escalation?.status === "auto_applied"
              ? "auto_applied"
              : (hasConflicts || reviewCount > 0 ? "needs_review" : "success"),
            ...(driveModifiedTime ? { last_modified_time: driveModifiedTime } : {}),
          }).eq("id", cfg.id);
          runs.push({
            runId, configId: cfg.id,
            status: escalation?.status === "auto_applied" ? "auto_applied" : "success",
            new: newRows.length, removed: removedRows.length, conflicts: conflictRows.length,
            auto: autoCount, review: reviewCount,
            escalation,
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
          ...(driveModifiedTime ? { last_modified_time: driveModifiedTime } : {}),
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
