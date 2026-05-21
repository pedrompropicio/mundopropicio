import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanPath(path: unknown) {
  if (typeof path !== "string") return null;
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return null;
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const path = cleanPath(body.path);
    if (!path) return json({ error: "Caminho inválido" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: object } = await admin
      .from("storage.objects")
      .select("owner")
      .eq("bucket_id", "operacao-media")
      .eq("name", path)
      .maybeSingle();

    const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: user.id });
    let allowed = Boolean(isPlatformAdmin) || object?.owner === user.id;

    const parts = path.split("/");
    const pathRegistroId = parts.length >= 3 ? parts[2] : null;
    const requestedRegistroId = typeof body.registroId === "string" ? body.registroId : pathRegistroId;

    if (!allowed && typeof body.mediaId === "string") {
      const { data: media } = await admin
        .from("operacao_registro_media")
        .select("registro_id,file_url,thumbnail_url")
        .eq("id", body.mediaId)
        .maybeSingle();
      if (media && (media.file_url === path || media.thumbnail_url === path)) {
        allowed = await canViewRegistro(admin, media.registro_id, user.id);
      }
    }

    if (!allowed && requestedRegistroId) {
      allowed = await canViewRegistro(admin, requestedRegistroId, user.id, path);
    }

    if (!allowed) return json({ error: "Sem permissão para abrir este ficheiro" }, 403);

    const { data, error } = await admin.storage.from("operacao-media").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return json({ error: error?.message ?? "Ficheiro não encontrado" }, 404);
    return json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

async function canViewRegistro(admin: any, registroId: string, userId: string, path?: string) {
  const { data: registro } = await admin
    .from("operacao_registros")
    .select("id,audio_url,frente:operacao_frentes(event_id)")
    .eq("id", registroId)
    .maybeSingle();
  const eventId = registro?.frente?.event_id;
  if (!eventId) return false;
  if (path && registro.audio_url && registro.audio_url !== path) {
    const { data: media } = await admin
      .from("operacao_registro_media")
      .select("id")
      .eq("registro_id", registroId)
      .or(`file_url.eq.${path},thumbnail_url.eq.${path}`)
      .maybeSingle();
    if (!media) return false;
  }
  const { data } = await admin.rpc("can_view_event_operacao", { _event_id: eventId, _user_id: userId });
  return Boolean(data);
}