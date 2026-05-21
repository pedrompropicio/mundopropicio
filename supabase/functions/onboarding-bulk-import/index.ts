// onboarding-bulk-import — admin-only. Cria/atribui profiles em lote para uma company.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ROLES = new Set(["producer", "field_producer"]);
const PROFILE_TYPES = new Set(["user", "field_staff"]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x") + "Aa1!";
}

type Person = {
  full_name: string;
  email: string;
  phone?: string | null;
  role: "producer" | "field_producer";
  profile_type?: "user" | "field_staff";
  is_operacao_only?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
    const jwt = authHeader.slice(7);

    const anonClient = createClient(url, anonKey);
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(url, serviceKey);

    // Authorization: platform_admin OR admin/manager role
    const { data: isPlatform } = await admin.rpc("is_platform_admin", { _user_id: callerId });
    let allowed = !!isPlatform;
    if (!allowed) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .in("role", ["admin", "manager"]);
      allowed = (roleRows ?? []).length > 0;
    }
    if (!allowed) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const company_id = body?.company_id;
    const people: Person[] = Array.isArray(body?.people) ? body.people : [];

    if (!company_id || typeof company_id !== "string" || !UUID_RE.test(company_id)) {
      return json(400, { error: "invalid_company_id" });
    }
    if (!people.length) return json(400, { error: "empty_people_list" });

    const origin = req.headers.get("origin") ?? "";
    const siteUrl = Deno.env.get("SITE_URL") ?? origin ?? "";

    const results: any[] = [];
    let created = 0, attached = 0, errors = 0;

    for (const p of people) {
      const full_name = (p?.full_name ?? "").trim();
      const emailRaw = (p?.email ?? "").trim();
      const email = emailRaw.toLowerCase();
      const phone = p?.phone ?? null;
      const role = p?.role;
      const profile_type = p?.profile_type ?? "user";
      const is_operacao_only = p?.is_operacao_only ?? true;

      try {
        if (!email) throw new Error("empty_email");
        if (!EMAIL_RE.test(email)) throw new Error("invalid_email");
        if (!full_name) throw new Error("missing_full_name");
        if (!APP_ROLES.has(role)) throw new Error("invalid_role");
        if (!PROFILE_TYPES.has(profile_type)) throw new Error("invalid_profile_type");

        // Lookup case-insensitive (profiles.email é mantido em sync via trigger)
        const { data: existing } = await admin
          .from("profiles")
          .select("id, email")
          .ilike("email", email)
          .maybeSingle();

        if (existing) {
          const { error: upErr } = await admin
            .from("user_roles")
            .upsert(
              { user_id: existing.id, role, company_id },
              { onConflict: "user_id,role,company_id", ignoreDuplicates: true },
            );
          if (upErr) throw new Error(`attach_role_failed: ${upErr.message}`);

          attached++;
          results.push({
            email,
            full_name,
            status: "attached",
            user_id: existing.id,
          });
          console.log(`[bulk-import] attached ${email} → ${existing.id}`);
          continue;
        }

        // Criar novo user
        const { data: createData, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: false,
          user_metadata: { full_name, company_id },
        });
        if (createErr || !createData?.user) {
          throw new Error(`create_user_failed: ${createErr?.message ?? "no_user"}`);
        }
        const userId = createData.user.id;

        // Limpar role 'user' default criada pelo trigger (se aplicável)
        await admin
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "user")
          .eq("company_id", company_id);

        // Atribuir role correta
        const { error: roleErr } = await admin
          .from("user_roles")
          .upsert(
            { user_id: userId, role, company_id },
            { onConflict: "user_id,role,company_id", ignoreDuplicates: true },
          );
        if (roleErr) throw new Error(`assign_role_failed: ${roleErr.message}`);

        // Update profile: phone, profile_type, is_operacao_only, token
        const { data: updated, error: updErr } = await admin
          .from("profiles")
          .update({
            phone,
            profile_type,
            is_operacao_only,
            first_access_token: crypto.randomUUID(),
          })
          .eq("id", userId)
          .select("first_access_token")
          .single();
        if (updErr || !updated?.first_access_token) {
          throw new Error(`profile_update_failed: ${updErr?.message ?? "no_token"}`);
        }

        const token = updated.first_access_token;
        const link = `${siteUrl}/operacao/onboarding?token=${token}`;

        created++;
        results.push({
          email,
          full_name,
          status: "created",
          user_id: userId,
          first_access_token: token,
          onboarding_link: link,
        });
        console.log(`[bulk-import] created ${email} → ${userId}`);
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bulk-import] error for ${emailRaw}:`, msg);
        results.push({ email, full_name, status: "error", error: msg });
      }
    }

    return json(200, { ok: true, results, summary: { created, attached, errors } });
  } catch (e) {
    console.error("onboarding-bulk-import fatal", e);
    return json(500, { error: String(e) });
  }
});
