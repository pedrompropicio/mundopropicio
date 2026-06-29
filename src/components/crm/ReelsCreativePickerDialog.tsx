import { useEffect, useMemo, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle, Plus, Video, ArrowLeft, Loader2, ShieldCheck, Send, PartyPopper } from "lucide-react";
import { evaluateCreativeForReels, type ReelsCheckResult } from "@/lib/crm/creativeReelsCheck";
import { classifyCreative } from "@/lib/creative-media";

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de criativo da BIBLIOTECA para a recomendação REELS_PC.
// Fluxo em DUAS FASES:
//   1) Pré-visualização — invoca crm-meta-create-reels-ad com dry_run:true.
//      Mostra resolved + payload. NADA é escrito no Meta.
//   2) Publicação real — só DEPOIS de uma pré-visualização ok, e SÓ via
//      AlertDialog de confirmação. Invoca a MESMA edge com dry_run:false.
//      O anúncio nasce sempre PAUSED (forçado no servidor — a UI só comunica).
// A escrita real NUNCA acontece num clique único nem de forma automática:
// passa obrigatoriamente pelo AlertDialog. Só após sucesso é que marcamos
// a recomendação como tratada (via onSelected).
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
  headline: string | null;
  storage_path: string | null;
  meta_video_id: string | null;
};

// "Pronto" = tem dimensões conhecidas E já está carregado no Meta.
// Isto é independente da avaliação 9:16 (que acontece depois de escolhido).
function isReadyForReels(c: CreativeRow): boolean {
  return c.width != null && c.height != null && c.meta_video_id != null;
}

type SimResult = {
  ok: boolean;
  dry_run?: boolean;
  resolved?: Record<string, unknown>;
  payload?: unknown;
  ad_id?: string;
  status?: string;
  error?: string;
  detail?: unknown;
  fb_error?: unknown;
};

