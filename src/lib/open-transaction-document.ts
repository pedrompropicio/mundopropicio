import { supabase } from "@/integrations/supabase/client";

export interface TxDocLike {
  id: string;
  name: string;
  file_url: string;
  transaction_id?: string;
}

/** Detect if a ref:// entry actually contains an http(s) URL (clickable external link). */
export function isExternalLinkRef(fileUrl: string): boolean {
  return /^ref:\/\/https?:\/\//i.test(fileUrl);
}

/** Textual reference (no real file): "ref://" without an http URL. */
export function isTextualRef(fileUrl: string): boolean {
  return fileUrl?.startsWith("ref://") && !isExternalLinkRef(fileUrl);
}

async function getFreshAccessToken() {
  let { data } = await supabase.auth.getSession();
  const expiresAt = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
  if (!data.session?.access_token || expiresAt - Date.now() < 60_000) {
    data = (await supabase.auth.refreshSession()).data;
  }
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Volta a iniciar sessão.");
  return token;
}

/**
 * Abre um anexo de transação numa nova aba, usando o mesmo mecanismo do
 * TransactionDocumentsModal (edge function `resolve-attachment-url`, buckets privados).
 */
export async function openTransactionDocument(doc: TxDocLike): Promise<void> {
  const fileUrl = doc.file_url ?? "";

  if (isExternalLinkRef(fileUrl)) {
    window.open(fileUrl.replace(/^ref:\/\//, ""), "_blank", "noopener,noreferrer");
    return;
  }
  if (isTextualRef(fileUrl)) throw new Error("Referência sem ficheiro anexado.");

  if (/^https?:\/\//i.test(fileUrl) && !fileUrl.includes("/storage/v1/object/")) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const call = (token: string) =>
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-attachment-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind: "transaction_document", documentId: doc.id, mode: "download" }),
    });

  let token = await getFreshAccessToken();
  let response = await call(token);
  if (response.status === 401) {
    token = (await supabase.auth.refreshSession()).data.session?.access_token ?? "";
    if (token) response = await call(token);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Ficheiro não disponível");
  }

  const isHtml = /\.html?(\?|$)/i.test(fileUrl);
  const blob = isHtml
    ? new Blob([await response.text()], { type: "text/html; charset=utf-8" })
    : await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
