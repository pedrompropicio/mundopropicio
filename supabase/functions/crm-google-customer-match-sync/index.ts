// crm-google-customer-match-sync
//
// Pipeline de PREPARAÇÃO de membros Customer Match (parte durável,
// independente do transporte). NÃO faz chamadas de rede à Google.
// O envio real fica para um adaptador futuro (Data Manager API).
//
// Auth caller: padrão v2-cronauth — service_role bypass via decode manual do
// JWT; senão has_role admin.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const MP_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const CUSTOMER_ID = "2200043144";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(
    "[crm-google-customer-match-sync] BUILD_VERSION=customer-match-sync-v1",
    new Date().toISOString(),
  );

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Service_role bypass (cron) — decode manual do payload.
  let isServiceRole = false;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload?.role === "service_role") isServiceRole = true;
    }
  } catch {
    // ignora — cai no caminho admin
  }

  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- 1) Body opcional ----------
  let body: { user_list_id?: string } = {};
  try {
    const txt = await req.text();
    if (txt) body = JSON.parse(txt);
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  // ---------- 2) Resolver user list alvo ----------
  let targetListId: string | null = null;
  {
    const q = admin
      .schema("crm")
      .from("google_user_list")
      .select("id, company_id")
      .eq("company_id", MP_COMPANY_ID);

    if (body.user_list_id) {
      const { data, error } = await q.eq("id", body.user_list_id).maybeSingle();
      if (error) {
        return json({ error: "fetch_list_failed", detail: error.message }, 500);
      }
      if (!data) return json({ error: "no_user_list" }, 404);
      targetListId = (data as { id: string }).id;
    } else {
      const { data, error } = await q
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) {
        return json({ error: "fetch_list_failed", detail: error.message }, 500);
      }
      if (!data || data.length === 0) {
        return json({ error: "no_user_list" }, 404);
      }
      targetListId = (data[0] as { id: string }).id;
    }
  }

  // ---------- 3) Detetar coluna de company em public.lead_capture ----------
  let leadCaptureHasCompany = false;
  {
    const { data, error } = await admin
      .from("information_schema.columns" as never)
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "lead_capture");
    if (!error && Array.isArray(data)) {
      leadCaptureHasCompany = data.some((r: { column_name: string }) =>
        r.column_name === "company_id"
      );
    }
    // fallback silencioso: se a query falhar, assume single-tenant (false)
  }

  // ---------- 4) Ler leads elegíveis ----------
  let query = admin
    .from("lead_capture")
    .select("id, email")
    .eq("consent_email", true)
    .not("email", "is", null)
    .neq("email", "");

  if (leadCaptureHasCompany) {
    query = (query as never as { eq: (c: string, v: string) => typeof query })
      .eq("company_id", MP_COMPANY_ID);
  }

  const { data: leads, error: leadsErr } = await query;
  if (leadsErr) {
    return json({ error: "fetch_leads_failed", detail: leadsErr.message }, 500);
  }

  const eligible = leads?.length ?? 0;

  // ---------- 5) Normalizar + hashear + dedup (em memória, sem persistir) ----------
  const seenLeadIds = new Set<string>();
  const seenHashes = new Set<string>();
  let hashed = 0;
  let deduped = 0;

  for (const row of (leads ?? []) as Array<{ id: string; email: string }>) {
    if (seenLeadIds.has(row.id)) {
      deduped++;
      continue;
    }
    seenLeadIds.add(row.id);

    const norm = (row.email ?? "").trim().toLowerCase();
    if (!norm) continue;

    const h = await sha256Hex(norm);
    hashed++;
    if (seenHashes.has(h)) {
      deduped++;
      continue;
    }
    seenHashes.add(h);
  }

  const prepared = seenHashes.size;
  const nowIso = new Date().toISOString();

  // ---------- 6) Inserir job (só contagens, nunca emails/hashes) ----------
  const { data: jobIns, error: jobErr } = await admin
    .schema("crm")
    .from("google_user_list_job")
    .insert({
      company_id: MP_COMPANY_ID,
      user_list_id: targetListId,
      operation: "add",
      members_submitted: prepared,
      status: "pending",
      raw: {
        eligible,
        hashed,
        deduped,
        prepared,
        transport: "data_manager_pending",
      },
    })
    .select("id")
    .single();

  if (jobErr) {
    return json({ error: "job_insert_failed", detail: jobErr.message }, 500);
  }

  // ---------- 7) Atualizar user_list ----------
  const { error: upErr } = await admin
    .schema("crm")
    .from("google_user_list")
    .update({
      member_count: prepared,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", targetListId);

  if (upErr) {
    return json({
      error: "user_list_update_failed",
      detail: upErr.message,
      job_id: (jobIns as { id: string }).id,
    }, 500);
  }

  return json({
    user_list_id: targetListId,
    eligible,
    hashed,
    deduped,
    prepared,
    job_id: (jobIns as { id: string }).id,
    transport: "data_manager_pending",
    message:
      "Membros preparados e em fila; envio à Google fica pendente do adaptador Data Manager API e do gate de acesso.",
    customer_id: CUSTOMER_ID,
  });
});
