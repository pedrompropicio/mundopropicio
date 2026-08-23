// send-staff-invite — reenvia convite WhatsApp para um profile field_staff existente.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsApp } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendInviteWhatsApp(
  to: string, fullName: string, companyName: string, appUrl: string, token: string,
) {
  const body =
    `Olá ${fullName}! Foste convidado para a equipa de produção do ${companyName}.\n` +
    `Acede ao app aqui: ${appUrl}/operacao/accept-invite?token=${token}\n` +
    `O link expira em 14 dias.`;
  const { sid } = await sendWhatsApp(to, body);
  return sid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: corsHeaders });
    const { data: hasPerm } = await userClient.rpc("has_permission", { _user_id: user.id, _permission: "manage_operacao_staff" });
    if (!hasPerm) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const { profile_id } = await req.json();
    if (!profile_id) return new Response(JSON.stringify({ error: "profile_id required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(url, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, phone, company_id, profile_type")
      .eq("id", profile_id).maybeSingle();

    if (!profile) return new Response(JSON.stringify({ error: "profile_not_found" }), { status: 404, headers: corsHeaders });
    if (profile.profile_type !== "field_staff") {
      return new Response(JSON.stringify({ error: "not_field_staff" }), { status: 400, headers: corsHeaders });
    }
    if (!profile.phone) return new Response(JSON.stringify({ error: "no_phone" }), { status: 400, headers: corsHeaders });

    const { data: company } = await admin.from("companies").select("display_name").eq("id", profile.company_id).maybeSingle();
    const companyName = company?.display_name ?? "equipa";

    // Reusar invite pendente ainda válido OU criar novo
    const { data: existing } = await admin
      .from("operacao_staff_invites")
      .select("id, token, expires_at, send_count")
      .eq("profile_id", profile_id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let inviteId: string; let token: string; let expiresAt: string; let sendCount: number;

    if (existing) {
      inviteId = existing.id;
      token = existing.token;
      expiresAt = existing.expires_at;
      sendCount = (existing.send_count ?? 0) + 1;
    } else {
      const { data: fresh, error: fErr } = await admin
        .from("operacao_staff_invites")
        .insert({
          profile_id,
          company_id: profile.company_id,
          created_by_profile_id: user.id,
        })
        .select("id, token, expires_at")
        .single();
      if (fErr) return new Response(JSON.stringify({ error: fErr.message }), { status: 500, headers: corsHeaders });
      inviteId = fresh.id; token = fresh.token; expiresAt = fresh.expires_at; sendCount = 1;
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://mpgestaoeventos.com";
    const sid = await sendInviteWhatsApp(profile.phone, profile.full_name, companyName, appUrl, token);
    await admin.from("operacao_staff_invites").update({
      sent_at: new Date().toISOString(),
      send_count: sendCount,
    }).eq("id", inviteId);

    return new Response(JSON.stringify({
      success: true, invite_id: inviteId, expires_at: expiresAt, twilio_sid: sid,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
