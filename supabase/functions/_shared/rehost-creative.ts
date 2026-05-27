// Re-host partilhado de criativos Meta.
//
// O sync (crm-meta-sync-creatives) guarda o file_url da Meta tal como vem
// (scontent-*.fbcdn.net, facebook.com/ads/image/…). Esses URLs são temporários
// e/ou exigem sessão Meta, por isso partem fora da Meta (miniatura partida no
// browser E download_failed na análise IA server-side).
//
// Este módulo faz download do file_url atual e re-upload para o bucket público
// próprio 'crm-meta-creatives', devolvendo um URL de storage estável. É usado
// pelo back-fill (crm-meta-creatives-rehost) E pelo sync (auto, criativos novos).
//
// VÍDEOS: o file_url de um type=video já é uma IMAGEM (poster/thumbnail) — os
// bytes do vídeo ficam na Meta (não re-hospedamos o vídeo inteiro). Logo o
// re-host trata sempre o conteúdo como imagem; o guard de content-type abaixo
// rejeita qualquer coisa que não seja imagem (ex. página de erro HTML).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const REHOST_BUCKET = "crm-meta-creatives";

export interface RehostInput {
  company_id: string;
  // Chave determinística para o storage_path. Usar meta_creative_id quando
  // existe (disponível no sync antes do INSERT) senão o id da row.
  path_key: string;
  type?: string | null;
  file_url: string | null;
}

export interface RehostResult {
  status: "rehosted" | "skipped" | "failed";
  reason?: string;
  file_url?: string; // novo URL estável (quando rehosted)
  storage_path?: string;
  mime?: string;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime] ?? "jpg";
}

// Idempotência: já está estável se o file_url aponta para o storage público
// do projeto ATUAL (SUPABASE_URL = https://<project>.supabase.co). URLs do
// projeto antigo NÃO contam como estáveis (são re-processados / falham).
export function isAlreadyStable(fileUrl: string | null, supabaseUrl: string): boolean {
  if (!fileUrl) return false;
  return fileUrl.startsWith(supabaseUrl) &&
    fileUrl.includes(`/storage/v1/object/public/${REHOST_BUCKET}/`);
}

// Faz download + re-upload de UM criativo. Nunca lança: devolve sempre um
// RehostResult (erros isolados — o chamador continua para o próximo).
export async function rehostCreative(
  admin: SupabaseClient,
  input: RehostInput,
  opts: { supabaseUrl: string },
): Promise<RehostResult> {
  const { file_url, company_id, path_key } = input;

  if (!file_url) return { status: "skipped", reason: "no_file_url" };
  if (isAlreadyStable(file_url, opts.supabaseUrl)) {
    return { status: "skipped", reason: "already_stable" };
  }

  let resp: Response;
  try {
    resp = await fetch(file_url);
  } catch (e) {
    return { status: "failed", reason: `download_threw: ${(e as Error).message}` };
  }
  if (!resp.ok) return { status: "failed", reason: `download_http_${resp.status}` };

  const contentType = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // Só re-hospedamos imagens (poster, no caso de vídeo). Qualquer outra coisa
  // (HTML de erro, redirect de login) é tratada como falha — não poluímos o bucket.
  if (!contentType.startsWith("image/")) {
    return { status: "failed", reason: `not_an_image: ${contentType || "unknown"}` };
  }

  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.byteLength === 0) return { status: "failed", reason: "empty_body" };

  const mime = contentType;
  const path = `${company_id}/${path_key}.${extFromMime(mime)}`;

  const { error: upErr } = await admin.storage
    .from(REHOST_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (upErr) return { status: "failed", reason: `upload: ${upErr.message}` };

  const { data: pub } = admin.storage.from(REHOST_BUCKET).getPublicUrl(path);
  return { status: "rehosted", file_url: pub.publicUrl, storage_path: path, mime };
}
