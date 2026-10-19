// capi-v2-send (#322 opção A) — lógica testável sem rede.
// Envio CAPI por prova de consentimento: Lead, CompleteRegistration, ClubeConfirmado.
// NUNCA loga PII; email/telefone só como SHA-256; token Meta nunca no código nem em logs.

export const GRAPH_API_VERSION = "v25.0";
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
export const MAX_ATTEMPTS = 5;
export const MAX_AGE_DAYS = 6;
export const BATCH_SIZE = 100;
export const DEFAULT_TOKEN_SECRET = "META_CAPI_ACCESS_TOKEN";
// Erros de configuração/permissão da Graph: os eventos NÃO são queimados —
// ficam em retry daqui a 60 min sem consumir tentativas e o pixel pára nessa execução.
export const CONFIG_RETRY_MINUTES = 60;

export type CapiV2Row = {
  id: string;
  source_table: string; // 'lead_capture' | 'club_members'
  source_id: string;
  pixel_id: string;
  event_name: string; // 'Lead' | 'CompleteRegistration' | 'ClubeConfirmado'
  event_id: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
};

export type LeadSource = {
  id: string;
  email: string | null;
  phone: string | null;
  fbc: string | null;
  fbp: string | null;
  ip_inet: string | null;
  user_agent: string | null;
  created_at: string;
  event_slug: string | null;
  consent_subject_id: string | null;
  consent_event_id: number | null;
  consent_portal: string | null;
  company_id: string | null;
  raw: Record<string, unknown> | null;
};

export type MemberSource = {
  id: string;
  email: string | null;
  phone: string | null;
  member_no: number;
  confirmed_at: string | null;
};

// ---------- helpers puros ----------

export async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const normEmail = (e: string): string => e.trim().toLowerCase();
export const normPhone = (p: string): string => p.replace(/[^\d]/g, ""); // E.164 sem '+'

export function epochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export function isOlderThanMaxAge(iso: string, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() > MAX_AGE_DAYS * 24 * 3600 * 1000;
}

export function nextBackoff(attemptsAfterFail: number, now: Date): string | null {
  const idx = Math.min(attemptsAfterFail, BACKOFF_MINUTES.length) - 1;
  if (idx < 0) return null;
  return new Date(now.getTime() + BACKOFF_MINUTES[idx] * 60_000).toISOString();
}

export type GraphOutcome =
  | { kind: "ok"; fbtrace_id: string | null }
  | { kind: "transient"; http_status: number | null; error_code: string }
  | { kind: "config"; http_status: number; error_code: string; error_subcode: string | null; message: string | null; fbtrace_id: string | null }
  | { kind: "terminal"; http_status: number; error_code: string; error_subcode: string | null; message: string | null; fbtrace_id: string | null };

/** Erros de configuração/permissão da Graph (não queimam eventos). */
export function isConfigError(code: number | null, subcode: number | null): boolean {
  if (code == null) return false;
  if (code === 100 && subcode === 33) return true; // objeto inexistente/sem permissões (token sem acesso ao pixel)
  if (code === 190 || code === 10) return true; // token inválido/expirado; permissão insuficiente
  if (code >= 200 && code <= 299) return true; // permissões
  return false;
}

/** Classifica a resposta SÍNCRONA do Graph. events_received tem de igualar o nº enviado. */
export function classifyGraphResponse(status: number, parsed: any, sentCount: number): GraphOutcome {
  const fbtrace = parsed?.fbtrace_id != null ? String(parsed.fbtrace_id) : null;
  if (status >= 200 && status < 300) {
    if (parsed && Number(parsed.events_received) === sentCount && !parsed.error) {
      return { kind: "ok", fbtrace_id: fbtrace };
    }
    return { kind: "terminal", http_status: status, error_code: "events_received_mismatch", error_subcode: null, message: null, fbtrace_id: fbtrace };
  }
  const err = parsed?.error;
  const codeNum = err?.code != null ? Number(err.code) : null;
  const subNum = err?.error_subcode != null ? Number(err.error_subcode) : null;
  const code = err?.code != null ? String(err.code) : `http_${status}`;
  const subcode = subNum != null && Number.isFinite(subNum) ? String(subNum) : null;
  const message = typeof err?.message === "string" ? err.message.slice(0, 200) : null;
  if (status === 429 || status >= 500) {
    return { kind: "transient", http_status: status, error_code: code };
  }
  // Configuração/permissão (ex.: token sem acesso ao pixel) → NÃO terminal: retry sem consumir tentativas.
  if (isConfigError(codeNum, subNum)) {
    return { kind: "config", http_status: status, error_code: code, error_subcode: subcode, message, fbtrace_id: fbtrace };
  }
  // Restantes 4xx de validação do payload → terminal, com alerta.
  return { kind: "terminal", http_status: status, error_code: code, error_subcode: subcode, message, fbtrace_id: fbtrace };
}

