import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sends a Web Push notification to one or more users.
 *
 * Body:
 * - user_ids: string[]           — target users (if empty, sends to all admin/manager users)
 * - title: string                — notification title
 * - body: string                 — notification body
 * - url?: string                 — URL to open on click
 * - badge_count?: number         — badge count for the app icon
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate caller is admin/manager
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Multi-tenant: resolve caller's active company; restrict push delivery to that tenant.
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("company_id, active_company_id")
      .eq("id", user.id)
      .maybeSingle();
    const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: user.id });
    const isPlatformAdmin = Boolean(isPaRow);
    const callerCompanyId = isPlatformAdmin
      ? (callerProfile?.active_company_id ?? callerProfile?.company_id ?? null)
      : (callerProfile?.company_id ?? null);

    const { user_ids, title, body, url, badge_count } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "title e body são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get subscriptions — ALWAYS filter by caller's company to prevent cross-tenant push.
    // Platform admin without active company falls back to no filter (rare; backups/system).
    let query = adminClient.from("push_subscriptions").select("*");
    if (callerCompanyId) {
      query = query.eq("company_id", callerCompanyId);
    } else if (!isPlatformAdmin) {
      // Caller has no company and is not platform admin → reject.
      return new Response(JSON.stringify({ error: "Caller has no company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }
    const { data: subscriptions, error: subError } = await query;

    if (subError) {
      return new Response(JSON.stringify({ error: subError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "Nenhuma subscrição encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      // Default to 0 (= clear badge) when caller doesn't provide a count.
      // Senders that want to bump the badge must compute the real pending
      // count (e.g. payment lists awaiting approval) and pass it in.
      badge_count: typeof badge_count === "number" ? badge_count : 0,
    });

    // Import web-push compatible library for Deno
    const webPush = await import("npm:web-push@3.6.7");

    webPush.setVapidDetails(
      `mailto:noreply@${new URL(supabaseUrl).hostname}`,
      vapidPublicKey,
      vapidPrivateKey
    );

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webPush.sendNotification(pushSubscription, payload);
        sent++;
      } catch (err: any) {
        failed++;
        // If subscription is expired or invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
        console.error(`Push failed for ${sub.endpoint}:`, err.message);
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        cleaned: expiredEndpoints.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Push notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
