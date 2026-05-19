import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, AlertOctagon, Clipboard, Activity } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";

type Filter = { frente_id?: string; etapa_id?: string; kindNot?: string; kind?: string };

const KIND_ICON: Record<string, any> = {
  evolucao: Activity,
  observacao: MessageSquare,
  punch: Clipboard,
  chamado: AlertOctagon,
};

export function RegistroFeed({ filter, pageSize = 20 }: { filter: Filter; pageSize?: number }) {
  const queryKey = ["op-registros", filter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("operacao_registros")
        .select("*, author:profiles!operacao_registros_author_profile_id_fkey(id,full_name)")
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (filter.frente_id) q = q.eq("frente_id", filter.frente_id);
      if (filter.etapa_id) q = q.eq("etapa_id", filter.etapa_id);
      if (filter.kind) q = q.eq("kind", filter.kind);
      if (filter.kindNot) q = q.neq("kind", filter.kindNot);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = useMemo(() => (data ?? []).map((r: any) => r.id), [data]);
  const { data: medias } = useQuery({
    queryKey: ["op-registros-media", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registro_media")
        .select("*")
        .in("registro_id", ids)
        .order("sort_order");
      return data ?? [];
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">A carregar...</div>;
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground p-4 text-center">Sem registos.</div>;
  }

  return (
    <div className="space-y-3">
      {data.map((r: any) => {
        const Icon = KIND_ICON[r.kind] ?? MessageSquare;
        const ms = (medias ?? []).filter((m: any) => m.registro_id === r.id);
        return (
          <div key={r.id} className="border rounded-lg p-3 bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{r.author?.full_name ?? "—"}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</span>
              {r.kind === "chamado" && <PriorityBadge priority={r.priority} />}
            </div>
            {r.text && <p className="mt-2 text-sm whitespace-pre-wrap">{r.text}</p>}
            {ms.length > 0 && <MediaGrid medias={ms} />}
            {r.audio_url && <AudioPlayer path={r.audio_url} />}
          </div>
        );
      })}
    </div>
  );
}

function MediaGrid({ medias }: { medias: any[] }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {medias.map((m) => <MediaThumb key={m.id} m={m} />)}
    </div>
  );
}

function MediaThumb({ m }: { m: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const p = m.thumbnail_url ?? m.file_url;
    supabase.storage.from("operacao-media").createSignedUrl(p, 3600)
      .then(({ data }) => data?.signedUrl && setUrl(data.signedUrl));
  }, [m]);
  const handleOpen = async () => {
    if (!full) {
      const { data } = await supabase.storage.from("operacao-media").createSignedUrl(m.file_url, 3600);
      if (data?.signedUrl) setFull(data.signedUrl);
    }
    setOpen(true);
  };
  return (
    <>
      <button type="button" onClick={handleOpen} className="relative aspect-square rounded overflow-hidden bg-muted">
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
        {m.file_type === "video" && (
          <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">▶</span>
        )}
      </button>
      {open && full && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          {m.file_type === "video" ? (
            <video src={full} controls className="max-h-full max-w-full" />
          ) : (
            <img src={full} alt="" className="max-h-full max-w-full" />
          )}
        </div>
      )}
    </>
  );
}

function AudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("operacao-media").createSignedUrl(path, 3600)
      .then(({ data }) => data?.signedUrl && setUrl(data.signedUrl));
  }, [path]);
  if (!url) return null;
  return <audio controls src={url} className="mt-2 w-full h-8" />;
}
