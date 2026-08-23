// create-company — super-admin only. Cria nova empresa-cliente.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateCompanyBody {
  legal_name: string;
  display_name: string;
  slug: string;
  tax_id?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  contact_email?: string;
  theme_config?: Record<string, unknown>;
  address?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validar utilizador via JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Confirmar platform_admin
    const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", {
      _user_id: userData.user.id,
    });
    if (!isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — platform_admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as CreateCompanyBody;
    if (!body.legal_name || !body.display_name || !body.slug) {
      return new Response(
        JSON.stringify({ error: "legal_name, display_name and slug are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const { data: company, error: insErr } = await admin
      .from("companies")
      .insert({
        legal_name: body.legal_name,
        display_name: body.display_name,
        slug,
        tax_id: body.tax_id ?? null,
        country: body.country ?? "PT",
        currency: body.currency ?? "EUR",
        timezone: body.timezone ?? "Europe/Lisbon",
        contact_email: body.contact_email ?? null,
        theme_config: body.theme_config ?? {},
        address: body.address ?? {},
        status: "active",
      })
      .select()
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ company }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
