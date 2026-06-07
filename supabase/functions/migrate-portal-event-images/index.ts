// One-off: copia URLs públicas para o bucket event-images via service_role.
// Recebe payload { images: [{ old_url, filename_target }, ...] }
// Devolve { migrated, failed, mapping: { old_url: new_url }, failures }
// verify_jwt = true (default). Idempotente: upsert=true no upload.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "event-images";

type ImageItem = { old_url: string; filename_target: string };
type ReqBody = { images: ImageItem[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as ReqBody;
    if (!Array.isArray(body.images) || body.images.length === 0) {
      throw new Error("payload.images vazio");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const mapping: Record<string, string> = {};
    const failures: Array<{ url: string; reason: string }> = [];

    for (const item of body.images) {
      try {
        const oldUrl = item.old_url;
        const filename = item.filename_target;
        if (!oldUrl || !filename) throw new Error("old_url ou filename_target em falta");

        console.log(`→ ${filename} ← ${oldUrl}`);

        const resp = await fetch(oldUrl);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (buf.byteLength === 0) throw new Error("empty body");

        const contentType =
          (resp.headers.get("content-type") ?? "image/png").split(";")[0].trim();

        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(filename, buf, { contentType, upsert: true });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(filename);
        mapping[oldUrl] = pub.publicUrl;
        console.log(`  ok → ${pub.publicUrl}`);
      } catch (e) {
        const reason = (e as Error).message;
        console.error(`  FAIL ${item.old_url}: ${reason}`);
        failures.push({ url: item.old_url, reason });
      }
    }

    return new Response(
      JSON.stringify({
        migrated: Object.keys(mapping).length,
        failed: failures.length,
        mapping,
        failures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    console.error("fatal", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
