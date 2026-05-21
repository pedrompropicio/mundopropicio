import { supabase } from "@/integrations/supabase/client";

type ResolveOperacaoMediaUrlOptions = {
  path: string | null | undefined;
  mediaId?: string | null;
  registroId?: string | null;
};

export async function resolveOperacaoMediaUrl({ path, mediaId, registroId }: ResolveOperacaoMediaUrlOptions) {
  if (!path) return null;

  const { data, error } = await supabase.functions.invoke("resolve-operacao-media-url", {
    body: { path, mediaId, registroId },
  });

  if (!error && data?.signedUrl) return data.signedUrl as string;

  const fallback = await supabase.storage.from("operacao-media").createSignedUrl(path, 3600);
  return fallback.data?.signedUrl ?? null;
}