/** user_data SEM PII: em/ph já vêm hasheados; Newgang sem anuncios-v1 chega sem em/ph. */
export function buildUserData(i: {
  fbc?: string | null; fbp?: string | null; ip?: string | null; ua?: string | null;
  emHash?: string | null; phHash?: string | null;
}): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (i.emHash) u.em = [i.emHash];
  if (i.phHash) u.ph = [i.phHash];
  if (i.fbc) u.fbc = i.fbc;
  if (i.fbp) u.fbp = i.fbp;
  if (i.ip) u.client_ip_address = i.ip;
  if (i.ua) u.client_user_agent = i.ua;
  return u;
}

export function buildGraphEvent(i: {
  event_name: string; event_id: string; event_time: number;
  event_source_url?: string; user_data: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    event_name: i.event_name,
    event_time: i.event_time,
    event_id: i.event_id,
    action_source: "website",
    ...(i.event_source_url ? { event_source_url: i.event_source_url } : {}),
    user_data: i.user_data,
  };
}

/** Origem do portal + path, sem query string. */
export function sourceUrl(portal: string | null, raw: Record<string, unknown> | null): string | undefined {
  const base = portal === "coala" ? "https://coalafestival.pt"
    : portal === "newgang" ? "https://newgangfestival.pt"
    : "https://www.mundopropicio.com";
  const p = raw && typeof raw.landing_url === "string" ? raw.landing_url : null;
  if (!p) return base;
  try {
    const u = new URL(p, base);
    return u.origin + u.pathname;
  } catch {
    return base;
  }
}

// ---------- handler ----------

export type SbLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

export type Deps = {
  sb: SbLike;
  fetchFn: typeof fetch;
  env: (k: string) => string | undefined;
  now: () => Date;
  isServiceRole: (req: Request) => Promise<boolean>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadCapiToken(env: (k: string) => string | undefined, sb: SbLike, secretName: string): Promise<string | null> {
  const envTok = env(secretName);
  if (envTok) return envTok;
  try {
    const { data, error } = await sb.rpc("get_vault_secret", { _name: secretName });
    if (error || data == null) return null;
    return typeof data === "string" ? data : String(data);
  } catch {
    return null;
  }
}

async function dispatchAllowed(sb: SbLike): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("capi_dispatch_allowed");
    if (error) return false;
    const v = Array.isArray(data) ? data[0] : data;
    return v === true;
  } catch {
    return false;
  }
}

/** Prova ainda válida no momento do envio (validação dupla #322). */
async function proofStillValid(sb: SbLike, lead: LeadSource): Promise<boolean> {
  if (!lead.consent_subject_id || lead.consent_event_id == null || !lead.company_id || !lead.consent_portal) return false;
  const { data, error } = await sb.rpc("marketing_consent_binding_valid", {
    p_subject: lead.consent_subject_id,
    p_event: lead.consent_event_id,
    p_company: lead.company_id,
    p_portal: lead.consent_portal,
    p_captured_at: lead.created_at,
  });
  if (error) return false;
  const v = Array.isArray(data) ? data[0] : data;
  return v === true;
}

async function buildPayloadForRow(sb: SbLike, row: CapiV2Row): Promise<
  | { ok: true; event: Record<string, unknown>; event_time: number }
  | { ok: false; reason: "expired" | "skipped_no_consent" | "source_missing" }
