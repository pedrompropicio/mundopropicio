// artist-access-invite — D-ERP259. Gestão de utilizadores da app Gestão Artística.
// Só admin da empresa do artista ou platform_admin (artist_access_check 'admin').
// POST { action: 'list', artist_id }
// POST { action: 'invite', artist_id, email, area_modes: { <área>: 'view'|'edit' } }  (novo, D-ERP259 adenda)
// POST { action: 'invite', artist_id, email, access_level: 'viewer'|'traffic_manager', areas: string[] }  (antigo, compatível)
// POST { action: 'revoke', artist_id, user_id }
// Convite por email com redirectTo https://app.socialartists.com.br/definir-senha. Nunca devolve tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertArtistAccess } from "../_shared/artist-access.ts";

const REDIRECT = "https://app.socialartists.com.br/definir-senha";
const AREAS = ["overview", "channels", "traffic", "financial", "reports", "songs", "content"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "body inválido" }, 400); }
  const action = String(b.action ?? "");
  const artistId = String(b.artist_id ?? "");
  if (!UUID.test(artistId)) return json({ error: "artist_id inválido" }, 400);

  const acc = await assertArtistAccess(req, artistId, "admin");
  if (!acc.ok) return json({ error: acc.error }, acc.status);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const user = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });

  if (action === "list") {
    const { data, error } = await admin.from("artist_user_access")
      .select("user_id, access_level, areas, area_modes, granted_by, granted_at, revoked_at")
      .eq("artist_id", artistId).is("revoked_at", null).order("granted_at");
    if (error) return json({ error: error.message }, 500);
    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profs } = ids.length
      ? await admin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as { id: string; email: string; full_name: string }[] };
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    return json({ ok: true, users: (data ?? []).map((r) => ({ ...r, email: byId.get(r.user_id)?.email ?? null, full_name: byId.get(r.user_id)?.full_name ?? null })) });
  }

  if (action === "revoke") {
    const uid = String(b.user_id ?? "");
    if (!UUID.test(uid)) return json({ error: "user_id inválido" }, 400);
    const { error } = await user.rpc("artist_access_revoke", { p_user_id: uid, p_artist_id: artistId });
    if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 500);
    return json({ ok: true });
  }

  if (action === "invite") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const level = String(b.access_level ?? "");
    const areas = Array.isArray(b.areas) ? b.areas.map(String) : [];
    const rawModes = b.area_modes && typeof b.area_modes === "object" && !Array.isArray(b.area_modes)
      ? (b.area_modes as Record<string, unknown>) : null;
    const modes: Record<string, string> | null = rawModes
      ? Object.fromEntries(Object.entries(rawModes).filter(([, v]) => v === "view" || v === "edit").map(([k, v]) => [k, String(v)]))
      : null;
    const bad: string[] = [];
    if (!EMAIL.test(email) || email.length > 255) bad.push("email");
    if (modes) {
      const keys = Object.keys(modes);
      if (keys.length === 0 || keys.some((a) => !AREAS.includes(a))
          || Object.keys(rawModes!).length !== keys.length) bad.push("area_modes");
    } else {
      if (!["viewer", "traffic_manager"].includes(level)) bad.push("access_level");
      if (areas.length === 0 || areas.some((a) => !AREAS.includes(a))) bad.push("areas");
    }
    if (bad.length) return json({ error: "invalid_input", fields: bad }, 400);

    const { data: art } = await admin.from("artists").select("company_id").eq("id", artistId).maybeSingle();
    if (!art) return json({ error: "artista não encontrado" }, 404);

    const fullName = typeof b.full_name === "string" && b.full_name.trim() ? b.full_name.trim().slice(0, 200) : null;
    // Utilizador já existe?
    const { data: prof } = await admin.from("profiles").select("id, full_name").ilike("email", email).maybeSingle();
    let userId = prof?.id as string | undefined;
    let invited = false;
    let resent = false;
    if (!userId) {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: REDIRECT,
        data: { company_id: art.company_id, invited_for: "gestao_artistica", ...(fullName ? { full_name: fullName } : {}) },
      });
      if (invErr || !inv?.user) return json({ error: "invite_failed", detail: invErr?.message ?? "convite falhou" }, 500);
      userId = inv.user.id;
      invited = true;
    } else {
      // Conta existe mas nunca entrou: reenviar link para definir a senha.
      const { data: au } = await admin.auth.admin.getUserById(userId);
      if (au?.user && !au.user.last_sign_in_at) {
        const { error: rErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
        resent = !rErr;
      }
    }
    if (fullName && userId && !prof?.full_name) {
      await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
    }
    const { data: id, error } = modes
      ? await user.rpc("artist_access_grant_modes", { p_user_id: userId, p_artist_id: artistId, p_area_modes: modes })
      : await user.rpc("artist_access_grant", { p_user_id: userId, p_artist_id: artistId, p_level: level, p_areas: areas });
    if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 500);
    return json({ ok: true, access_id: id, user_id: userId, invited, resent });
  }

  return json({ error: "action inválida (list|invite|revoke)" }, 400);
});
