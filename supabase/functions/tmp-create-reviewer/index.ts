import { createClient } from "npm:@supabase/supabase-js@2.39.0";
const C = "de0466af-9d6e-49e6-8d73-ca8bd5757f0f";
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const tok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(tok);
  if (u?.user?.id !== "d8e502f7-9ceb-4dae-bd73-7291832d0d6f") return j({ error: "forbidden" }, 403);
  const { password } = await req.json();
  if (typeof password !== "string" || password.length < 20) return j({ error: "bad_pw" }, 400);
  const { data, error } = await admin.auth.admin.createUser({
    email: "google-review@mundopropicio.com", password, email_confirm: true,
    user_metadata: { company_id: C, full_name: "Google Reviewer" },
  });
  if (error) return j({ error: error.message }, 500);
  const id = data.user.id;
  await admin.from("user_roles").delete().eq("user_id", id);
  const { error: e2 } = await admin.from("user_roles").insert({ user_id: id, role: "viewer", company_id: C });
  await admin.from("profiles").update({ company_id: C, active_company_id: C }).eq("id", id);
  const { data: roles } = await admin.from("user_roles").select("role, company_id").eq("user_id", id);
  const { data: prof } = await admin.from("profiles").select("company_id, active_company_id").eq("id", id).single();
  return j({ user_id: id, roles, prof, role_error: e2?.message ?? null });
});