> {
  if (row.source_table === "lead_capture") {
    const { data, error } = await sb.from("lead_capture").select("*").eq("id", row.source_id).maybeSingle();
    if (error || !data) return { ok: false, reason: "source_missing" };
    const lead = data as LeadSource;
    if (isOlderThanMaxAge(lead.created_at, new Date())) return { ok: false, reason: "expired" };
    if (!(await proofStillValid(sb, lead))) return { ok: false, reason: "skipped_no_consent" };
    const portal = lead.consent_portal;
    let emHash: string | null = null;
    let phHash: string | null = null;
    if (portal === "newgang") {
      // Só com consentimento de anúncios meta_ads em vigor (#332).
      const { data: ok } = await sb.rpc("capi_v2_newgang_ads_ok", { p_email: lead.email ?? "" });
      const granted = (Array.isArray(ok) ? ok[0] : ok) === true;
      if (granted) {
        if (lead.email) emHash = await sha256Hex(normEmail(lead.email));
        if (lead.phone) phHash = await sha256Hex(normPhone(lead.phone));
      }
    } else {
      // Coala: política e banner já cobrem — incluir quando existirem.
      if (lead.email) emHash = await sha256Hex(normEmail(lead.email));
      if (lead.phone) phHash = await sha256Hex(normPhone(lead.phone));
    }
    const user_data = buildUserData({
      fbc: lead.fbc, fbp: lead.fbp, ip: lead.ip_inet, ua: lead.user_agent, emHash, phHash,
    });
    const et = epochSeconds(lead.created_at);
    return {
      ok: true,
      event_time: et,
      event: buildGraphEvent({
        event_name: row.event_name,
        event_id: row.event_id,
        event_time: et,
        event_source_url: sourceUrl(portal, lead.raw),
        user_data,
      }),
    };
  }

  if (row.source_table === "club_members") {
    const { data, error } = await sb.from("club_members").select("*").eq("id", row.source_id).maybeSingle();
    if (error || !data || !data.confirmed_at) return { ok: false, reason: "source_missing" };
    const m = data as MemberSource;
    if (isOlderThanMaxAge(m.confirmed_at!, new Date())) return { ok: false, reason: "expired" };
    // Elegível só se o membro confirmado tem lead_capture com prova válida (email normalizado).
    const { data: leads } = await sb.from("lead_capture").select("*")
      .ilike("email", normEmail(m.email ?? "")).not("consent_event_id", "is", null)
      .order("created_at", { ascending: false }).limit(5);
    let validLead: LeadSource | null = null;
    for (const l of (leads ?? []) as LeadSource[]) {
      if (normEmail(l.email ?? "") === normEmail(m.email ?? "") && (await proofStillValid(sb, l))) { validLead = l; break; }
    }
    if (!validLead) return { ok: false, reason: "skipped_no_consent" };
    let emHash: string | null = null;
    let phHash: string | null = null;
    const { data: ok } = await sb.rpc("capi_v2_newgang_ads_ok", { p_email: m.email ?? "" });
    if ((Array.isArray(ok) ? ok[0] : ok) === true) {
      if (m.email) emHash = await sha256Hex(normEmail(m.email));
      if (m.phone) phHash = await sha256Hex(normPhone(m.phone));
    }
    const user_data = buildUserData({
      fbc: validLead.fbc, fbp: validLead.fbp, ip: validLead.ip_inet, ua: validLead.user_agent, emHash, phHash,
    });
    const et = epochSeconds(m.confirmed_at!);
    return {
      ok: true,
      event_time: et,
      event: buildGraphEvent({
        event_name: "ClubeConfirmado",
        event_id: row.event_id, // clube_confirmado_<member_no>
        event_time: et,
        event_source_url: sourceUrl("newgang", validLead.raw),
        user_data,
      }),
    };
  }

  return { ok: false, reason: "source_missing" };
}

