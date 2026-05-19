import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsApp } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Target =
  | { type: "users"; user_ids: string[] }
  | { type: "frente_team"; frente_id: string }
  | { type: "company_admins"; company_id: string };

async function resolveTargetUserIds(
  admin: ReturnType<typeof createClient>,
  target: Target | null,
  fallbackUserIds: string[] | undefined,
): Promise<string[]> {
  if (target?.type === "users") return target.user_ids ?? [];
  if (target?.type === "frente_team") {
    const ids = new Set<string>();
    const { data: team } = await admin
      .from("operacao_frente_team")
      .select("profile_id")
      .eq("frente_id", target.frente_id)
      .eq("active", true);
    (team ?? []).forEach((t: any) => t.profile_id && ids.add(t.profile_id));
    const { data: fr } = await admin
      .from("operacao_frentes")
      .select("current_lead_id")
      .eq("id", target.frente_id)
      .maybeSingle();
    if (fr?.current_lead_id) ids.add(fr.current_lead_id);
    return Array.from(ids);
  }
  if (target?.type === "company_admins") {
    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("company_id", target.company_id)
      .in("role", ["admin", "manager"]);
    return Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
  }
  return fallbackUserIds ?? [];
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    let isServiceRole = false;
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (p.length % 4) p += "=";
        const payload = JSON.parse(atob(p));
        if (payload?.role === "service_role") isServiceRole = true;
      }
    } catch { /* ignore */ }

    let callerCompanyId: string | null = null;
    let isPlatformAdmin = false;
    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await callerClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: callerProfile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", user.id).maybeSingle();
      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: user.id });
      isPlatformAdmin = Boolean(isPaRow);
      callerCompanyId = isPlatformAdmin
        ? ((callerProfile as any)?.active_company_id ?? (callerProfile as any)?.company_id ?? null)
        : ((callerProfile as any)?.company_id ?? null);
    }

    const body = await req.json();
    const { user_ids, title, body: messageBody, url, badge_count, target, whatsapp } = body;

    if (!title || !messageBody) {
      return new Response(JSON.stringify({ error: "title e body são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target into user_ids
    const resolvedUserIds = await resolveTargetUserIds(adminClient, target ?? null, user_ids);

    if (resolvedUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "Sem destinatários" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch push subscriptions filtered by company when caller is a user
    let query = adminClient.from("push_subscriptions").select("*").in("user_id", resolvedUserIds);
    if (!isServiceRole) {
      if (callerCompanyId) {
        query = query.eq("company_id", callerCompanyId);
      } else if (!isPlatformAdmin) {
        return new Response(JSON.stringify({ error: "Caller has no company" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const { data: subscriptions, error: subError } = await query;
    if (subError) {
      return new Response(JSON.stringify({ error: subError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title, body: messageBody, url: url || "/",
      badge_count: typeof badge_count === "number" ? badge_count : 0,
    });

    const webPush = await import("npm:web-push@3.6.7");
    webPush.setVapidDetails(
      `mailto:noreply@${new URL(supabaseUrl).hostname}`,
      vapidPublicKey, vapidPrivateKey,
    );

    let sent = 0, failed = 0;
    const expiredEndpoints: string[] = [];
    for (const sub of subscriptions ?? []) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) expiredEndpoints.push(sub.endpoint);
        console.error(`Push failed for ${sub.endpoint}:`, err.message);
      }
    }
    if (expiredEndpoints.length > 0) {
      await adminClient.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    // WhatsApp leg (optional)
    let waSent = 0, waFailed = 0;
    if (whatsapp === true) {
      const { data: settings } = await adminClient
        .from("system_reminder_settings").select("default_twilio_from").eq("id", 1).maybeSingle();
      const fromOverride = (settings as any)?.default_twilio_from || undefined;

      const { data: profiles } = await adminClient
        .from("profiles").select("id, phone, full_name").in("id", resolvedUserIds);
      const waBody = `🚨 ${title}\n${messageBody}${url ? `\n${url}` : ""}`;
      for (const p of (profiles ?? []) as any[]) {
        if (!p.phone) continue;
        try {
          await sendWhatsApp(p.phone, waBody, fromOverride);
          waSent++;
        } catch (err) {
          waFailed++;
          console.error(`WhatsApp failed for ${p.id}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true, sent, failed, cleaned: expiredEndpoints.length,
      whatsapp: whatsapp ? { sent: waSent, failed: waFailed } : undefined,
      resolved_user_count: resolvedUserIds.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Push notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
