import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, MessageSquare, Clipboard, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { resolveOperacaoMediaUrl } from "@/lib/operacao-media";

type Period = "today" | "week" | "all";

const KIND_ICON: Record<string, any> = {
  evolucao: Activity,
  observacao: MessageSquare,
  punch: Clipboard,
};

export default function Atividade() {
  const { user, hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_operacao");
  const [period, setPeriod] = useState<Period>("week");

  // frentes do user
  const { data: frenteIds } = useQuery({
    queryKey: ["op-atividade-frentes", user?.id],
    enabled: !!user && canView,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frente_team")
        .select("frente_id").eq("profile_id", user!.id).eq("active", true);
      return Array.from(new Set((data ?? []).map((t: any) => t.frente_id)));
    },
  });

  const since = useMemo(() => {
    const d = new Date();
    if (period === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
    if (period === "week") { d.setDate(d.getDate() - 7); return d.toISOString(); }
    return null;
  }, [period]);

  const { data: registros, isLoading } = useQuery({
    queryKey: ["op-atividade-list", frenteIds, period],
    enabled: !!frenteIds && frenteIds.length > 0,
    queryFn: async () => {
      let q = supabase.from("operacao_registros")
        .select("id,kind,text,created_at,frente_id,etapa_id,author:profiles!operacao_registros_author_profile_id_fkey(full_name),frente:operacao_frentes(name,color)")
        .in("frente_id", frenteIds!)
        .in("kind", ["evolucao", "observacao", "punch"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (since) q = q.gte("created_at", since);
      const { data } = await q;
      return data ?? [];
    },
  });

  const ids = useMemo(() => (registros ?? []).map((r: any) => r.id), [registros]);
  const { data: medias } = useQuery({
    queryKey: ["op-atividade-media", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_registro_media")
        .select("id,registro_id,file_url,thumbnail_url,file_type,sort_order")
        .in("registro_id", ids).order("sort_order");
      return data ?? [];
    },
  });

  if (!canView) return <div className="p-6">Sem permissão.</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      <Link to="/operacao/equipa" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Atividade</h1>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="today">Hoje</TabsTrigger>
          <TabsTrigger value="week">Esta semana</TabsTrigger>
          <TabsTrigger value="all">Tudo</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar...</p>}
      {registros && registros.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          Sem atividade no período.
        </Card>
      )}

      <div className="space-y-2">
        {(registros ?? []).map((r: any) => {
          const Icon = KIND_ICON[r.kind] ?? Activity;
          const ms = (medias ?? []).filter((m: any) => m.registro_id === r.id).slice(0, 3);
          const target = r.etapa_id ? `/operacao/etapa/${r.etapa_id}` : `/operacao/frente/${r.frente_id}`;
          return (
            <Link key={r.id} to={target}>
              <Card className="p-3 active:scale-[0.99]">
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: (r.frente?.color ?? "#6b7280") + "33", color: r.frente?.color ?? undefined }}
                      >
                        {r.frente?.name}
                      </span>
                      <span className="text-muted-foreground">{r.author?.full_name ?? "—"}</span>
                      <span className="text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    {r.text && <p className="text-sm line-clamp-2">{r.text}</p>}
                    {ms.length > 0 && <MediaRow medias={ms} />}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MediaRow({ medias }: { medias: any[] }) {
  return (
    <div className="flex gap-1 mt-1">
      {medias.map((m) => <MediaThumb key={m.id} m={m} />)}
    </div>
  );
}

function MediaThumb({ m }: { m: any }) {
  const { data: url } = useQuery({
    queryKey: ["op-atividade-thumb", m.id],
    queryFn: async () => {
      const p = m.thumbnail_url ?? m.file_url;
      return resolveOperacaoMediaUrl({ path: p, mediaId: m.id, registroId: m.registro_id });
    },
  });
  return (
    <div className="h-14 w-14 rounded overflow-hidden bg-muted shrink-0 relative">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      {m.file_type === "video" && (
        <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">▶</span>
      )}
    </div>
  );
}
