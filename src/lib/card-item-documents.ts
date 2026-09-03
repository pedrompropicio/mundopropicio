/**
 * D17 — N documentos por item de sessão de cartão.
 *
 * Os ficheiros vivem no bucket `card-documents`, isolado por SESSÃO
 * (`<session_id>/<item_id>/…`) — nunca leva prefixo de empresa, porque as
 * policies de storage validam a sessão/portador. O registo fica em
 * `card_item_documents` (1 linha por ficheiro) e é isso que o fecho da sessão
 * replica nas transações consolidadas como `card://<path>`.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentCompanyId } from "@/hooks/useCompany";
import { isHeicFile, normalizeImageFile } from "@/lib/image-upload";

export interface CardItemDoc {
  id: string;
  item_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  created_at?: string;
}

export async function fetchCardItemDocuments(itemId: string): Promise<CardItemDoc[]> {
  const { data, error } = await supabase
    .from("card_item_documents")
    .select("id, item_id, file_path, file_name, mime_type, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CardItemDoc[];
}

/** Sobe um ficheiro e registra-o no item. HEIC do iPhone é convertido antes. */
export async function uploadCardItemDocument(
  sessionId: string,
  itemId: string,
  original: File,
  uploadedBy?: string | null,
): Promise<CardItemDoc> {
  let file = original;
  if (isHeicFile(original)) file = await normalizeImageFile(original);

  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "jpg";
  const path = `${sessionId}/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("card-documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) throw upErr;

  const companyId = await getCurrentCompanyId();
  const { data, error } = await supabase
    .from("card_item_documents")
    .insert({
      item_id: itemId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      uploaded_by: uploadedBy ?? null,
      ...(companyId ? { company_id: companyId } : {}),
    } as any)
    .select("id, item_id, file_path, file_name, mime_type, created_at")
    .single();
  if (error) {
    await supabase.storage.from("card-documents").remove([path]);
    throw error;
  }

  // Compatibilidade com o legado: `document_path` guarda o primeiro anexo.
  const existing = await fetchCardItemDocuments(itemId);
  if (existing.length === 1) {
    await supabase.from("card_session_items").update({ document_path: path }).eq("id", itemId);
  }

  return data as CardItemDoc;
}

export async function deleteCardItemDocument(doc: CardItemDoc): Promise<void> {
  const { error } = await supabase.from("card_item_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from("card-documents").remove([doc.file_path]);
  const rest = await fetchCardItemDocuments(doc.item_id);
  await supabase
    .from("card_session_items")
    .update({ document_path: rest[0]?.file_path ?? null })
    .eq("id", doc.item_id);
}

/** Abre o documento numa nova aba (signed URL de 1h). */
export async function openCardItemDocument(doc: CardItemDoc): Promise<void> {
  const { data, error } = await supabase.storage
    .from("card-documents")
    .createSignedUrl(doc.file_path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Documento não disponível.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