export function ReelsCreativePickerDialog({
  open,
  onOpenChange,
  companyId,
  externalAdsetId,
  onSelected,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | null;
  /** Adset alvo da recomendação que abriu o picker. Sem isto não há simulação. */
  externalAdsetId: string | null;
  /** Chamado quando o utilizador confirma um criativo VÁLIDO (após simulação ok). */
  onSelected: (creative: CreativeRow) => void;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showReadyOnly, setShowReadyOnly] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-creatives-reels-picker", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select(
          "id, name, type, file_url, file_mime_type, width, height, duration_seconds, meta_video_id, storage_path, headline, created_at",
        )
        .eq("type", "video")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreativeRow[];
    },
  });

  const allCreatives = useMemo(() => data ?? [], [data]);

  const readyCreatives = useMemo(
    () => allCreatives.filter((c) => isReadyForReels(c)),
    [allCreatives],
  );

  const displayedCreatives = useMemo(() => {
    const source = showReadyOnly ? readyCreatives : allCreatives;
    // Mesmo em "Ver todos", os prontos ficam no topo.
    return [...source].sort((a, b) => {
      const ra = isReadyForReels(a) ? 1 : 0;
      const rb = isReadyForReels(b) ? 1 : 0;
      return rb - ra;
    });
  }, [allCreatives, readyCreatives, showReadyOnly]);

  const selected = useMemo(
    () => allCreatives.find((c) => c.id === selectedId) ?? null,
    [allCreatives, selectedId],
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

        <div className="flex-1 overflow-y-auto pr-1">
          {selected ? (
            <VerdictAndSimulate
              creative={selected}
              verdict={verdict!}
              companyId={companyId}
              externalAdsetId={externalAdsetId}
              onConfirmed={(c) => {
                onSelected(c);
                onOpenChange(false);
                setSelectedId(null);
              }}
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
          ) : showReadyOnly && readyCreatives.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhum vídeo pronto (com dimensões e carregado no Meta). Carrega um novo criativo ou vê todos.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReadyOnly(false)}
                >
                  Ver todos
                </Button>
                <Button
                  onClick={() => navigate("/audience/creatives/new")}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Subir novo criativo
                </Button>
              </div>
            </div>
          ) : (
            <CreativeGrid
              creatives={displayedCreatives}
              readyCount={readyCreatives.length}
              totalCount={allCreatives.length}
              showReadyOnly={showReadyOnly}
              onShowReadyOnlyChange={setShowReadyOnly}
              onPick={(id) => setSelectedId(id)}
              onUploadNew={() => navigate("/audience/creatives/new")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreativeGrid({
  creatives,
  readyCount,
  totalCount,
  showReadyOnly,
  onShowReadyOnlyChange,
  onPick,
  onUploadNew,
}: {
  creatives: CreativeRow[];
  readyCount: number;
  totalCount: number;
  showReadyOnly: boolean;
  onShowReadyOnlyChange: (v: boolean) => void;
  onPick: (id: string) => void;
  onUploadNew: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{readyCount}</span> prontos
          <span className="text-muted-foreground/60">·</span>
          <span>{totalCount}</span> no total
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{showReadyOnly ? "Prontos para publicar" : "Ver todos"}</span>
          <Switch
            checked={showReadyOnly}
            onCheckedChange={onShowReadyOnlyChange}
            aria-label="Mostrar só vídeos prontos"
          />
          <Button size="sm" variant="outline" onClick={onUploadNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Subir novo criativo
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {creatives.map((c) => {
          const kind = classifyCreative(c.file_url, c.type, c.file_mime_type);
          const ready = isReadyForReels(c);
          const missingDimensions = c.width == null || c.height == null;
          const missingMetaVideo = c.meta_video_id == null;
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
              <div className="p-2 space-y-1">
                <p className="text-xs font-medium truncate">{c.name}</p>
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] text-muted-foreground">
                    {c.width && c.height ? `${c.width}×${c.height}` : "sem dimensões"}
                    {c.duration_seconds ? ` · ${Math.round(c.duration_seconds)}s` : ""}
                  </p>
                  {ready ? (
                    <Badge className="text-[9px] border-0 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
                      Pronto
                    </Badge>
                  ) : missingDimensions ? (
                    <Badge variant="secondary" className="text-[9px]">
                      Sem dimensões
                    </Badge>
                  ) : missingMetaVideo ? (
                    <Badge className="text-[9px] border-0 bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">
                      Não está no Meta
                    </Badge>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VerdictAndSimulate({
  creative,
  verdict,
  companyId,
  externalAdsetId,
  onConfirmed,
  onBack,
}: {
  creative: CreativeRow;
  verdict: ReelsCheckResult;
  companyId: string | null;
  externalAdsetId: string | null;
  onConfirmed: (c: CreativeRow) => void;
  onBack: () => void;
}) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<SimResult | null>(null);
  const [published, setPublished] = useState<SimResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Pré-preenche mensagem com a headline do criativo (editável) se existir.
  useEffect(() => {
    setMessage(creative.headline ?? "");
    setTitle("");
    setLink("");
    setPreview(null);
    setPublished(null);
  }, [creative.id, creative.headline]);

  const atende = verdict.atende;
  const hasAdset = !!externalAdsetId;
  const busy = running || publishing;
  const canRun =
    atende && hasAdset && !!companyId && link.trim().length > 0 && message.trim().length > 0 && !busy;

  // Body partilhado entre pré-visualização e publicação real — única
  // diferença é dry_run. Status é sempre forçado a PAUSED pelo servidor.
  const buildBody = (dryRun: boolean) => ({
    company_id: companyId,
    external_adset_id: externalAdsetId,
    creative_id: creative.id,
    link: link.trim(),
    message: message.trim(),
    title: title.trim() || undefined,
    cta: "BUY_TICKETS",
    dry_run: dryRun,
  });

  const runSimulation = async () => {
    if (!canRun) return;
    setRunning(true);
    setPreview(null);
    setPublished(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-create-reels-ad", {
        body: buildBody(true),
      });
      if (error) {
        setPreview({ ok: false, error: error.message });
        toast.error("Falhou a pré-visualização.", { description: error.message });
      } else {
        const r = (data ?? {}) as SimResult;
        setPreview(r);
        if (r.ok) toast.success("Pré-visualização ok — nada foi publicado no Meta.");
        else toast.error("Pré-visualização devolveu erro.", { description: r.error ?? "" });
      }
    } catch (e: any) {
      setPreview({ ok: false, error: e?.message ?? "Erro desconhecido" });
    } finally {
      setRunning(false);
    }
  };

  // SEGURANÇA: esta função só é chamada a partir do AlertDialogAction
  // do diálogo de confirmação — nunca por um clique único, nunca automática.
  const runPublish = async () => {
    if (!preview?.ok) return; // só publica após pré-visualização ok
    setPublishing(true);
    setPublished(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-create-reels-ad", {
        body: buildBody(false),
      });
      if (error) {
        setPublished({ ok: false, error: error.message });
        toast.error("Falhou a publicação.", { description: error.message });
      } else {
        const r = (data ?? {}) as SimResult;
        setPublished(r);
        if (r.ok) {
          toast.success("Anúncio criado e PAUSADO no Meta.");
          // Marca a recomendação como tratada SÓ após escrita real bem-sucedida.
          onConfirmed(creative);
        } else {
          toast.error("Publicação devolveu erro.", { description: r.error ?? "" });
        }
      }
    } catch (e: any) {
      setPublished({ ok: false, error: e?.message ?? "Erro desconhecido" });
    } finally {
      setPublishing(false);
      setConfirmOpen(false);
    }
  };


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
          atende
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/40 bg-red-500/10 text-red-300",
        )}
      >
        {atende ? "✓ Atende aos requisitos de Reels" : "✗ Não atende aos requisitos de Reels"}
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

      {atende && (
        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-3">
          <p className="text-xs text-cyan-200/90 flex items-start gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Vamos simular a criação do anúncio (sem publicar no Meta) para validar tudo antes.
          </p>

          {!hasAdset && (
            <p className="text-xs text-amber-300">
              Esta recomendação não está ligada a um adset específico — não é possível criar um anúncio sem adset.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reels-link" className="text-xs">Link de destino *</Label>
            <Input
              id="reels-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://ticketline.sapo.pt/evento/..."
              disabled={!hasAdset || running}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reels-message" className="text-xs">Mensagem do anúncio *</Label>
            <Textarea
              id="reels-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Texto principal que aparece no anúncio."
              rows={3}
              disabled={!hasAdset || running}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reels-title" className="text-xs">Título (opcional)</Label>
            <Input
              id="reels-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Headline curta."
              disabled={!hasAdset || running}
            />
          </div>
        </div>
      )}

      {preview && <PreviewResult result={preview} />}
      {published && <PublishedResult result={published} />}

      <DialogFooter className="border-t pt-3 -mx-1 px-1 gap-2 flex-wrap">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Escolher outro
        </Button>
        {published?.ok ? (
          <Button onClick={() => onConfirmed(creative)}>
            <Check className="h-4 w-4 mr-1" /> Fechar
          </Button>
        ) : (
          <>
            <Button
              variant={preview?.ok ? "outline" : "default"}
              onClick={runSimulation}
              disabled={!canRun}
              title={
                !atende
                  ? "Este criativo não atende aos requisitos de Reels."
                  : !hasAdset
                    ? "Recomendação sem adset associado."
                    : !link || !message
                      ? "Preenche link e mensagem."
                      : "Pré-visualizar (sem publicar)"
              }
            >
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              {preview ? "Pré-visualizar novamente" : "Pré-visualizar"}
            </Button>
            {/* O botão de publicar SÓ aparece após uma pré-visualização ok.
                E SÓ abre o AlertDialog — nunca publica directamente. */}
            {preview?.ok && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Publicar anúncio (fica pausado)
              </Button>
            )}
          </>
        )}
      </DialogFooter>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !publishing && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar anúncio no Meta?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="text-amber-300 font-medium">
                  Vais criar um anúncio REAL no Meta. Ele fica PAUSADO (não gasta, não aparece) até o ativares.
                </p>
                <div className="rounded border p-2 space-y-1 text-xs bg-muted/30">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[110px]">Adset destino</span>
                    <span className="font-mono break-all">{externalAdsetId}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[110px]">Criativo</span>
                    <span className="break-all">{creative.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[110px]">Link</span>
                    <span className="font-mono break-all">{link}</span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void runPublish(); }}
              disabled={publishing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Publicar (pausado)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ErrorBlock({ result, titulo }: { result: SimResult; titulo: string }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 space-y-2 text-xs">
      <p className="font-semibold text-red-300">{titulo}</p>
      {result.error && <p className="text-red-200">{result.error}</p>}
      {result.detail !== undefined && (
        <pre className="bg-black/30 p-2 rounded text-[10px] overflow-x-auto">
          {JSON.stringify(result.detail, null, 2)}
        </pre>
      )}
      {result.fb_error !== undefined && (
        <pre className="bg-black/30 p-2 rounded text-[10px] overflow-x-auto">
          {JSON.stringify(result.fb_error, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PreviewResult({ result }: { result: SimResult }) {
  if (!result.ok) return <ErrorBlock result={result} titulo="Pré-visualização falhou" />;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Pré-visualização concluída — nada foi publicado no Meta.</p>
          <p className="opacity-80">
            O anúncio seria criado com <strong>status PAUSED</strong>. Revê o payload abaixo e, se estiver tudo bem, clica em <em>Publicar anúncio</em> (vai pedir confirmação).
          </p>
        </div>
      </div>

      {result.resolved && (
        <div className="rounded-md border p-3 space-y-1 text-xs">
          <p className="font-semibold mb-1">Identificadores resolvidos</p>
          {Object.entries(result.resolved).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground min-w-[160px]">{k}</span>
              <span className="font-mono break-all">{String(v ?? "—")}</span>
            </div>
          ))}
        </div>
      )}

      {result.payload !== undefined && (
        <div className="rounded-md border p-3 space-y-1.5">
          <p className="text-xs font-semibold">
            Payload do anúncio <Badge variant="outline" className="ml-1 text-[9px]">status: PAUSED</Badge>
          </p>
          <pre className="bg-black/30 p-2 rounded text-[10px] overflow-x-auto max-h-72">
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function PublishedResult({ result }: { result: SimResult }) {
  if (!result.ok) return <ErrorBlock result={result} titulo="Publicação falhou" />;

  return (
    <div className="rounded-md border border-emerald-500/50 bg-emerald-500/15 p-3 text-xs text-emerald-100 space-y-2">
      <div className="flex items-start gap-2">
        <PartyPopper className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Anúncio criado e PAUSADO no Meta.</p>
          <p className="opacity-90">
            Para o ativar, fá-lo no Ads Manager (a ativação dentro da plataforma virá numa próxima peça).
          </p>
        </div>
      </div>
      <div className="rounded bg-black/30 p-2 space-y-1">
        <div className="flex gap-2">
          <span className="text-emerald-300/80 min-w-[80px]">ad_id</span>
          <span className="font-mono break-all">{result.ad_id ?? "—"}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-emerald-300/80 min-w-[80px]">status</span>
          <Badge variant="outline" className="text-[10px]">{result.status ?? "PAUSED"}</Badge>
        </div>
      </div>
    </div>
  );
}
