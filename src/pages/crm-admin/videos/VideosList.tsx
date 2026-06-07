import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/contexts/AuthContext";
import { MP_COMPANY_ID } from "../constants";

interface HomeVideoRow {
  id: string;
  company_id: string;
  event_id: string | null;
  title_pt: string;
  title_en: string | null;
  youtube_id: string;
  display_order: number;
  portal_visible: boolean;
  created_at: string;
  updated_at: string;
}

interface EventOption {
  id: string;
  name: string;
  date: string | null;
}

const YT_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

function parseYoutubeId(input: string): string {
  const v = input.trim();
  if (!v) return "";
  // try URL parse
  const m =
    v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,20})/) ||
    v.match(/^([A-Za-z0-9_-]{6,20})$/);
  return m ? m[1] : v;
}

export default function VideosList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<HomeVideoRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<HomeVideoRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-home-videos", MP_COMPANY_ID],
    queryFn: async (): Promise<HomeVideoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("home_videos")
        .select("*")
        .eq("company_id", MP_COMPANY_ID)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HomeVideoRow[];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["crm-events-for-videos", MP_COMPANY_ID],
    queryFn: async (): Promise<EventOption[]> => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, date")
        .eq("company_id", MP_COMPANY_ID)
        .order("date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EventOption[];
    },
  });

  const videos = useMemo(() => data ?? [], [data]);

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, idx) =>
        (supabase as any)
          .from("home_videos")
          .update({ display_order: idx, updated_by: user?.id ?? null })
          .eq("id", id),
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-home-videos"] }),
    onError: (e: any) => toast.error(`Falha a reordenar: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("home_videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vídeo eliminado.");
      qc.invalidateQueries({ queryKey: ["crm-home-videos"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = videos.findIndex((v) => v.id === active.id);
    const newIdx = videos.findIndex((v) => v.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(videos, oldIdx, newIdx);
    qc.setQueryData(["crm-home-videos", MP_COMPANY_ID], next);
    reorderMutation.mutate(next.map((v) => v.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vídeos da Home</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vídeos editoriais do YouTube destacados na Home do portal público. Arraste para reordenar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo vídeo
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground">A carregar…</div>
        )}
        {error && (
          <div className="p-6 text-center text-destructive">{(error as Error).message}</div>
        )}
        {!isLoading && videos.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            Sem vídeos. Carrega em "Novo vídeo" para começar.
          </div>
        )}
        {videos.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {videos.map((v) => (
                  <SortableRow
                    key={v.id}
                    video={v}
                    onEdit={() => setEditing(v)}
                    onDelete={() => setToDelete(v)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {(creating || editing) && (
        <VideoFormDialog
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          video={editing}
          events={events ?? []}
          nextOrder={videos.length}
          userId={user?.id ?? null}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.title_pt}" será removido. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableRow({
  video,
  onEdit,
  onDelete,
}: {
  video: HomeVideoRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const thumb = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 hover:bg-muted/40">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        title="Arrastar para reordenar"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <img
        src={thumb}
        alt=""
        className="h-14 w-24 rounded object-cover bg-muted shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{video.title_pt}</p>
          {video.portal_visible ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
              <Eye className="h-3 w-3" /> Visível
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              <EyeOff className="h-3 w-3" /> Oculto
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate font-mono">{video.youtube_id}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          asChild
          variant="ghost"
          size="icon"
          title="Abrir no YouTube"
        >
          <a href={`https://youtu.be/${video.youtube_id}`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Eliminar">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function VideoFormDialog({
  open,
  onClose,
  video,
  events,
  nextOrder,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  video: HomeVideoRow | null;
  events: EventOption[];
  nextOrder: number;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const [titlePt, setTitlePt] = useState(video?.title_pt ?? "");
  const [titleEn, setTitleEn] = useState(video?.title_en ?? "");
  const [youtubeInput, setYoutubeInput] = useState(video?.youtube_id ?? "");
  const [eventId, setEventId] = useState<string>(video?.event_id ?? "none");
  const [portalVisible, setPortalVisible] = useState(video?.portal_visible ?? true);

  useEffect(() => {
    setTitlePt(video?.title_pt ?? "");
    setTitleEn(video?.title_en ?? "");
    setYoutubeInput(video?.youtube_id ?? "");
    setEventId(video?.event_id ?? "none");
    setPortalVisible(video?.portal_visible ?? true);
  }, [video]);

  const youtubeId = parseYoutubeId(youtubeInput);
  const ytValid = YT_ID_RE.test(youtubeId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!titlePt.trim()) throw new Error("Título (PT) obrigatório.");
      if (!ytValid) throw new Error("ID do YouTube inválido.");
      const payload = {
        company_id: MP_COMPANY_ID,
        title_pt: titlePt.trim(),
        title_en: titleEn.trim() || null,
        youtube_id: youtubeId,
        event_id: eventId === "none" ? null : eventId,
        portal_visible: portalVisible,
        updated_by: userId,
      };
      if (video) {
        const { error } = await (supabase as any)
          .from("home_videos")
          .update(payload)
          .eq("id", video.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("home_videos").insert({
          ...payload,
          display_order: nextOrder,
          created_by: userId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(video ? "Vídeo actualizado." : "Vídeo criado.");
      qc.invalidateQueries({ queryKey: ["crm-home-videos"] });
      onClose();
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{video ? "Editar vídeo" : "Novo vídeo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>YouTube — URL ou ID</Label>
            <Input
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
              placeholder="https://youtu.be/dQw4w9WgXcQ ou dQw4w9WgXcQ"
            />
            {youtubeInput && (
              <p className="text-xs text-muted-foreground">
                ID detectado: <span className="font-mono">{youtubeId || "—"}</span>{" "}
                {!ytValid && youtubeInput && (
                  <span className="text-destructive">(inválido)</span>
                )}
              </p>
            )}
            {ytValid && (
              <img
                src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                alt=""
                className="rounded border border-border w-full max-w-xs"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Título (PT) *</Label>
            <Input value={titlePt} onChange={(e) => setTitlePt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Título (EN)</Label>
            <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Evento associado (opcional)</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem evento —</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} {e.date ? `· ${e.date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Visível no portal</p>
              <p className="text-xs text-muted-foreground">
                Quando desligado, fica oculto da Home pública.
              </p>
            </div>
            <Switch checked={portalVisible} onCheckedChange={setPortalVisible} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {video ? "Guardar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
