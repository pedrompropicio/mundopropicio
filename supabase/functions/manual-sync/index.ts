// Edge function: manual-sync
// Importa os artigos-fonte do Manual de Orientação (docs/manual/*.md, já
// passados pelo parser no cliente) para help_articles / help_sections /
// help_chunks. Escrita só via RPC help_sync_article (SECURITY DEFINER,
// service_role). Embeddings: Lovable AI Gateway, google/gemini-embedding-2 (3072).
// Autorização: só admin ou platform_admin.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const EMBED_MODEL = "google/gemini-embedding-2";
const EMBED_BATCH = 50; // o fornecedor aceita até 100 inputs por pedido

interface InSection {
  anchor_id: string;
  heading: string;
  position: number;
  tooltip: string | null;
  screens: string[];
  profiles: string[];
  sources: string[];
  body_md: string;
}

interface InChunk {
  anchor_id: string;
  position: number;
  content: string;
}

interface InArticle {
  slug: string;
  title: string;
  module: string;
  updated_on: string;
  profiles: string[];
  routes: string[];
  sources: string[];
  content_md: string;
  sections: InSection[];
  chunks: InChunk[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`embeddings ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const rows = (data?.data ?? []) as { index: number; embedding: number[] }[];
  if (rows.length !== inputs.length) {
    throw new Error(
      `embeddings: recebidos ${rows.length} vetores para ${inputs.length} pedaços`,
    );
  }
  const out: number[][] = new Array(inputs.length);
  rows.forEach((r, i) => {
    out[typeof r.index === "number" ? r.index : i] = r.embedding;
  });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Autorização: admin ou platform_admin -------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token === ANON_KEY) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Token inválido" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roles, error: rolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (rolesErr) throw rolesErr;
    const allowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "platform_admin",
    );
    if (!allowed) return json({ error: "Acesso negado" }, 403);

    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY em falta" }, 500);

    // ---- Entrada ------------------------------------------------------------
    const body = await req.json().catch(() => null);
    const articles: InArticle[] = Array.isArray(body?.articles) ? body.articles : [];
    if (articles.length === 0) return json({ error: "Sem artigos no pedido" }, 400);

    const { data: existing, error: exErr } = await admin
      .from("help_articles")
      .select("slug, content_hash");
    if (exErr) throw exErr;
    const hashBySlug = new Map<string, string>(
      (existing ?? []).map((r: { slug: string; content_hash: string }) => [
        r.slug,
        r.content_hash,
      ]),
    );

    const result = {
      inserted: [] as string[],
      updated: [] as string[],
      unchanged: [] as string[],
      orphans: [] as string[],
      chunks: 0,
      errors: [] as { slug: string; error: string }[],
    };

    for (const article of articles) {
      try {
        if (!article?.slug) throw new Error("artigo sem slug");
        const contentHash = await sha256Hex(article.content_md ?? "");
        if (hashBySlug.get(article.slug) === contentHash) {
          result.unchanged.push(article.slug);
          continue;
        }

        // Embeddings por lotes — falha aqui = artigo não é gravado.
        const chunks = article.chunks ?? [];
        const vectors: number[][] = [];
        for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
          const slice = chunks.slice(i, i + EMBED_BATCH);
          const batch = await embedBatch(slice.map((c) => c.content));
          vectors.push(...batch);
        }

        const payload = {
          slug: article.slug,
          title: article.title,
          module: article.module,
          updated_on: article.updated_on,
          profiles: article.profiles ?? [],
          routes: article.routes ?? [],
          sources: article.sources ?? [],
          content_md: article.content_md,
          content_hash: contentHash,
          sections: article.sections.map((s) => ({
            anchor_id: s.anchor_id,
            heading: s.heading,
            position: s.position,
            tooltip: s.tooltip,
            screens: s.screens ?? [],
            profiles: s.profiles ?? [],
            sources: s.sources ?? [],
            body_md: s.body_md,
            chunks: chunks
              .map((c, idx) => ({ c, idx }))
              .filter(({ c }) => c.anchor_id === s.anchor_id)
              .map(({ c, idx }) => ({
                position: c.position,
                content: c.content,
                embedding: JSON.stringify(vectors[idx]),
              })),
          })),
        };

        const { data: rpcData, error: rpcErr } = await admin.rpc(
          "help_sync_article",
          { _payload: payload },
        );
        if (rpcErr) throw rpcErr;

        const status = (rpcData as { status?: string; chunks?: number })?.status;
        result.chunks += (rpcData as { chunks?: number })?.chunks ?? 0;
        if (status === "inserted") result.inserted.push(article.slug);
        else if (status === "updated") result.updated.push(article.slug);
        else result.unchanged.push(article.slug);
      } catch (e) {
        result.errors.push({
          slug: article?.slug ?? "(sem slug)",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Órfãos: existem na base mas não vieram no pedido — só se reportam.
    const sent = new Set(articles.map((a) => a.slug));
    result.orphans = [...hashBySlug.keys()].filter((s) => !sent.has(s));

    return json({ ok: result.errors.length === 0, ...result });
  } catch (e) {
    console.error("manual-sync error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
