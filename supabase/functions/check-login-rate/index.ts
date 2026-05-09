import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Soft warning to the client (UX hint), no longer used to lock the account.
const WARN_THRESHOLD_PER_EMAIL = 10;
// Hard lockout, decisive: per IP only — prevents attacker from locking out
// other users by spamming `record_failure` with their email.
const MAX_ATTEMPTS_PER_IP = 20;
const LOCKOUT_MINUTES = 15;
const ALERT_THRESHOLD = 8;

// HMAC token tying (email, ip, ts). TTL = 60s.
const TOKEN_TTL_MS = 60_000;
const HMAC_SECRET = Deno.env.get("LOGIN_RATE_HMAC_SECRET") ?? "";

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return b64url(new Uint8Array(sig));
}

async function signToken(email: string, ip: string): Promise<string> {
  const ts = Date.now().toString();
  const payload = `${ts}.${email}.${ip}`;
  const sig = await hmac(payload);
  return `${ts}.${sig}`;
}

async function verifyToken(
  token: string | undefined,
  email: string,
  ip: string
): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() - tsNum) > TOKEN_TTL_MS) return false;
  const expected = await hmac(`${ts}.${email}.${ip}`);
  // Constant-time compare not strictly needed (HMAC over short string), but
  // keep it simple and length-safe.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
    const action = body.action as string;
    const clientToken = body.token as string | undefined;

    if (!email || !action) {
      return new Response(
        JSON.stringify({ error: "Missing email or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ip = getIp(req);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const windowStart = new Date(
      Date.now() - LOCKOUT_MINUTES * 60 * 1000
    ).toISOString();

    if (action === "check") {
      // Verified failures by email (soft signal only)
      const { count: emailAttempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", email)
        .eq("success", false)
        .eq("verified", true)
        .gte("attempted_at", windowStart);

      // ALL failures by IP (verified or not — IP itself is observable)
      const { count: ipAttempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip)
        .eq("success", false)
        .gte("attempted_at", windowStart);

      const blocked = (ipAttempts || 0) >= MAX_ATTEMPTS_PER_IP;
      const softWarn = (emailAttempts || 0) >= WARN_THRESHOLD_PER_EMAIL;
      const remaining = Math.max(
        0,
        WARN_THRESHOLD_PER_EMAIL - (emailAttempts || 0)
      );

      const token = HMAC_SECRET ? await signToken(email, ip) : null;

      return new Response(
        JSON.stringify({
          blocked,
          softWarn,
          remaining,
          emailAttempts,
          ipAttempts,
          token,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "record_failure") {
      // Require a valid HMAC token bound to (email, ip).
      // If invalid, return 200 silently — do NOT reveal to attackers and do
      // NOT write anything. Attacker can't spoof failures without first
      // calling `check` from the same IP.
      const ok = HMAC_SECRET
        ? await verifyToken(clientToken, email, ip)
        : true; // fallback: if secret is missing, behave like before (warn in logs)

      if (!HMAC_SECRET) {
        console.warn(
          "[check-login-rate] LOGIN_RATE_HMAC_SECRET not set — token bypass"
        );
      }

      if (!ok) {
        return new Response(
          JSON.stringify({ recorded: false, reason: "no_op" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin.from("login_attempts").insert({
        email,
        ip_address: ip,
        success: false,
        verified: true,
      });

      // Alert thresholding: dedupe per IP+hour, count verified failures from
      // the same IP (any email) so flood from one IP triggers exactly one
      // alert per hour, instead of N alerts per N spoofed emails.
      const { count: ipFailures } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip)
        .eq("success", false)
        .eq("verified", true)
        .gte("attempted_at", windowStart);

      if ((ipFailures || 0) >= ALERT_THRESHOLD) {
        await sendSecurityAlert(supabaseAdmin, email, ip, ipFailures || 0);
      }

      const cleanupBefore = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      await supabaseAdmin
        .from("login_attempts")
        .delete()
        .lt("attempted_at", cleanupBefore);

      return new Response(
        JSON.stringify({ recorded: true, ipFailures }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "record_success") {
      await supabaseAdmin.from("login_attempts").insert({
        email,
        ip_address: ip,
        success: true,
        verified: true,
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

    // Idempotency key now keyed on IP+hour, not email — one alert per IP/hour
    const hourKey = new Date().toISOString().slice(0, 13);
    const idempotencyBase = `security-alert-${ip}-${hourKey}`;

    for (const admin of adminProfiles) {
      if (!admin.email) continue;
      try {
        await supabaseAdmin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "security-alert",
            recipientEmail: admin.email,
            idempotencyKey: idempotencyBase,
            templateData: {
              targetEmail,
              ip,
              attempts,
              timestamp: new Date().toLocaleString("pt-PT"),
            },
          },
        });
      } catch {
        console.log(
          `Security alert for admin ${admin.email}: ${attempts} verified failed login attempts from IP ${ip} (last target: ${targetEmail})`
        );
      }
    }

    await supabaseAdmin.from("system_audit_log").insert({
      entity_type: "security",
      entity_id: ip,
      action: "security_alert_sent",
      changed_by: "system",
      metadata: {
        target_email: targetEmail,
        ip_address: ip,
        verified_failed_attempts: attempts,
        admin_emails: adminProfiles.map((a: any) => a.email),
      },
    });
  } catch (err) {
    console.error("Failed to send security alert:", err);
  }
}
