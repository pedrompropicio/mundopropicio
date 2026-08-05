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
  ImageOff,
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
import { useCompany } from "@/hooks/useCompany";
import { ImageUploader } from "../components/ImageUploader";

interface PressClippingRow {
  id: string;
  company_id: string;
  event_id: string | null;
  source: string;
  event_name: string | null;
  url: string | null;
  image: string | null;
  display_order: number;
  portal_visible: boolean;
}

interface EventOption {
  id: string;
  name: string;
  date: string | null;
}

export default function PressList() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<PressClippingRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<PressClippingRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-press-clippings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PressClippingRow[]> => {
      const { data, error } = await (supabase as any)
        .from("press_clippings")
        .select("id, company_id, event_id, source, event_name, url, image, display_order, portal_visible")
        .eq("company_id", companyId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PressClippingRow[];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["crm-events-for-press", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<EventOption[]> => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, date")
        .eq("company_id", companyId)
        .order("date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EventOption[];
    },
  });

  const clippings = useMemo(() => data ?? [], [data]);

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, idx) =>
        (supabase as any)
          .from("press_clippings")
          .update({ display_order: idx })
          .eq("id", id),
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-press-clippings"] }),
    onError: (e: any) => toast.error(`Falha a reordenar: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("press_clippings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clipping eliminado.");
      qc.invalidateQueries({ queryKey: ["crm-press-clippings"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = clippings.findIndex((c) => c.id === active.id);
    const newIdx = clippings.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(clippings, oldIdx, newIdx);
    qc.setQueryData(["crm-press-clippings", companyId], next);
    reorderMutation.mutate(next.map((c) => c.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Imprensa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Matérias da secção "A Imprensa fala" do portal público. Arraste para reordenar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo clipping
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground">A carregar…</div>
        )}
        {error && (
          <div className="p-6 text-center text-destructive">{(error as Error).message}</div>
        )}
        {!isLoading && clippings.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            Sem clippings. Carrega em "Novo clipping" para começar.
          </div>
        )}
        {clippings.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={clippings.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {clippings.map((c) => (
                  <SortableRow
                    key={c.id}
                    clipping={c}
                    onEdit={() => setEditing(c)}
                    onDelete={() => setToDelete(c)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {(creating || editing) && (
        <ClippingFormDialog
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          clipping={editing}
          events={events ?? []}
          nextOrder={clippings.length}
          userId={user?.id ?? null}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar clipping?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.source}" será removido. Não pode ser desfeito.
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
  clipping,
  onEdit,
  onDelete,
}: {
  clipping: PressClippingRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clipping.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
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
      <div className="h-16 w-32 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
        {clipping.image ? (
          <img
            src={clipping.image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{clipping.source}</p>
          {clipping.portal_visible ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
              <Eye className="h-3 w-3" /> Visível
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              <EyeOff className="h-3 w-3" /> Oculto
            </span>
          )}
        </div>
        {clipping.event_name && (
          <p className="text-xs text-muted-foreground truncate">{clipping.event_name}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {clipping.url && (
          <Button asChild variant="ghost" size="icon" title="Abrir matéria">
            <a href={clipping.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
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

function isValidUrl(v: string): boolean {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function ClippingFormDialog({
  open,
  onClose,
  clipping,
  events,
  nextOrder,
  userId: _userId,
}: {
  open: boolean;
  onClose: () => void;
  clipping: PressClippingRow | null;
  events: EventOption[];
  nextOrder: number;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const [source, setSource] = useState(clipping?.source ?? "");
  const [eventName, setEventName] = useState(clipping?.event_name ?? "");
  const [eventId, setEventId] = useState<string>(clipping?.event_id ?? "none");
  const [url, setUrl] = useState(clipping?.url ?? "");
  const [image, setImage] = useState<string | null>(clipping?.image ?? null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [portalVisible, setPortalVisible] = useState(clipping?.portal_visible ?? true);

  useEffect(() => {
    setSource(clipping?.source ?? "");
    setEventName(clipping?.event_name ?? "");
    setEventId(clipping?.event_id ?? "none");
    setUrl(clipping?.url ?? "");
    setImage(clipping?.image ?? null);
    setImageUrlInput("");
    setPortalVisible(clipping?.portal_visible ?? true);
  }, [clipping]);

  const urlValid = !url || isValidUrl(url);
  const { companyId } = useCompany();

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!source.trim()) throw new Error("Fonte (source) obrigatória.");
      if (url && !isValidUrl(url)) throw new Error("URL da matéria inválido.");
      const payload = {
        company_id: companyId,
        source: source.trim(),
        event_name: eventName.trim() || null,
        event_id: eventId === "none" ? null : eventId,
        url: url.trim() || null,
        image: image || null,
        portal_visible: portalVisible,
      };
      if (clipping) {
        const { error } = await (supabase as any)
          .from("press_clippings")
          .update(payload)
          .eq("id", clipping.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("press_clippings").insert({
          ...payload,
          display_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(clipping ? "Clipping actualizado." : "Clipping criado.");
      qc.invalidateQueries({ queryKey: ["crm-press-clippings"] });
      onClose();
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const applyImageUrl = () => {
    const v = imageUrlInput.trim();
    if (!v) return;
    if (!isValidUrl(v)) {
      toast.error("URL da imagem inválido.");
      return;
    }
    setImage(v);
    setImageUrlInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clipping ? "Editar clipping" : "Novo clipping"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fonte *</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="SIC Notícias, Público, Observador…"
            />
          </div>

          <div className="space-y-2">
            <Label>Nome do evento (texto livre)</Label>
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Anitta, Coala Festival…"
            />
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

          <div className="space-y-2">
            <Label>URL da matéria</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://sicnoticias.pt/..."
            />
            {url && !urlValid && (
              <p className="text-xs text-destructive">URL inválido (precisa de http/https).</p>
            )}
          </div>

          <ImageUploader
            value={image}
            onChange={setImage}
            label="Screenshot / imagem"
            aspectRatio="4/3"
            hint="Upload (até 10MB) ou cola URL abaixo"
          />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              …ou colar URL externo
            </Label>
            <div className="flex gap-2">
              <Input
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="https://…/clip.png"
              />
              <Button type="button" variant="outline" onClick={applyImageUrl}>
                Aplicar
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Visível no portal</p>
              <p className="text-xs text-muted-foreground">
                Quando desligado, fica oculto do Press Wall público.
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
            {clipping ? "Guardar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
