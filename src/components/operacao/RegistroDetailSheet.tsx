import { useEffect, useMemo, useRef, useState } from "react";
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
          frente:operacao_frentes(id,name,type,event_id,current_lead_id,company_id)
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
        .select("id,name,type,company_id")
        .eq("event_id", eventId!)
        .order("name");
      return data ?? [];
    },
  });

  const selectedEditFrente = (frentesDoEvento ?? []).find((f: any) => f.id === editFrenteId);
  // Tipo da frente: prefere o que vem no registo (sempre disponível); cai para o lookup do evento.
  const editFrenteType: string | undefined =
    (editFrenteId && editFrenteId === registro?.frente_id ? (registro as any)?.frente?.type : undefined) ??
    (selectedEditFrente as any)?.type;

  const { data: etapasDoEvento } = useQuery({
    queryKey: ["op-etapas-da-frente", editFrenteId, editFrenteType ?? "unknown"],
    enabled: !!editFrenteId && open && editing && !!editFrenteType,
    queryFn: async () => {
      let q = supabase
        .from("operacao_etapas")
        .select("id,name,frente_id,zone_id");

      if (editFrenteType === "zone") {
        q = q.or(`frente_id.eq.${editFrenteId},zone_id.eq.${editFrenteId}`);
      } else {
        q = q.eq("frente_id", editFrenteId);
      }

      const { data } = await q.order("name");
      return data ?? [];
    },
  });

  // Authors pickable: distinct profiles in team of any frente do evento + current author.
  // Admin/Manager e Produtor Geral do evento podem trocar o autor.
  const canChangeAuthor = isAdmin || isManager || isGeneralProducer;
  const { data: possibleAuthors } = useQuery({
    queryKey: ["op-possible-authors", eventId, registro?.author_profile_id, registro?.company_id],
    enabled: !!eventId && open && editing && canChangeAuthor,
    queryFn: async () => {
      const profIdSet = new Set<string>();

      // 1) Membros das frentes do evento
      const { data: frentes } = await supabase
        .from("operacao_frentes").select("id").eq("event_id", eventId!);
      const fIds = (frentes ?? []).map((f: any) => f.id);
      if (fIds.length) {
        const { data: team } = await supabase
          .from("operacao_frente_team").select("profile_id").in("frente_id", fIds).eq("active", true);
        (team ?? []).forEach((t: any) => t.profile_id && profIdSet.add(t.profile_id));
      }

      // 2) Membros do evento (event_team_members) — produtores gerais, diretores, etc.
      const { data: evTeam } = await supabase
        .from("event_team_members").select("profile_id").eq("event_id", eventId!);
      (evTeam ?? []).forEach((t: any) => t.profile_id && profIdSet.add(t.profile_id));

      // 3) Perfis da empresa (admins/managers/editores que podem registar)
      if (registro?.company_id) {
        const { data: companyProfs } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", registro.company_id)
          .is("archived_at", null)
          .limit(500);
        (companyProfs ?? []).forEach((p: any) => p.id && profIdSet.add(p.id));
      }

      // 4) Autor atual sempre presente
      if (registro?.author_profile_id) profIdSet.add(registro.author_profile_id);

      const profIds = Array.from(profIdSet);
      if (!profIds.length) return [];
      const { data: profs } = await supabase
        .from("profiles").select("id,full_name,email").in("id", profIds);
      return (profs ?? []).sort((a: any, b: any) =>
        (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
    },
  });

  // Hidrata o formulário apenas quando o sheet abre (não a cada refetch),
  // para evitar voltar a entrar em modo de edição depois de gravar.
  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && registro && hydratedForRef.current !== registro.id) {
      hydratedForRef.current = registro.id;
      setEditText(registro.text ?? "");
      setEditKind(registro.kind ?? "observacao");
      setEditFrenteId(registro.frente_id ?? "");
      setEditEtapaId(registro.etapa_id ?? "__none__");
      setEditDate(registro.created_at ? format(new Date(registro.created_at), "yyyy-MM-dd'T'HH:mm") : "");
      setEditAuthorId(registro.author_profile_id ?? "");
      setEditing(startInEdit);
    }
    if (!open) {
      hydratedForRef.current = null;
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
    onClose();
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
                      <Select value={editFrenteId} onValueChange={(v) => { setEditFrenteId(v); setEditEtapaId("__none__"); }}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Escolher..." /></SelectTrigger>
                        <SelectContent>
                          {(frentesDoEvento ?? []).map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Etapa</Label>
                      <Select
                        value={editEtapaId}
                        onValueChange={setEditEtapaId}
                        disabled={!editFrenteId}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem etapa</SelectItem>
                          {(etapasDoEvento ?? []).map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editFrenteId && (etapasDoEvento ?? []).length === 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Esta frente não tem etapas.
                        </p>
                      )}
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

export function MovePhotosDialog({
  open,
  onClose,
  sourceRegistroId,
  sourceFrenteId,
  companyId,
  eventId,
  frentesDoEvento: frentesDoEventoProp,
  selectedMediaIds,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  sourceRegistroId: string;
  sourceFrenteId: string;
  companyId: string;
  eventId: string | null;
  frentesDoEvento?: any[];
  selectedMediaIds: string[];
  onMoved: (destRegistroId: string, destFrenteId: string | null) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Wizard
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — fotos
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedMediaIds));

  // Step 2 — destino
  const [destFrenteId, setDestFrenteId] = useState<string>(sourceFrenteId);
  const [destEtapaId, setDestEtapaId] = useState<string>("__none__");
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [pickedRegistroId, setPickedRegistroId] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<string>("observacao");
  const [newText, setNewText] = useState("");

  const [busy, setBusy] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setStep(1);
      setPicked(new Set(selectedMediaIds));
      setDestFrenteId(sourceFrenteId);
      setDestEtapaId("__none__");
      setMode("pick");
      setPickedRegistroId(null);
      setNewKind("observacao");
      setNewText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceRegistroId]);

  // Fotos do registo de origem
  const { data: sourceMedia } = useQuery({
    queryKey: ["op-move-source-media", sourceRegistroId],
    enabled: open && !!sourceRegistroId,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registro_media")
        .select("*")
        .eq("registro_id", sourceRegistroId)
        .order("sort_order");
      return data ?? [];
    },
  });

  // Frentes do evento
  const { data: frentesFetched } = useQuery({
    queryKey: ["op-move-frentes-do-evento", eventId],
    enabled: open && !frentesDoEventoProp && !!eventId,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,company_id")
        .eq("event_id", eventId!)
        .order("display_order");
      return data ?? [];
    },
  });
  const frentesDoEvento = frentesDoEventoProp ?? frentesFetched ?? [];

  // Etapas filtradas pela frente escolhida
  const { data: etapasDaFrente } = useQuery({
    queryKey: ["op-move-etapas-da-frente", destFrenteId],
    enabled: open && step === 2 && !!destFrenteId,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name,frente_id")
        .eq("frente_id", destFrenteId)
        .order("display_order");
      return data ?? [];
    },
  });

  // Registos existentes na Frente (+Etapa, se selecionada)
  const { data: candidates, isFetching: loadingCandidates } = useQuery({
    queryKey: ["op-move-candidates", destFrenteId, destEtapaId, sourceRegistroId],
    enabled: open && step === 2 && !!destFrenteId,
    queryFn: async () => {
      let q = supabase
        .from("operacao_registros")
        .select("id,text,kind,created_at,etapa_id")
        .eq("frente_id", destFrenteId)
        .neq("id", sourceRegistroId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (destEtapaId !== "__none__") q = q.eq("etapa_id", destEtapaId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Se filtros aplicados e não há registos → propor automaticamente "criar novo"
  useEffect(() => {
    if (step !== 2 || loadingCandidates) return;
    if (!candidates) return;
    if (candidates.length === 0 && mode === "pick") {
      setMode("new");
    } else if (candidates.length > 0 && mode === "new" && !pickedRegistroId) {
      // mantém modo escolhido pelo user; não força
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, loadingCandidates, step]);

  // Reset registo escolhido quando muda filtro
  useEffect(() => {
    setPickedRegistroId(null);
  }, [destFrenteId, destEtapaId]);

  const destFrenteName = frentesDoEvento.find((f: any) => f.id === destFrenteId)?.name;
  const destEtapaName = (etapasDaFrente ?? []).find((e: any) => e.id === destEtapaId)?.name;
  const destRegistro = (candidates ?? []).find((c: any) => c.id === pickedRegistroId);

  const canConfirm =
    picked.size > 0 &&
    !!destFrenteId &&
    (mode === "pick" ? !!pickedRegistroId : true);

  const confirm = async () => {
    const mediaIds = Array.from(picked);
    if (mediaIds.length === 0 || !destFrenteId) return;
    setBusy(true);
    try {
      let destRegistroId: string | null = null;
      let destFrenteIdFinal: string | null = destFrenteId;

      if (mode === "pick") {
        if (!pickedRegistroId) throw new Error("Escolhe o registo de destino");
        destRegistroId = pickedRegistroId;
      } else {
        const frenteCompanyId =
          frentesDoEvento.find((f: any) => f.id === destFrenteId)?.company_id ?? companyId;
        const { data: created, error } = await supabase
          .from("operacao_registros")
          .insert({
            frente_id: destFrenteId,
            etapa_id: destEtapaId === "__none__" ? null : destEtapaId,
            company_id: frenteCompanyId,
            author_profile_id: user!.id,
            kind: newKind,
            text: newText.trim() || null,
          })
          .select("id,frente_id")
          .single();
        if (error || !created) throw error ?? new Error("Falha ao criar registo");
        destRegistroId = created.id;
        destFrenteIdFinal = created.frente_id;
      }

      const { data: lastInDest } = await supabase
        .from("operacao_registro_media")
        .select("sort_order")
        .eq("registro_id", destRegistroId!)
        .order("sort_order", { ascending: false })
        .limit(1);
      let next = ((lastInDest?.[0]?.sort_order ?? -1) as number) + 1;

      for (const mediaId of mediaIds) {
        const { error } = await supabase
          .from("operacao_registro_media")
          .update({ registro_id: destRegistroId!, sort_order: next })
          .eq("id", mediaId);
        if (error) throw error;
        next++;
      }

      toast({ title: `${mediaIds.length} foto(s) movida(s)` });
      onMoved(destRegistroId!, destFrenteIdFinal);
    } catch (e: any) {
      toast({ title: "Erro ao mover fotos", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Mover fotos — escolher fotos" : "Mover fotos — escolher destino"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({picked.size}/{(sourceMedia ?? []).length} selecionadas)
            </span>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-xs">Escolhe as fotos a mover</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setPicked(new Set((sourceMedia ?? []).map((m: any) => m.id)))}
                >
                  Todas
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => setPicked(new Set())}
                >
                  Nenhuma
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[55vh] overflow-y-auto p-1 border rounded">
              {(sourceMedia ?? []).map((m: any) => (
                <MovePhotoThumb
                  key={m.id}
                  m={m}
                  selected={picked.has(m.id)}
                  onToggle={() => {
                    setPicked((prev) => {
                      const n = new Set(prev);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    });
                  }}
                />
              ))}
              {(sourceMedia ?? []).length === 0 && (
                <div className="col-span-5 text-center text-xs text-muted-foreground p-3">
                  Sem fotos neste registo
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* Filtros de destino */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Zona / Serviço (Frente)</Label>
                <Select value={destFrenteId} onValueChange={setDestFrenteId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {frentesDoEvento.map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Etapa (opcional)</Label>
                <Select value={destEtapaId} onValueChange={setDestEtapaId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todas / sem etapa</SelectItem>
                    {(etapasDaFrente ?? []).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggle modo: só mostra "Registo existente" se houver candidatos */}
            {(candidates ?? []).length === 0 && !loadingCandidates ? (
              <div className="p-3 border rounded bg-muted/30 text-sm">
                <div className="font-medium">Criar novo registo aqui</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Não há registos nesta Zona/Serviço{destEtapaName ? " + Etapa" : ""}. Vai ser criado um novo registo automaticamente.
                </div>
              </div>
            ) : (
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as any)}
                className="grid grid-cols-2 gap-2"
              >
                <label
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${mode === "pick" ? "border-primary bg-muted/40" : ""}`}
                >
                  <RadioGroupItem value="pick" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Registo existente</div>
                    <div className="text-xs text-muted-foreground">
                      {loadingCandidates ? "A carregar..." : `${(candidates ?? []).length} disponíveis`}
                    </div>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${mode === "new" ? "border-primary bg-muted/40" : ""}`}
                >
                  <RadioGroupItem value="new" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Criar novo registo aqui</div>
                    <div className="text-xs text-muted-foreground">
                      Na Frente{destEtapaName ? " + Etapa" : ""} selecionada
                    </div>
                  </div>
                </label>
              </RadioGroup>
            )}

            {mode === "pick" && (candidates ?? []).length > 0 && (
              <div className="max-h-72 overflow-y-auto border rounded divide-y">
                {false && (
                  <div />
                )}
                {(candidates ?? []).map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickedRegistroId(c.id)}
                    className={`w-full text-left p-2 text-sm hover:bg-muted ${pickedRegistroId === c.id ? "bg-muted ring-1 ring-primary" : ""}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{KIND_LABEL[c.kind]?.label ?? c.kind}</Badge>
                      <span>{format(new Date(c.created_at), "dd/MM HH:mm")}</span>
                    </div>
                    <div className="line-clamp-2">
                      {c.text || <em className="text-muted-foreground">(sem texto)</em>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {mode === "new" && (
              <div className="space-y-3 p-3 border rounded bg-muted/20">
                <div className="text-xs font-medium text-muted-foreground">
                  Dados do novo registo
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={newKind} onValueChange={setNewKind}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABEL)
                        .filter(([k]) => k !== "chamado")
                        .map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Texto (opcional)</Label>
                  <Textarea
                    rows={3}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Descreve este registo..."
                  />
                </div>
              </div>
            )}

            {/* Card de confirmação */}
            <div className="p-3 rounded-md border-2 border-primary/40 bg-primary/5 text-sm">
              <div className="text-xs font-medium uppercase text-muted-foreground mb-1">
                Vais mover {picked.size} foto(s) para:
              </div>
              <div className="font-medium">
                {destFrenteName ?? "—"}
                {destEtapaName ? <> · <span className="text-muted-foreground">{destEtapaName}</span></> : null}
              </div>
              <div className="mt-1">
                {mode === "pick" ? (
                  destRegistro ? (
                    <span>
                      Registo: <Badge variant="outline" className="ml-1">{KIND_LABEL[destRegistro.kind]?.label ?? destRegistro.kind}</Badge>{" "}
                      <span className="text-muted-foreground">
                        · {format(new Date(destRegistro.created_at), "dd/MM HH:mm")}
                      </span>
                      {destRegistro.text ? <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{destRegistro.text}</div> : null}
                    </span>
                  ) : (
                    <span className="text-destructive text-xs">Escolhe um registo na lista acima.</span>
                  )
                ) : (
                  <span>
                    <Badge variant="secondary" className="mr-1">Novo registo</Badge>
                    <span className="text-muted-foreground">
                      {KIND_LABEL[newKind]?.label ?? newKind}
                      {newText.trim() ? ` · ${newText.trim().slice(0, 60)}${newText.trim().length > 60 ? "…" : ""}` : ""}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
              Voltar
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={picked.size === 0}>
              Continuar
            </Button>
          ) : (
            <Button onClick={confirm} disabled={busy || !canConfirm}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e mover {picked.size}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovePhotoThumb({ m, selected, onToggle }: { m: any; selected: boolean; onToggle: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const p = m.thumbnail_url ?? m.file_url;
    if (!p) return;
    resolveOperacaoMediaUrl({ path: p, mediaId: m.id, registroId: m.registro_id }).then((s) => {
      if (!cancelled && s) setUrl(s);
    });
    return () => { cancelled = true; };
  }, [m]);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative aspect-square rounded overflow-hidden bg-muted border-2 transition ${selected ? "border-primary ring-2 ring-primary/40" : "border-transparent opacity-60"}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full animate-pulse" />
      )}
      {m.file_type === "video" && (
        <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">▶</span>
      )}
      <span className={`absolute top-0.5 right-0.5 h-4 w-4 rounded-full text-[10px] flex items-center justify-center font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground border"}`}>
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