export function createHandler(deps: Deps) {
  const { sb, fetchFn, env, now, isServiceRole } = deps;

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!(await isServiceRole(req))) return json({ error: "service_role_only" }, 401);

    let body: any;
    try { body = JSON.parse(await req.text()); } catch { return json({ error: "invalid_json" }, 400); }
    const action = body?.action;
    if (!["health", "dry_run", "send"].includes(action)) return json({ error: "unknown_action" }, 400);

    const suspended = !(await dispatchAllowed(sb));

    // ---- health: valida configuração sem enviar nada ----
    if (action === "health") {
      const { data: targets } = await sb.from("capi_v2_targets").select("*");
      const counts: Record<string, number> = {};
      for (const st of ["pending", "sent", "retry", "failed_terminal", "expired", "skipped_no_consent"]) {
        const { count } = await sb.from("capi_v2_events").select("id", { count: "exact", head: true }).eq("status", st);
        counts[st] = count ?? 0;
      }
      const targetOut: unknown[] = [];
      let defaultPresent = false;
      for (const t of targets ?? []) {
        const secretName = typeof t.token_secret_name === "string" && t.token_secret_name.trim()
          ? t.token_secret_name.trim() : DEFAULT_TOKEN_SECRET;
        const tok = await loadCapiToken(env, sb, secretName);
        if (secretName === DEFAULT_TOKEN_SECRET) defaultPresent = tok != null;
        targetOut.push({
          event_slug: t.event_slug, portal: t.portal, pixel_id: t.pixel_id,
          enabled: t.enabled === true, start_at_set: t.start_at != null,
          token_secret: secretName === DEFAULT_TOKEN_SECRET ? "default" : "custom",
          token_present: tok != null,
          // Os dois pixels estão em Business Managers diferentes (Coala BM 309116999253914,
          // Newgang BM 661222725105902): o token pode não ter acesso aos dois; erros de
          // configuração/permissão param só esse pixel e não afetam o outro.
          note: "pixel_access_verified_only_on_send",
        });
      }
      return json({ ok: true, suspended, token_present: defaultPresent, targets: targetOut, counts });
    }

    // ---- dry_run: payloads que SERIAM enviados; NUNCA chama o Graph ----
    if (action === "dry_run") {
      const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);
      const { data: rows } = await sb.from("capi_v2_events").select("*")
        .in("status", ["pending", "retry"]).order("created_at", { ascending: false }).limit(limit);
      const out: unknown[] = [];
      for (const r of (rows ?? []) as CapiV2Row[]) {
        const p = await buildPayloadForRow(sb, r);
        out.push(p.ok === true
          ? { id: r.id, pixel_id: r.pixel_id, event: p.event } // em/ph já são hashes; sem token
          : { id: r.id, pixel_id: r.pixel_id, would_skip: p.reason });
      }
      return json({ ok: true, dry_run: true, suspended, rows: out.length, payloads: out });
    }

    // ---- send ----
    const confirmTest = body?.confirm_test === true;
    const overrideSuspension = body?.override_suspension_for_test === true;
    if (suspended && !(confirmTest && overrideSuspension)) {
      return json({ refused: true, reason: "suspended" }, 423);
    }
    let testEventCode: string | undefined;
    if (typeof body?.test_event_code === "string" && body.test_event_code.trim()) {
      if (!confirmTest) return json({ refused: true, reason: "test_event_code_requires_confirm_test" }, 400);
      testEventCode = body.test_event_code.trim().slice(0, 50);
    }

    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);
    const { data: targets } = await sb.from("capi_v2_targets").select("*");
    const targetByPixel = new Map<string, any>();
    for (const t of targets ?? []) targetByPixel.set(t.pixel_id, t);

    const { data: rows } = await sb.from("capi_v2_events").select("*")
      .in("status", ["pending", "retry"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now().toISOString()}`)
      .order("created_at", { ascending: true }).limit(limit);

    const result = { sent: 0, retry: 0, failed_terminal: 0, expired: 0, skipped_no_consent: 0, refused_targets: 0, config_blocked: 0, alerts: 0, batches: 0 };
    const pixels: Record<string, { last_error: { code: string; subcode: string | null; message: string | null } | null }> = {};
    const tokenCache = new Map<string, string | null>();
    const tokenFor = async (t: any): Promise<string | null> => {
      const name = typeof t?.token_secret_name === "string" && t.token_secret_name.trim()
        ? t.token_secret_name.trim() : DEFAULT_TOKEN_SECRET;
      if (!tokenCache.has(name)) tokenCache.set(name, await loadCapiToken(env, sb, name));
      return tokenCache.get(name) ?? null;
    };

    // Agrupa por pixel: 1 pixel por pedido, lotes ≤ 100.
    const byPixel = new Map<string, { row: CapiV2Row; event: Record<string, unknown> }[]>();
    for (const r of (rows ?? []) as CapiV2Row[]) {
      const t = targetByPixel.get(r.pixel_id);
      if (!t || t.enabled !== true || t.start_at == null) { result.refused_targets++; continue; }
      const p = await buildPayloadForRow(sb, r);
      if (p.ok === false) {
        const st = p.reason === "expired" ? "expired" : p.reason === "skipped_no_consent" ? "skipped_no_consent" : "failed_terminal";
        await sb.from("capi_v2_events").update({ status: st, error_code: p.reason }).eq("id", r.id).in("status", ["pending", "retry"]);
        if (st === "expired") result.expired++;
        else if (st === "skipped_no_consent") result.skipped_no_consent++;
        else result.failed_terminal++;
        continue;
      }
      const list = byPixel.get(r.pixel_id) ?? [];
      list.push({ row: r, event: p.event });
      byPixel.set(r.pixel_id, list);
    }

    for (const [pixelId, items] of byPixel) {
      const t = targetByPixel.get(pixelId);
      const token = await tokenFor(t);
      if (!token) {
        // Segredo em falta (por target ou por omissão): recusa o pixel SEM queimar eventos nem chamar a Graph.
        result.config_blocked += items.length;
        pixels[pixelId] = { last_error: { code: "missing_capi_token_for_target", subcode: null, message: null } };
        continue;
      }
      pixels[pixelId] = { last_error: null };
      let pixelStopped = false;
      for (let i = 0; i < items.length && !pixelStopped; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        result.batches++;
        const metaBody: Record<string, unknown> = {
          data: batch.map((b) => b.event),
          access_token: token,
        };
        if (testEventCode) metaBody.test_event_code = testEventCode;

        let outcome: GraphOutcome;
        try {
          const resp = await fetchFn(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(metaBody),
          });
          const text = await resp.text();
          let parsed: any = null;
          try { parsed = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }
          outcome = classifyGraphResponse(resp.status, parsed, batch.length);
        } catch (e) {
          outcome = { kind: "transient", http_status: null, error_code: "network" };
        }

        if (outcome.kind === "config") {
          // Configuração/permissão: eventos ficam em retry daqui a 60 min SEM consumir tentativas;
          // UM alerta por pixel e por execução; o processamento deste pixel pára nesta execução.
          result.config_blocked += batch.length;
          pixels[pixelId] = { last_error: { code: outcome.error_code, subcode: outcome.error_subcode, message: outcome.message } };
          const retryAt = new Date(now().getTime() + CONFIG_RETRY_MINUTES * 60_000).toISOString();
          for (const b of batch) {
            await sb.from("capi_v2_events").update({
              status: "retry", next_attempt_at: retryAt,
              http_status: outcome.http_status, error_code: outcome.error_code,
            }).eq("id", b.row.id).in("status", ["pending", "retry"]);
          }
          const a = await sb.from("capi_alerts").insert({
            source: "capi-v2-send", lead_id: null, kind: "capi_v2_config",
            meta_code: outcome.http_status,
            meta_subcode: outcome.error_subcode != null ? Number(outcome.error_subcode) : null,
            detail: `pixel=${pixelId} code=${outcome.error_code} subcode=${outcome.error_subcode ?? "n/a"} msg=${outcome.message ?? "n/a"} fbtrace=${outcome.fbtrace_id ?? "n/a"}`.slice(0, 300),
          });
          if (!a?.error) result.alerts++;
          pixelStopped = true;
          continue;
        }

        for (const b of batch) {
          if (outcome.kind === "ok") {
            result.sent++;
            await sb.from("capi_v2_events").update({
              status: "sent", sent_at: now().toISOString(), fbtrace_id: outcome.fbtrace_id,
              http_status: 200, attempts: b.row.attempts + 1, error_code: null,
            }).eq("id", b.row.id).in("status", ["pending", "retry"]);
          } else if (outcome.kind === "transient") {
            const attempts = b.row.attempts + 1;
            if (attempts >= MAX_ATTEMPTS) {
              result.failed_terminal++;
              await sb.from("capi_v2_events").update({
                status: "failed_terminal", attempts, http_status: outcome.http_status, error_code: outcome.error_code,
              }).eq("id", b.row.id).in("status", ["pending", "retry"]);
            } else {
              result.retry++;
              await sb.from("capi_v2_events").update({
                status: "retry", attempts, next_attempt_at: nextBackoff(attempts, now()),
                http_status: outcome.http_status, error_code: outcome.error_code,
              }).eq("id", b.row.id).in("status", ["pending", "retry"]);
            }
          } else {
            result.failed_terminal++;
            pixels[pixelId] = { last_error: { code: outcome.error_code, subcode: outcome.error_subcode, message: outcome.message } };
            await sb.from("capi_v2_events").update({
              status: "failed_terminal", attempts: b.row.attempts + 1,
              http_status: outcome.http_status, error_code: outcome.error_code, fbtrace_id: outcome.fbtrace_id,
            }).eq("id", b.row.id).in("status", ["pending", "retry"]);
            // Alerta sem PII: pixel, código, subcódigo, mensagem truncada e fbtrace.
            const a = await sb.from("capi_alerts").insert({
              source: "capi-v2-send", lead_id: null, kind: "capi_v2_terminal",
              meta_code: outcome.http_status,
              meta_subcode: outcome.error_subcode != null ? Number(outcome.error_subcode) : null,
              detail: `pixel=${pixelId} code=${outcome.error_code} subcode=${outcome.error_subcode ?? "n/a"} msg=${outcome.message ?? "n/a"} fbtrace=${outcome.fbtrace_id ?? "n/a"}`.slice(0, 300),
            });
            if (!a?.error) result.alerts++;
          }
        }
      }
    }

    return json({ ok: true, suspended, test_mode: testEventCode != null, ...result, pixels });
  };
}
