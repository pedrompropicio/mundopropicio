// Temp read-only: GET status,effective_status da campanha e dos 2 conjuntos.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CONNECTION_ID = "d7497955-7d67-41f0-a4d2-e4cd9a0ca4c6";
const OBJECTS = ["120250057238210176", "120250057238670176", "120250063964740176"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Auth: JWT + admin/platform_admin
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "missing token" }, 401);
  let userId: string | null = null;
  try {
    const { data } = await admin.auth.getUser(bearer);
    userId = data?.user?.id ?? null;
  } catch (_e) { /* ignore */ }
  if (!userId) return json({ ok: false, error: "invalid token" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  if (!roleList.includes("admin") && !roleList.includes("platform_admin")) {
    return json({ ok: false, error: "insufficient role" }, 403);
  }

  // Token da ligação
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return json({ ok: false, error: "missing ENCRYPTION_MASTER_KEY" }, 500);
  const { data: tok, error: tokErr } = await admin.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: CONNECTION_ID,
    p_master_key: masterKey,
  });
  if (tokErr || !tok?.token) {
    return json({ ok: false, error: "token decrypt failed", detail: tokErr?.message ?? tok }, 500);
  }

  const results: Record<string, unknown> = {};
  for (const id of OBJECTS) {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${id}?fields=id,name,status,effective_status&access_token=${encodeURIComponent(tok.token)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
    );
    results[id] = { status: res.status, body: await res.json().catch(() => null) };
  }
  return json({ ok: true, results });
});
