// onboarding-preview — público. Lê token e devolve nome + email mascarado + branding da empresa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function maskEmail(email: string | null): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  if (user.length <= 2) return user[0] + "***@" + domain;
  return user[0] + "***" + user[user.length - 1] + "@" + domain;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string" || !UUID_RE.test(token)) {
      return json(400, { error: "invalid_token_format" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, first_access_consumed_at, company_id")
      .eq("first_access_token", token)
      .maybeSingle();

    if (!profile) return json(404, { error: "invalid_token" });
    if (profile.first_access_consumed_at) return json(410, { error: "token_consumed" });

    let company: { display_name: string | null; logo_url: string | null } | null = null;
    if (profile.company_id) {
      const { data: c } = await admin
        .from("companies")
        .select("display_name, legal_name, logo_url")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (c) {
        company = {
          display_name: c.display_name ?? c.legal_name ?? null,
          logo_url: c.logo_url ?? null,
        };
      }
    }

    return json(200, {
      full_name: profile.full_name,
      email_masked: maskEmail(profile.email),
      company,
    });
  } catch (e) {
    console.error("onboarding-preview error", e);
    return json(500, { error: String(e) });
  }
});
