// One-off: copia PNGs do bucket público `press-clippings` do projecto
// antigo zjseklogascfwqjoocbl para sfohvvlqccmmebvjgibx (este projecto).
// Lê URLs distintas em blog_posts.cover_image, faz fetch público e
// re-upload via service role. Devolve mapping { old -> new }.
//
// NOTA: não faz UPDATE na BD — isso é feito manualmente pelo Pedro em
// SQL Editor depois de confirmar que migrated==23, failed==0.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OLD_HOST = "zjseklogascfwqjoocbl.supabase.co";
const BUCKET = "press-clippings";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) URLs distintas
    const { data: rows, error: qErr } = await admin
      .from("blog_posts")
      .select("cover_image")
      .like("cover_image", `%${OLD_HOST}%`);

    if (qErr) throw qErr;

    const oldUrls = Array.from(
      new Set((rows ?? []).map((r: any) => r.cover_image as string).filter(Boolean)),
    );

    console.log(`[migrate-press-clippings] ${oldUrls.length} URLs distintas`);

    const mapping: Record<string, string> = {};
    const failures: Array<{ url: string; reason: string }> = [];

    for (const oldUrl of oldUrls) {
      try {
        const filename = decodeURIComponent(oldUrl.split("/").pop() || "");
        if (!filename) throw new Error("filename vazio");

        console.log(`→ ${filename}`);

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
        console.error(`  FAIL ${oldUrl}: ${reason}`);
        failures.push({ url: oldUrl, reason });
      }
    }

    return new Response(
      JSON.stringify({
        migrated: Object.keys(mapping).length,
        failed: failures.length,
        mapping,
        failures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("fatal", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
