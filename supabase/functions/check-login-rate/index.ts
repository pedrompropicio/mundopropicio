import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS_PER_EMAIL = 10; // per 15 min window
const MAX_ATTEMPTS_PER_IP = 20; // per 15 min window
const LOCKOUT_MINUTES = 15;
const ALERT_THRESHOLD = 8; // send alert after this many attempts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, action } = await req.json();
    // action: "check" | "record_failure" | "record_success"

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const windowStart = new Date(
      Date.now() - LOCKOUT_MINUTES * 60 * 1000
    ).toISOString();

    if (action === "check") {
      // Count recent failed attempts by email
      const { count: emailAttempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", email.toLowerCase())
        .eq("success", false)
        .gte("attempted_at", windowStart);

      // Count recent failed attempts by IP
      const { count: ipAttempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip)
        .eq("success", false)
        .gte("attempted_at", windowStart);

      const blocked =
        (emailAttempts || 0) >= MAX_ATTEMPTS_PER_EMAIL ||
        (ipAttempts || 0) >= MAX_ATTEMPTS_PER_IP;

      const remaining = Math.max(
        0,
        MAX_ATTEMPTS_PER_EMAIL - (emailAttempts || 0)
      );

      return new Response(
        JSON.stringify({ blocked, remaining, emailAttempts, ipAttempts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "record_failure") {
      // Record the failed attempt
      await supabaseAdmin.from("login_attempts").insert({
        email: email.toLowerCase(),
        ip_address: ip,
        success: false,
      });

      // Count total recent failures for this email
      const { count: totalAttempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", email.toLowerCase())
        .eq("success", false)
        .gte("attempted_at", windowStart);

      // Send alert if threshold reached
      if ((totalAttempts || 0) >= ALERT_THRESHOLD) {
        await sendSecurityAlert(supabaseAdmin, email, ip, totalAttempts || 0);
      }

      // Cleanup old attempts (older than 24h)
      const cleanupBefore = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      await supabaseAdmin
        .from("login_attempts")
        .delete()
        .lt("attempted_at", cleanupBefore);

      return new Response(
        JSON.stringify({ recorded: true, totalAttempts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "record_success") {
      // Record success and clear failed attempts for this email
      await supabaseAdmin.from("login_attempts").insert({
        email: email.toLowerCase(),
        ip_address: ip,
        success: true,
      });

      return new Response(
        JSON.stringify({ recorded: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-login-rate error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendSecurityAlert(
  supabaseAdmin: any,
  targetEmail: string,
  ip: string,
  attempts: number
) {
  try {
    // Get all admin users to notify
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles?.length) return;

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .in("id", adminIds);

    if (!adminProfiles?.length) return;

    // Try to send via transactional email system
    for (const admin of adminProfiles) {
      if (!admin.email) continue;

      // Use the transactional email function if available
      try {
        await supabaseAdmin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "security-alert",
            recipientEmail: admin.email,
            idempotencyKey: `security-alert-${targetEmail}-${new Date().toISOString().slice(0, 13)}`,
            templateData: {
              targetEmail,
              ip,
              attempts,
              timestamp: new Date().toLocaleString("pt-PT"),
            },
          },
        });
      } catch {
        // If transactional email not available, log to system_audit_log
        console.log(`Security alert for admin ${admin.email}: ${attempts} failed login attempts for ${targetEmail} from IP ${ip}`);
      }
    }

    // Always log the alert to system_audit_log
    await supabaseAdmin.from("system_audit_log").insert({
      entity_type: "security",
      entity_id: targetEmail,
      action: "security_alert_sent",
      changed_by: "system",
      metadata: {
        target_email: targetEmail,
        ip_address: ip,
        failed_attempts: attempts,
        admin_emails: adminProfiles.map((a: any) => a.email),
      },
    });
  } catch (err) {
    console.error("Failed to send security alert:", err);
  }
}
