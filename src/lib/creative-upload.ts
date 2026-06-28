// src/lib/creative-upload.ts
// ---------------------------------------------------------------------------
// Helper de upload de criativo extraído de src/pages/crm/CreativeNew.tsx
// (sem alterar CreativeNew agora — extração read-only para reuso na Montagem
// Assistida). Faz:
//   1) leitura local dos metadados (width/height/duration/type)
//   2) upload do ficheiro para o bucket "crm-meta-creatives"
//   3) INSERT em crm.meta_creatives (sem push para Meta — fica para o caller)
// Devolve a row criada (id, file_url, type, width, height, duration).
//
// NÃO escreve query-string em file_url. NÃO faz push para Meta.

import { supabase } from "@/integrations/supabase/client";

export const CREATIVE_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime";
export const CREATIVE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type CreativeMediaMeta = {
  width: number;
  height: number;
  duration: number | null;
  type: "image" | "video";
};

export type UploadedCreative = {
  id: string;
  name: string;
  file_url: string;
  storage_path: string;
  type: "image" | "video";
  file_mime_type: string;
  width: number;
  height: number;
  duration_seconds: number | null;
};

export async function readCreativeMediaMeta(file: File): Promise<CreativeMediaMeta> {
  const isVideo = file.type.startsWith("video/");
  const url = URL.createObjectURL(file);
  try {
    if (isVideo) {
      return await new Promise<CreativeMediaMeta>((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () =>
          resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, type: "video" });
        v.onerror = () => reject(new Error("Falha a ler vídeo"));
        v.src = url;
      });
    }
    return await new Promise<CreativeMediaMeta>((resolve, reject) => {
      const i = new Image();
      i.onload = () =>
        resolve({ width: i.naturalWidth, height: i.naturalHeight, duration: null, type: "image" });
      i.onerror = () => reject(new Error("Falha a ler imagem"));
      i.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export type UploadCreativeFileArgs = {
  file: File;
  companyId: string;
  /** Default: nome do ficheiro sem extensão. */
  name?: string;
  /** Tags opcionais. */
  tags?: string[];
};

export async function uploadCreativeFile(args: UploadCreativeFileArgs): Promise<UploadedCreative> {
  const { file, companyId } = args;
  if (!file) throw new Error("Ficheiro em falta");
  if (!companyId) throw new Error("Empresa em falta");
  if (file.size > CREATIVE_UPLOAD_MAX_BYTES) {
    throw new Error(`Ficheiro demasiado grande (máx ${(CREATIVE_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(0)}MB)`);
  }
  if (!CREATIVE_UPLOAD_ACCEPT.split(",").includes(file.type)) {
    throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
  }

  const meta = await readCreativeMediaMeta(file);
  const name = (args.name ?? file.name.replace(/\.[^.]+$/, "")).trim() || "Criativo";

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${companyId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("crm-meta-creatives")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    const raw = (upErr as any)?.message ?? String(upErr);
    throw new Error(raw);
  }

  const { data: pub } = supabase.storage.from("crm-meta-creatives").getPublicUrl(path);
  const fileUrl = pub.publicUrl;

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) throw new Error("Sem utilizador autenticado");

  const { data: inserted, error: insErr } = await (supabase as any)
    .schema("crm")
    .from("meta_creatives")
    .insert({
      company_id: companyId,
      name,
      type: meta.type,
      storage_bucket: "crm-meta-creatives",
      storage_path: path,
      file_url: fileUrl,
      file_size_bytes: file.size,
      file_mime_type: file.type,
      width: meta.width,
      height: meta.height,
      duration_seconds: meta.duration,
      tags: args.tags && args.tags.length > 0 ? args.tags : null,
      created_by: userId,
    })
    .select("id, name, file_url, storage_path, type, file_mime_type, width, height, duration_seconds")
    .single();
  if (insErr) throw new Error(insErr.message);

  return inserted as UploadedCreative;
}
