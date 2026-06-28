import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle, Plus, Video, ArrowLeft } from "lucide-react";
import { evaluateCreativeForReels, type ReelsCheckResult } from "@/lib/crm/creativeReelsCheck";
import { classifyCreative } from "@/lib/creative-media";

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de criativo da BIBLIOTECA para a recomendação REELS_PC.
// Reaproveita:
//   • Tabela crm.meta_creatives (lista existente — mesma fonte da página
//     /audience/creatives), filtrada para vídeos.
//   • Página de upload existente (/audience/creatives/new) via navegação.
//   • Helper classifyCreative (src/lib/creative-media) para thumb/play chrome.
// NÃO duplica upload nem biblioteca.
//
// "Usar este criativo" NÃO publica no Meta nesta peça — apenas valida +
// regista decisão local + toast. Ver TODO no handler.
// ─────────────────────────────────────────────────────────────────────────────

type CreativeRow = {
  id: string;
  name: string;
  type: "image" | "video" | "carousel";
  file_url: string;
  file_mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
};

export function ReelsCreativePickerDialog({
  open,
  onOpenChange,
  companyId,
  onSelected,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | null;
  /** Chamado quando o utilizador confirma um criativo VÁLIDO. */
  onSelected: (creative: CreativeRow) => void;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-creatives-reels-picker", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("id, name, type, file_url, file_mime_type, width, height, duration_seconds, created_at")
        .eq("type", "video")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreativeRow[];
    },
  });

  const selected = useMemo(
    () => (data ?? []).find((c) => c.id === selectedId) ?? null,
    [data, selectedId],
  );

  const verdict: ReelsCheckResult | null = useMemo(
    () =>
      selected
        ? evaluateCreativeForReels({
            type: selected.type,
            width: selected.width,
            height: selected.height,
            duration_seconds: selected.duration_seconds,
            file_mime_type: selected.file_mime_type,
          })
        : null,
    [selected],
  );

  const handleConfirm = () => {
    if (!selected || !verdict?.atende) return;
    // TODO: ligar à publicação real no Meta (fluxo crm-meta-upload-creative-v2
    // + criação de ad) após validação. Por agora, apenas regista escolha.
    toast.success("Criativo validado e selecionado.", {
      description: "Publicação no Meta virá no próximo passo.",
    });
    onSelected(selected);
    onOpenChange(false);
    setSelectedId(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelectedId(null); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4 text-cyan-400" />
            {selected ? "Avaliação técnica para Reels" : "Escolher criativo para Reels"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? "Verificámos o criativo contra as specs Meta Reels (9:16 vertical, até 90s)."
              : "Escolhe um vídeo da biblioteca ou sobe um novo."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <VerdictView
              creative={selected}
              verdict={verdict!}
              onBack={() => setSelectedId(null)}
            />
          ) : isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-muted-foreground">
                Não tens vídeos na biblioteca. Sobe um vídeo vertical 9:16.
              </p>
              <Button
                onClick={() => navigate("/audience/creatives/new")}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Subir novo criativo
              </Button>
            </div>
          ) : (
            <CreativeGrid
              creatives={data}
              onPick={(id) => setSelectedId(id)}
              onUploadNew={() => navigate("/audience/creatives/new")}
            />
          )}
        </div>

        {selected && (
          <DialogFooter className="border-t pt-3">
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Escolher outro
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!verdict?.atende}
              title={
                verdict?.atende
                  ? "Validar e selecionar"
                  : "Este criativo não atende aos requisitos de Reels."
              }
            >
              <Check className="h-4 w-4 mr-1" /> Usar este criativo
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreativeGrid({
  creatives,
  onPick,
  onUploadNew,
}: {
  creatives: CreativeRow[];
  onPick: (id: string) => void;
  onUploadNew: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onUploadNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Subir novo criativo
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {creatives.map((c) => {
          const kind = classifyCreative(c.file_url, c.type, c.file_mime_type);
          const ratio = c.width && c.height ? c.height / c.width : null;
          const isVertical = ratio !== null && ratio >= 1.7 && ratio <= 1.85;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className="text-left rounded-md border overflow-hidden hover:border-cyan-500/50 hover:shadow-md transition group"
            >
              <div className="relative aspect-video bg-muted">
                {kind === "video" ? (
                  <video src={c.file_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <img src={c.file_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                )}
                {isVertical && (
                  <Badge className="absolute top-1 right-1 text-[9px] bg-emerald-500/90 text-white border-0">
                    9:16
                  </Badge>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <p className="text-xs font-medium truncate">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.width && c.height ? `${c.width}×${c.height}` : "dim. ?"}
                  {c.duration_seconds ? ` · ${Math.round(c.duration_seconds)}s` : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VerdictView({
  creative,
  verdict,
}: {
  creative: CreativeRow;
  verdict: ReelsCheckResult;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-start">
        <div className="w-32 shrink-0 aspect-[9/16] bg-muted rounded overflow-hidden">
          <video src={creative.file_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{creative.name}</p>
          <p className="text-xs text-muted-foreground">
            {creative.width && creative.height ? `${creative.width}×${creative.height}` : "dim. ?"}
            {creative.duration_seconds ? ` · ${Math.round(creative.duration_seconds)}s` : ""}
            {creative.file_mime_type ? ` · ${creative.file_mime_type}` : ""}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-md border p-3 text-sm font-medium",
          verdict.atende
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/40 bg-red-500/10 text-red-300",
        )}
      >
        {verdict.atende ? "✓ Atende aos requisitos de Reels" : "✗ Não atende aos requisitos de Reels"}
        <p className="text-xs font-normal mt-1 opacity-90">{verdict.resumo}</p>
      </div>

      <ul className="space-y-1.5">
        {verdict.criterios.map((c) => (
          <li key={c.nome} className="flex items-start gap-2 text-xs">
            {c.estado === "ok" && <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />}
            {c.estado === "aviso" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />}
            {c.estado === "falha" && <X className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />}
            <span>
              <strong className="text-foreground">{c.nome}:</strong>{" "}
              <span className="text-muted-foreground">{c.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
