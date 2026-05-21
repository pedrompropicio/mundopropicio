import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
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
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editText, setEditText] = useState("");
  const [editKind, setEditKind] = useState("observacao");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
          frente:operacao_frentes(id,name)
        `)
        .eq("id", registroId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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

  useEffect(() => {
    if (open && registro) {
      setEditText(registro.text ?? "");
      setEditKind(registro.kind ?? "observacao");
      setEditing(startInEdit);
    }
    if (!open) {
      setEditing(false);
      setConfirmDelete(false);
    }
  }, [open, registro, startInEdit]);

  const canEdit =
    !!registro &&
    (user?.id === registro.author_profile_id || isAdmin || isManager);
  const canDelete = isAdmin || isManager;

  const handleSave = async () => {
    if (!registroId) return;
    setSaving(true);
    const { error } = await supabase
      .from("operacao_registros")
      .update({ text: editText, kind: editKind, updated_at: new Date().toISOString() })
      .eq("id", registroId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registo atualizado" });
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    qc.invalidateQueries({ queryKey: ["op-registro-detail", registroId] });
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
                  <p className="text-xs text-muted-foreground">
                    Edição de media não suportada nesta versão.
                  </p>
                </div>
              ) : (
                <>
                  {registro.text && (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{registro.text}</p>
                  )}
                  {(medias ?? []).length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {(medias ?? []).map((m: any) => (
                        <DetailMediaThumb key={m.id} m={m} />
                      ))}
                    </div>
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
                        <Pencil className="h-4 w-4 mr-1" /> Editar
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
    </>
  );
}

function DetailMediaThumb({ m }: { m: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const p = m.thumbnail_url ?? m.file_url;
    resolveOperacaoMediaUrl({ path: p, mediaId: m.id, registroId: m.registro_id })
      .then((signedUrl) => signedUrl && setUrl(signedUrl));
  }, [m]);
  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
        onClick={handleOpen}
        className="relative aspect-square rounded overflow-hidden bg-muted"
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full animate-pulse" />
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
