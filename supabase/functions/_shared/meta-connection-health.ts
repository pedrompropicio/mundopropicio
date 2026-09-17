// meta-connection-health — Issue #36: a ligação Meta não pode morrer em silêncio.
//
// Único sítio onde as edge functions de sync Meta escrevem saúde da ligação em
// crm.ad_platform_connections. Usa só colunas que já existem
// (status, consecutive_failures, last_error, last_validated_at).
//
// Regras (ver .lovable/memory/features/mp-audience-connection-health.md):
//   a) erro de autenticação da Graph API → status = 'expired' à primeira vez
//   b) erro transitório → só consecutive_failures + 1; a 6 falhas → status = 'error'
//   c) sucesso → consecutive_failures = 0, last_error = null, last_validated_at = now();
//      'error' volta a 'active'; 'expired'/'revoked'/'disconnected' NUNCA sobem por aqui
//   d) promover a 'active' a partir de 'expired'/'revoked'/'disconnected' só na
//      reconexão OAuth (crm.upsert_meta_connection / upsert_artist_meta_connection)
//
// Regra dura: este registo NUNCA pode fazer a sincronização falhar. Qualquer erro
// é apenas escrito no log. Nunca escreve tokens.
//
// A regra é igual para ligações de empresa e para connection_scope = 'artist'.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

/** Nº de falhas transitórias seguidas a partir do qual a ligação fica 'error'. */
export const TRANSIENT_FAILURE_THRESHOLD = 6;

/** Subcódigos Meta de sessão invalidada / expirada / password mudada. */
const AUTH_SUBCODES = new Set([458, 459, 460, 463, 464, 467, 492, 493, 495]);

/** Códigos Meta de limite de pedidos / uso da API (transitórios). */
const TRANSIENT_CODES = new Set([4, 17, 32, 613]);

export type MetaFailureKind = "auth" | "transient" | "other";

export interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

export interface FailureInput {
  /** Objecto `error` devolvido pela Graph API, quando existe. */
  metaError?: MetaGraphError | null;
  /** Status HTTP da resposta, quando existe. */
  httpStatus?: number | null;
  /** Excepção apanhada / mensagem de erro (ex.: falha de upsert, timeout). */
  thrown?: unknown;
}

function textOf(input: FailureInput): string {
  const parts = [
    input.metaError?.message ?? "",
    input.thrown instanceof Error ? input.thrown.message : input.thrown ? String(input.thrown) : "",
  ];
  return parts.join(" ").trim();
}

/** Classifica a falha sem nunca lançar. */
export function classifyMetaFailure(input: FailureInput): MetaFailureKind {
  const e = input.metaError ?? null;
  const msg = textOf(input).toLowerCase();

  const code = typeof e?.code === "number" ? e.code : null;
  const sub = typeof e?.error_subcode === "number" ? e.error_subcode : null;
  const type = (e?.type ?? "").toLowerCase();

  // (a) autenticação
  if (code === 190) return "auth";
  if (sub !== null && AUTH_SUBCODES.has(sub)) return "auth";
  if (
    type === "oauthexception" &&
    /expired|session|invalid.*(token|oauth)|token.*invalid|re-?authenticate|not authorized/.test(msg)
  ) {
    return "auth";
  }
  // Erros lançados como texto (fetchAllPages faz throw da mensagem da Meta).
  if (/error validating access token|access token.*(expired|invalid)|oauthexception.*190/.test(msg)) {
    return "auth";
  }

  // (b) transitório
  if (code !== null && TRANSIENT_CODES.has(code)) return "transient";
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) return "transient";
  if (/\bhttp 5\d\d\b/.test(msg)) return "transient";
  if (/timeout|timed out|aborted|econnreset|network|fetch failed|rate limit|too many calls|request limit/.test(msg)) {
    return "transient";
  }

  return "other";
}

/** Mensagem curta a guardar em last_error (nunca tokens). */
function errorText(input: FailureInput): string {
  const raw = textOf(input) ||
    (input.httpStatus ? `HTTP ${input.httpStatus}` : "erro desconhecido no sync Meta");
  // Defesa: remove qualquer access_token= que apareça em URLs dentro da mensagem.
  return raw.replace(/access_token=[^\s&"']+/gi, "access_token=***").slice(0, 500);
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function readConnection(admin: ReturnType<typeof adminClient>, connectionId: string) {
  const { data, error } = await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select("id, status, consecutive_failures")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as { id: string; status: string; consecutive_failures: number | null } | null;
}

export interface FailureResult {
  kind: MetaFailureKind;
  status: string | null;
  consecutive_failures: number | null;
}

/**
 * Regista uma falha de sync na ligação. `level` só serve para o log.
 * Nunca lança.
 */
export async function reportMetaSyncFailure(
  connectionId: string,
  level: string,
  input: FailureInput,
): Promise<FailureResult> {
  const kind = classifyMetaFailure(input);
  const last_error = errorText(input);
  try {
    const admin = adminClient();
    const conn = await readConnection(admin, connectionId);
    if (!conn) {
      console.error(`[meta-connection-health] ${level}: ligação ${connectionId} não encontrada`);
      return { kind, status: null, consecutive_failures: null };
    }
    const failures = (conn.consecutive_failures ?? 0) + 1;
    const patch: Record<string, unknown> = { last_error, consecutive_failures: failures };

    if (kind === "auth") {
      // (a) imediato, à primeira ocorrência.
      patch.status = "expired";
    } else if (kind === "transient" && failures >= TRANSIENT_FAILURE_THRESHOLD) {
      // (b) só depois do limiar, e nunca sobrepõe um estado terminal.
      if (conn.status === "active") patch.status = "error";
    }

    const { error } = await (admin as any)
      .schema("crm")
      .from("ad_platform_connections")
      .update(patch)
      .eq("id", connectionId);
    if (error) throw error;

    console.log(
      `[meta-connection-health] ${level}: kind=${kind} failures=${failures} status=${patch.status ?? conn.status}`,
    );
    return { kind, status: (patch.status as string) ?? conn.status, consecutive_failures: failures };
  } catch (e) {
    console.error("[meta-connection-health] falha ao registar erro:", (e as Error)?.message ?? e);
    return { kind, status: null, consecutive_failures: null };
  }
}

/**
 * Regista um sync com sucesso: zera o contador, limpa o erro e marca validação.
 * 'error' (falhas transitórias) volta a 'active'. 'expired'/'revoked'/
 * 'disconnected' ficam intactos — só a reconexão OAuth os promove.
 * Nunca lança.
 */
export async function reportMetaSyncSuccess(
  connectionId: string,
  level: string,
): Promise<void> {
  try {
    const admin = adminClient();
    const conn = await readConnection(admin, connectionId);
    if (!conn) {
      console.error(`[meta-connection-health] ${level}: ligação ${connectionId} não encontrada`);
      return;
    }
    const patch: Record<string, unknown> = {
      consecutive_failures: 0,
      last_error: null,
      last_validated_at: new Date().toISOString(),
    };
    if (conn.status === "error") patch.status = "active";

    const { error } = await (admin as any)
      .schema("crm")
      .from("ad_platform_connections")
      .update(patch)
      .eq("id", connectionId);
    if (error) throw error;
  } catch (e) {
    console.error("[meta-connection-health] falha ao registar sucesso:", (e as Error)?.message ?? e);
  }
}
