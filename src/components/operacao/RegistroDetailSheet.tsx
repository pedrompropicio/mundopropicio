import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useMyLeadFrenteIds } from "@/hooks/useMyLeadFrenteIds";
import { useIsEventGeneralProducer } from "@/hooks/useIsEventGeneralProducer";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, Loader2, ExternalLink, MoveRight, X, CheckSquare } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { resolveOperacaoMediaUrl } from "@/lib/operacao-media";

interface Props {
  open: boolean;
  onClose: () => void;
  registroId: string | null;
  startInEdit?: boolean;
}

const KIND_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  evolucao: { label: "Evolução", variant: "secondary" },
  observacao: { label: "Observação", variant: "outline" },
  punch: { label: "Pendência", variant: "default" },
  chamado: { label: "Chamado", variant: "destructive" },
};

export function RegistroDetailSheet({ open, onClose, registroId, startInEdit = false }: Props) {
  const { user, isAdmin, isManager } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { leadFrenteIdSet } = useMyLeadFrenteIds();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editText, setEditText] = useState("");
  const [editKind, setEditKind] = useState("observacao");
  const [editFrenteId, setEditFrenteId] = useState<string>("");
  const [editEtapaId, setEditEtapaId] = useState<string>("__none__");
  const [editDate, setEditDate] = useState<string>("");
  const [editAuthorId, setEditAuthorId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Photo selection / move
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);

  const { data: registro, isLoading } = useQuery({
    queryKey: ["op-registro-detail", registroId],
    enabled: !!registroId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_registros")
        .select(`
          *,
          author:profiles!operacao_registros_author_profile_id_fkey(id,full_name),
          etapa:operacao_etapas(id,name),
          frente:operacao_frentes(id,name,event_id,current_lead_id,company_id)
        `)
        .eq("id", registroId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const eventId = (registro as any)?.frente?.event_id ?? null;
  const isGeneralProducer = useIsEventGeneralProducer(eventId);

  const { data: medias } = useQuery({
    queryKey: ["op-registro-detail-media", registroId],
    enabled: !!registroId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registro_media")
        .select("*")
        .eq("registro_id", registroId!)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: frentesDoEvento } = useQuery({
    queryKey: ["op-frentes-do-evento", eventId],
    enabled: !!eventId && open && (editing || moveOpen),
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,company_id")
        .eq("event_id", eventId!)
        .order("name");
      return data ?? [];
    },
  });

  const { data: etapasDoEvento } = useQuery({
    queryKey: ["op-etapas-do-evento", eventId],
    enabled: !!eventId && open && editing,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name,frente_id,operacao_frentes(name)")
        .eq("operacao_frentes.event_id", eventId!)
        .order("name");
      // filter by event manually because nested filter may not apply
      const { data: frentes } = await supabase
        .from("operacao_frentes")
        .select("id")
        .eq("event_id", eventId!);
      const ids = new Set((frentes ?? []).map((f: any) => f.id));
      return (data ?? []).filter((e: any) => ids.has(e.frente_id));
    },
  });

  // Authors pickable: distinct profiles in team of any frente do evento + current author.
  // Admin/Manager e Produtor Geral do evento podem trocar o autor.
  const canChangeAuthor = isAdmin || isManager || isGeneralProducer;
  const { data: possibleAuthors } = useQuery({
    queryKey: ["op-possible-authors", eventId, registro?.author_profile_id],
    enabled: !!eventId && open && editing && canChangeAuthor,
    queryFn: async () => {
      const { data: frentes } = await supabase
        .from("operacao_frentes").select("id").eq("event_id", eventId!);
      const fIds = (frentes ?? []).map((f: any) => f.id);
      let profIds: string[] = [];
      if (fIds.length) {
        const { data: team } = await supabase
          .from("operacao_frente_team").select("profile_id").in("frente_id", fIds).eq("active", true);
        profIds = Array.from(new Set((team ?? []).map((t: any) => t.profile_id)));
      }
      if (registro?.author_profile_id && !profIds.includes(registro.author_profile_id)) {
        profIds.push(registro.author_profile_id);
      }
      if (!profIds.length) return [];
      const { data: profs } = await supabase
        .from("profiles").select("id,full_name,email").in("id", profIds);
      return (profs ?? []).sort((a: any, b: any) =>
        (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
    },
  });

  useEffect(() => {
    if (open && registro) {
      setEditText(registro.text ?? "");
      setEditKind(registro.kind ?? "observacao");
      setEditFrenteId(registro.frente_id ?? "");
      setEditEtapaId(registro.etapa_id ?? "__none__");
      setEditDate(registro.created_at ? format(new Date(registro.created_at), "yyyy-MM-dd'T'HH:mm") : "");
      setEditAuthorId(registro.author_profile_id ?? "");
      setEditing(startInEdit);
    }
    if (!open) {
      setEditing(false);
      setConfirmDelete(false);
      setSelectMode(false);
      setSelectedMediaIds(new Set());
      setMoveOpen(false);
    }
  }, [open, registro, startInEdit]);

  const isLeadOfFrente =
    !!registro && ((registro as any).frente?.current_lead_id === user?.id ||
      leadFrenteIdSet.has(registro.frente_id));

  const canEdit =
    !!registro &&
    (user?.id === registro.author_profile_id || isAdmin || isManager || isGeneralProducer || isLeadOfFrente);
  const canDelete = isAdmin || isManager || isGeneralProducer;

  const handleSave = async () => {
    if (!registroId) return;
    if (!editFrenteId) {
      toast({ title: "Frente obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);
    const originalFrenteId = registro?.frente_id;
    const newCompanyId = (frentesDoEvento ?? []).find((f: any) => f.id === editFrenteId)?.company_id;
    const payload: any = {
      text: editText,
      kind: editKind,
      frente_id: editFrenteId,
      etapa_id: editEtapaId === "__none__" ? null : editEtapaId,
      updated_at: new Date().toISOString(),
    };
    if (editDate) payload.created_at = new Date(editDate).toISOString();
    if (newCompanyId) payload.company_id = newCompanyId;
    if (canChangeAuthor && editAuthorId && editAuthorId !== registro?.author_profile_id) {
      payload.author_profile_id = editAuthorId;
    }

    const { error } = await supabase.from("operacao_registros").update(payload).eq("id", registroId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registo atualizado" });
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    qc.invalidateQueries({ queryKey: ["op-registro-detail", registroId] });
    if (originalFrenteId && originalFrenteId !== editFrenteId) {
      qc.invalidateQueries({ queryKey: ["op-chamados"] });
    }
  };

  const handleDelete = async () => {
    if (!registroId) return;
    setDeleting(true);
    const { error } = await supabase.from("operacao_registros").delete().eq("id", registroId);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registo apagado" });
    setConfirmDelete(false);
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    onClose();
  };

  const toggleSelect = (id: string) => {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMediaIds(new Set((medias ?? []).map((m: any) => m.id)));
  };

  const kindMeta = registro ? KIND_LABEL[registro.kind] ?? { label: registro.kind, variant: "outline" as const } : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="bottom"
          className="h-[92vh] overflow-y-auto sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-2xl sm:w-full sm:rounded-t-xl"
        >
          <SheetHeader>
            <SheetTitle>Detalhe do registo</SheetTitle>
          </SheetHeader>

          {isLoading || !registro ? (
            <div className="py-8 text-center text-sm text-muted-foreground">A carregar...</div>
          ) : (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                {kindMeta && <Badge variant={kindMeta.variant}>{kindMeta.label}</Badge>}
                {registro.kind === "chamado" && <PriorityBadge priority={registro.priority} />}
                <span className="font-medium text-foreground">{registro.author?.full_name ?? "—"}</span>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(registro.created_at), { addSuffix: true, locale: ptBR })}
                </span>
                {registro.updated_at && registro.updated_at !== registro.created_at && (
                  <span className="italic">(editado)</span>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <RadioGroup value={editKind} onValueChange={setEditKind} className="flex flex-wrap gap-3 mt-1">
                      {Object.entries(KIND_LABEL).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1.5">
                          <RadioGroupItem value={k} id={`kind-${k}`} />
                          <Label htmlFor={`kind-${k}`} className="text-sm font-normal cursor-pointer">
                            {v.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <div>
                    <Label className="text-xs">Texto</Label>
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={5}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Frente</Label>
                      <Select value={editFrenteId} onValueChange={setEditFrenteId}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Escolher..." /></SelectTrigger>
                        <SelectContent>
                          {(frentesDoEvento ?? []).map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Etapa (qualquer frente)</Label>
                      <Select value={editEtapaId} onValueChange={setEditEtapaId}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem etapa</SelectItem>
                          {(etapasDoEvento ?? []).map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name} {e.operacao_frentes?.name ? `· ${e.operacao_frentes.name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="datetime-local"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {canChangeAuthor && (
                    <div>
                      <Label className="text-xs">Autor</Label>
                      <Select value={editAuthorId} onValueChange={setEditAuthorId}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Escolher autor..." /></SelectTrigger>
                        <SelectContent>
                          {(possibleAuthors ?? []).map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name ?? p.email ?? p.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Edição de media não suportada aqui — usa "Mover fotos" no modo de visualização.
                  </p>
                </div>
              ) : (
                <>
                  {registro.text && (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{registro.text}</p>
                  )}
                  {(medias ?? []).length > 0 && (
                    <>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {selectMode
                            ? `${selectedMediaIds.size} selecionada(s)`
                            : `${medias!.length} foto(s)`}
                        </span>
                        <div className="flex gap-2">
                          {canEdit && !selectMode && (
                            <Button size="sm" variant="ghost" onClick={() => setSelectMode(true)}>
                              <CheckSquare className="h-4 w-4 mr-1" /> Selecionar
                            </Button>
                          )}
                          {selectMode && (
                            <>
                              <Button size="sm" variant="ghost" onClick={selectAll}>Todas</Button>
                              <Button
                                size="sm"
                                variant="default"
                                disabled={selectedMediaIds.size === 0}
                                onClick={() => setMoveOpen(true)}
                              >
                                <MoveRight className="h-4 w-4 mr-1" /> Mover
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setSelectMode(false); setSelectedMediaIds(new Set()); }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(medias ?? []).map((m: any) => (
                          <DetailMediaThumb
                            key={m.id}
                            m={m}
                            selectMode={selectMode}
                            selected={selectedMediaIds.has(m.id)}
                            onToggle={() => toggleSelect(m.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {registro.audio_url && <DetailAudio path={registro.audio_url} />}
                  <div className="border-t pt-3 space-y-1 text-xs text-muted-foreground">
                    {registro.frente && (
                      <div>
                        <span className="font-medium">Frente:</span> {registro.frente.name}
                      </div>
                    )}
                    {registro.etapa && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Etapa:</span>
                        <Link
                          to={`/operacao/etapa/${registro.etapa.id}`}
                          onClick={onClose}
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          {registro.etapa.name} <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                {editing ? (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Guardar
                    </Button>
                  </>
                ) : (
                  <>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar registo
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Apagar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este registo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não pode ser desfeita. O texto, media e áudio associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {moveOpen && registro && (
        <MovePhotosDialog
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          sourceRegistroId={registro.id}
          sourceFrenteId={registro.frente_id}
          companyId={registro.company_id}
          eventId={eventId}
          frentesDoEvento={frentesDoEvento ?? []}
          selectedMediaIds={Array.from(selectedMediaIds)}
          onMoved={(destRegistroId, destFrenteId) => {
            setSelectMode(false);
            setSelectedMediaIds(new Set());
            setMoveOpen(false);
            qc.invalidateQueries({ queryKey: ["op-registro-detail-media", registro.id] });
            qc.invalidateQueries({ queryKey: ["op-registro-detail-media", destRegistroId] });
            qc.invalidateQueries({ queryKey: ["op-registros"] });
            qc.invalidateQueries({ queryKey: ["op-registro-detail", registro.id] });
            qc.invalidateQueries({ queryKey: ["op-registro-detail", destRegistroId] });
            if (destFrenteId && destFrenteId !== registro.frente_id) {
              qc.invalidateQueries({ queryKey: ["op-chamados"] });
            }
          }}
        />
      )}
    </>
  );
}

function DetailMediaThumb({
  m,
  selectMode,
  selected,
  onToggle,
}: {
  m: any;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const p = m.thumbnail_url ?? m.file_url;
    resolveOperacaoMediaUrl({ path: p, mediaId: m.id, registroId: m.registro_id })
      .then((signedUrl) => signedUrl && setUrl(signedUrl));
  }, [m]);
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectMode) { onToggle(); return; }
    if (!full) {
      const signedUrl = await resolveOperacaoMediaUrl({ path: m.file_url, mediaId: m.id, registroId: m.registro_id });
      if (signedUrl) setFull(signedUrl);
    }
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`relative aspect-square rounded overflow-hidden bg-muted ${selectMode && selected ? "ring-2 ring-primary" : ""}`}
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full animate-pulse" />
        )}
        {selectMode && (
          <span className="absolute top-1 left-1 bg-background/90 rounded p-0.5">
            <Checkbox checked={selected} />
          </span>
        )}
        {m.file_type === "video" && (
          <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">▶ vídeo</span>
        )}
      </button>
      {open && full && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
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

function DetailAudio({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    resolveOperacaoMediaUrl({ path }).then((signedUrl) => signedUrl && setUrl(signedUrl));
  }, [path]);
  if (!url) return null;
  return <audio controls src={url} className="w-full" onClick={(e) => e.stopPropagation()} />;
}

function MovePhotosDialog({
  open,
  onClose,
  sourceRegistroId,
  sourceFrenteId,
  companyId,
  eventId,
  frentesDoEvento,
  selectedMediaIds,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  sourceRegistroId: string;
  sourceFrenteId: string;
  companyId: string;
  eventId: string | null;
  frentesDoEvento: any[];
  selectedMediaIds: string[];
  onMoved: (destRegistroId: string, destFrenteId: string | null) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [pickedRegistroId, setPickedRegistroId] = useState<string | null>(null);
  const [newFrenteId, setNewFrenteId] = useState<string>(sourceFrenteId);
  const [newKind, setNewKind] = useState<string>("observacao");
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: candidates } = useQuery({
    queryKey: ["op-registros-candidates", eventId, search],
    enabled: !!eventId && open && tab === "existing",
    queryFn: async () => {
      const { data: frentes } = await supabase
        .from("operacao_frentes")
        .select("id,name")
        .eq("event_id", eventId!);
      const frenteIds = (frentes ?? []).map((f: any) => f.id);
      const nameById = new Map((frentes ?? []).map((f: any) => [f.id, f.name]));
      if (frenteIds.length === 0) return [];
      let q = supabase
        .from("operacao_registros")
        .select("id,text,kind,created_at,frente_id")
        .in("frente_id", frenteIds)
        .neq("id", sourceRegistroId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) q = q.ilike("text", `%${search.trim()}%`);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({ ...r, frente_name: nameById.get(r.frente_id) }));
    },
  });

  const confirm = async () => {
    if (selectedMediaIds.length === 0) return;
    setBusy(true);
    try {
      let destRegistroId: string | null = null;
      let destFrenteId: string | null = null;

      if (tab === "existing") {
        if (!pickedRegistroId) {
          toast({ title: "Escolhe o registo de destino", variant: "destructive" });
          setBusy(false);
          return;
        }
        destRegistroId = pickedRegistroId;
        const picked = (candidates ?? []).find((c: any) => c.id === pickedRegistroId);
        destFrenteId = picked?.frente_id ?? null;
      } else {
        if (!newFrenteId) {
          toast({ title: "Escolhe a frente", variant: "destructive" });
          setBusy(false);
          return;
        }
        const frenteCompanyId =
          frentesDoEvento.find((f) => f.id === newFrenteId)?.company_id ?? companyId;
        const { data: created, error } = await supabase
          .from("operacao_registros")
          .insert({
            frente_id: newFrenteId,
            company_id: frenteCompanyId,
            author_profile_id: user!.id,
            kind: newKind,
            text: newText.trim() || null,
          })
          .select("id,frente_id")
          .single();
        if (error || !created) throw error ?? new Error("Falha ao criar registo");
        destRegistroId = created.id;
        destFrenteId = created.frente_id;
      }

      // sort_order base no destino
      const { data: lastInDest } = await supabase
        .from("operacao_registro_media")
        .select("sort_order")
        .eq("registro_id", destRegistroId!)
        .order("sort_order", { ascending: false })
        .limit(1);
      let next = ((lastInDest?.[0]?.sort_order ?? -1) as number) + 1;

      for (const mediaId of selectedMediaIds) {
        const { error } = await supabase
          .from("operacao_registro_media")
          .update({ registro_id: destRegistroId!, sort_order: next })
          .eq("id", mediaId);
        if (error) throw error;
        next++;
      }

      toast({ title: `${selectedMediaIds.length} foto(s) movida(s)` });
      onMoved(destRegistroId!, destFrenteId);
    } catch (e: any) {
      toast({ title: "Erro ao mover fotos", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover {selectedMediaIds.length} foto(s)</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="existing">Registo existente</TabsTrigger>
            <TabsTrigger value="new">Novo registo</TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="space-y-2">
            <Input
              placeholder="Pesquisar pelo texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto border rounded divide-y">
              {(candidates ?? []).length === 0 && (
                <div className="p-3 text-sm text-muted-foreground text-center">Sem registos</div>
              )}
              {(candidates ?? []).map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedRegistroId(c.id)}
                  className={`w-full text-left p-2 text-sm hover:bg-muted ${pickedRegistroId === c.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{KIND_LABEL[c.kind]?.label ?? c.kind}</Badge>
                    <span>{c.frente_name}</span>
                    <span>·</span>
                    <span>{format(new Date(c.created_at), "dd/MM HH:mm")}</span>
                  </div>
                  <div className="line-clamp-2">{c.text || <em className="text-muted-foreground">(sem texto)</em>}</div>
                </button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="new" className="space-y-3">
            <div>
              <Label className="text-xs">Frente</Label>
              <Select value={newFrenteId} onValueChange={setNewFrenteId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frentesDoEvento.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={newKind} onValueChange={setNewKind}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).filter(([k]) => k !== "chamado").map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Texto (opcional)</Label>
              <Textarea rows={3} value={newText} onChange={(e) => setNewText(e.target.value)} />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
