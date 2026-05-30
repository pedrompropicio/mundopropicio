import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Plus, Loader2, Play, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyCreative } from "@/lib/creative-media";

type CreativeRow = {
  id: string;
  name: string;
  type: "image" | "video" | "carousel";
  file_url: string;
  file_mime_type: string | null;
  duration_seconds: number | null;
  tags: string[] | null;
  created_at: string;
};

function fmtDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function CrmCreatives() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-creatives-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("id, name, type, file_url, file_mime_type, duration_seconds, tags, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreativeRow[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-cyan-400" />
            Criativos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Imagens e vídeos para usar nas campanhas Meta
          </p>
        </div>
        <Button
          onClick={() => navigate("/audience/creatives/new")}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Novo criativo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">
          Erro ao carregar criativos: {(error as Error).message}
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
            <ImageIcon className="h-8 w-8 text-cyan-400" />
          </div>
          <p className="text-muted-foreground mb-4">
            Sem criativos ainda. Faz upload do primeiro para criar campanhas.
          </p>
          <Button
            onClick={() => navigate("/audience/creatives/new")}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar criativo
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((c) => {
            const tags = c.tags ?? [];
            const visibleTags = tags.slice(0, 3);
            const extra = tags.length - visibleTags.length;
            return (
              <Card
                key={c.id}
                onClick={() => navigate(`/audience/creatives/${c.id}`)}
                className={cn(
                  "overflow-hidden cursor-pointer transition-all",
                  "hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/10",
                )}
              >
                <div className="relative aspect-video bg-muted overflow-hidden">
                  {(() => {
                    const kind = classifyCreative(c.file_url, c.type, c.file_mime_type);
                    if (kind === "placeholder") {
                      return (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      );
                    }
                    // "video" e "thumbnail" partilham o chrome de vídeo (botão play + duração);
                    // a diferença é só a tag de media: <video> real vs <img> da thumbnail.
                    const showVideoChrome = kind === "video" || kind === "thumbnail";
                    return (
                      <>
                        {kind === "video" ? (
                          <video
                            src={c.file_url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={c.file_url}
                            alt={c.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                        {showVideoChrome && (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                                <Play className="h-5 w-5 text-white fill-white" />
                              </div>
                            </div>
                            {c.duration_seconds && (
                              <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-black/70 text-white px-1.5 py-0.5 rounded">
                                {fmtDuration(c.duration_seconds)}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-sm truncate flex-1">{c.name}</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] py-0 px-1.5 shrink-0",
                        c.type === "video"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                          : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                      )}
                    >
                      {c.type === "video" ? (
                        <>
                          <Video className="h-2.5 w-2.5 mr-0.5" /> Vídeo
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-2.5 w-2.5 mr-0.5" /> Imagem
                        </>
                      )}
                    </Badge>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {visibleTags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px] py-0 px-1.5">
                          {t}
                        </Badge>
                      ))}
                      {extra > 0 && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          +{extra}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
