import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsEventDirectorOnly } from "@/hooks/useIsEventDirectorOnly";
import { useMyLeadFrenteIds } from "@/hooks/useMyLeadFrenteIds";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { RegistroFeed } from "@/components/operacao/RegistroFeed";
import { MediaCapture, type CapturedMedia } from "@/components/operacao/MediaCapture";
import { AudioRecorder } from "@/components/operacao/AudioRecorder";
import { EtapaAssigneeAvatars } from "@/components/operacao/EtapaAssigneeAvatars";
import { EtapaAssigneeSheet } from "@/components/operacao/EtapaAssigneeSheet";
import { EtapaSuppliersPanel } from "@/components/operacao/suppliers/EtapaSuppliersPanel";
import { EditEtapaSheet } from "@/components/operacao/EditEtapaSheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Camera, Play, Ban, CheckCircle2, ArrowLeft, Eye, Pencil, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function EtapaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [assigneeSheetOpen, setAssigneeSheetOpen] = useState(false);

  const { data: etapa, isLoading, error } = useQuery({
    queryKey: ["op-etapa", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_etapas")
        .select("*, frente:operacao_frentes!operacao_etapas_frente_id_fkey(id,name,color,current_lead_id,event_id,company_id,type), supplier:suppliers!operacao_etapas_supplier_id_fkey(name), responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id, full_name), zone:operacao_frentes!operacao_etapas_zone_id_fkey(id,name,color)")
        .eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignees } = useQuery({
    queryKey: ["op-etapa-assignees", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("profile_id, role, profiles:profile_id(id, full_name)")
        .eq("etapa_id", id!);
      return (data ?? []).map((a: any) => ({
        profile_id: a.profile_id,
        full_name: a.profiles?.full_name ?? null,
        role: a.role as "owner" | "helper",
      }));
    },
  });

  const { data: frenteLead } = useQuery({
    queryKey: ["op-frente-lead-profile", (etapa as any)?.frente?.current_lead_id],
    enabled: !!(etapa as any)?.frente?.current_lead_id,
    queryFn: async () => {
      const leadId = (etapa as any).frente.current_lead_id;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", leadId)
        .maybeSingle();
      return data;
    },
  });

  const frenteIdForNext = (etapa as any)?.frente?.id;
  const plannedStart = (etapa as any)?.planned_start;
  const { data: nextEtapa } = useQuery({
    queryKey: ["op-etapa-next", frenteIdForNext, id, plannedStart],
    enabled: !!frenteIdForNext && !!id,
    queryFn: async () => {
      let q = supabase
        .from("operacao_etapas")
        .select("id, name, planned_start")
        .eq("frente_id", frenteIdForNext)
        .neq("id", id!)
        .neq("status", "cancelled")
        .order("planned_start", { ascending: true, nullsFirst: false })
        .limit(1);
      if (plannedStart) q = q.gt("planned_start", plannedStart);
      const { data } = await q;
      return data?.[0] ?? null;
    },
  });

  const { data: prevEtapa } = useQuery({
    queryKey: ["op-etapa-prev", frenteIdForNext, id, plannedStart],
    enabled: !!frenteIdForNext && !!id,
    queryFn: async () => {
      let q = supabase
        .from("operacao_etapas")
        .select("id, name, planned_start")
        .eq("frente_id", frenteIdForNext)
        .neq("id", id!)
        .neq("status", "cancelled")
        .order("planned_start", { ascending: false, nullsFirst: false })
        .limit(1);
      if (plannedStart) q = q.lt("planned_start", plannedStart);
      const { data } = await q;
      return data?.[0] ?? null;
    },
  });

  // Hooks chamados sempre antes de early returns (Rules of Hooks)
  const eventIdForDirector = (etapa as any)?.frente?.event_id;
  const isDirectorOnly = useIsEventDirectorOnly(eventIdForDirector);
  const { leadFrenteIdSet } = useMyLeadFrenteIds();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="p-6">A carregar...</div>;
  if (error) return <div className="p-6 text-destructive">Erro ao carregar etapa: {(error as any)?.message ?? String(error)}</div>;
  if (!etapa) return <div className="p-6 text-muted-foreground">Etapa não encontrada.</div>;

  const frente = (etapa as any).frente;
  const isLead = frente?.current_lead_id === user?.id || (frente?.id && leadFrenteIdSet.has(frente.id));
  const isResponsible = etapa.responsible_profile_id === user?.id;
  const canChangeStatus = !isDirectorOnly && (isAdmin || hasPermission("manage_operacao_etapas") || isLead || isResponsible);
  const canEditAssignees = !isDirectorOnly && (isAdmin || hasPermission("manage_operacao_etapas") || isLead);
  const zone = (etapa as any).zone;
  const zoneApplies = zone && zone.id !== frente?.id;

  const inheritedProfile = (assignees ?? []).length > 0
    ? null
    : (etapa as any).responsible
      ? { id: (etapa as any).responsible.id, full_name: (etapa as any).responsible.full_name }
      : frenteLead
        ? { id: frenteLead.id, full_name: frenteLead.full_name }
        : null;
  const inheritedFrom: "responsible" | "frente_lead" | null = (assignees ?? []).length > 0
    ? null
    : (etapa as any).responsible
      ? "responsible"
      : frenteLead
        ? "frente_lead"
        : null;

  const setStatus = async (newStatus: string, extra: Record<string, any> = {}) => {
    const { error } = await supabase
      .from("operacao_etapas")
      .update({ status: newStatus, ...extra })
      .eq("id", id!);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Estado atualizado" }); qc.invalidateQueries({ queryKey: ["op-etapa", id] }); }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      {isDirectorOnly && (
        <div className="rounded-md border bg-muted/40 text-muted-foreground text-xs px-3 py-2 flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" /> Modo Diretor — só visualização
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate(`/operacao/frente/${frente.id}`, { replace: true });
        }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </button>
      <Card className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-12 w-2 rounded-full" style={{ backgroundColor: frente?.color ?? "#6b7280" }} />
          <div className="flex-1">
            <h1 className="text-lg font-bold">{etapa.name}</h1>
            <p className="text-xs text-muted-foreground">{frente?.name}</p>
          </div>
          {canEditAssignees && (
            <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} title="Editar etapa">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <OperacaoStatusBadge status={etapa.status} />
        </div>
        <div className="pt-2 border-t flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Responsáveis</span>
          <EtapaAssigneeAvatars
            assignees={assignees ?? []}
            inheritedFrom={inheritedFrom}
            inheritedProfile={inheritedProfile}
            onClick={() => setAssigneeSheetOpen(true)}
          />
        </div>
        <dl className="text-xs grid grid-cols-2 gap-1 pt-2">
          {etapa.escopo && <><dt className="text-muted-foreground">Escopo</dt><dd>{etapa.escopo}</dd></>}
          {zoneApplies && <><dt className="text-muted-foreground">Zona que atende</dt><dd>{zone.name}</dd></>}
          {etapa.supplier?.name && <><dt className="text-muted-foreground">Fornecedor</dt><dd>{etapa.supplier.name}</dd></>}
          {etapa.planned_start && <><dt className="text-muted-foreground">Início prev.</dt><dd>{new Date(etapa.planned_start).toLocaleString("pt-PT")}</dd></>}
          {etapa.planned_end && <><dt className="text-muted-foreground">Fim prev.</dt><dd>{new Date(etapa.planned_end).toLocaleString("pt-PT")}</dd></>}
        </dl>
      </Card>

      {assigneeSheetOpen && (
        <EtapaAssigneeSheet
          open={assigneeSheetOpen}
          onClose={() => setAssigneeSheetOpen(false)}
          etapaId={id!}
          frenteId={frente.id}
          companyId={frente.company_id}
          frenteLeadId={frente.current_lead_id}
          canEdit={canEditAssignees}
        />
      )}

      {(canChangeStatus || isDirectorOnly) && (
        <TooltipProvider>
          <div className="grid grid-cols-3 gap-2">
            <Tooltip><TooltipTrigger asChild>
              <span className="contents">
                <Button size="sm" variant="outline" className="w-full justify-center px-2 min-w-0" disabled={!canChangeStatus || etapa.status === "in_progress"} onClick={() => setStatus("in_progress", { actual_start: new Date().toISOString() })}>
                  <Play className="h-4 w-4 mr-1 shrink-0" /> <span className="truncate">Iniciar</span>
                </Button>
              </span>
            </TooltipTrigger>{isDirectorOnly && <TooltipContent>Sem permissão para editar</TooltipContent>}</Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <span className="contents">
                <Button size="sm" variant="outline" className="w-full justify-center px-2 min-w-0" disabled={!canChangeStatus || etapa.status === "blocked"} onClick={() => setStatus("blocked")}>
                  <Ban className="h-4 w-4 mr-1 shrink-0" /> <span className="truncate">Bloquear</span>
                </Button>
              </span>
            </TooltipTrigger>{isDirectorOnly && <TooltipContent>Sem permissão para editar</TooltipContent>}</Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <span className="contents">
                <Button size="sm" variant="outline" className="w-full justify-center px-2 min-w-0" disabled={!canChangeStatus || etapa.status === "done"} onClick={() => setStatus("done", { actual_end: new Date().toISOString() })}>
                  <CheckCircle2 className="h-4 w-4 mr-1 shrink-0" /> <span className="truncate">Concluir</span>
                </Button>
              </span>
            </TooltipTrigger>{isDirectorOnly && <TooltipContent>Sem permissão para editar</TooltipContent>}</Tooltip>
          </div>
        </TooltipProvider>
      )}

      {nextEtapa && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-center"
          onClick={() => navigate(`/operacao/etapa/${nextEtapa.id}`)}
        >
          Próxima etapa: {nextEtapa.name} <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )}

      {!isDirectorOnly && (
        <Button size="lg" className="w-full" onClick={() => setSheetOpen(true)}>
          <Camera className="h-5 w-5 mr-2" /> Registar
        </Button>
      )}

      <div className="border-t pt-4">
        <EtapaSuppliersPanel etapaId={id!} canEdit={canEditAssignees} />
      </div>


      <RegistroFeed filter={{ etapa_id: id! }} />

      {sheetOpen && (
        <RegistroSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          etapaId={id!}
          frenteId={frente.id}
          eventId={frente.event_id}
          companyId={frente.company_id}
        />
      )}

      {editOpen && (
        <EditEtapaSheet
          etapaId={id!}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

function RegistroSheet({
  open, onClose, etapaId, frenteId, eventId, companyId,
}: { open: boolean; onClose: () => void; etapaId: string; frenteId: string; eventId: string; companyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState("evolucao");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [audio, setAudio] = useState<string | null>(null);
  const [registroId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    // OP-10b: RPC atómica (registo + media numa única transação)
    const { error } = await supabase.rpc("create_registro_with_media", {
      p_registro: {
        id: registroId,
        frente_id: frenteId,
        etapa_id: etapaId,
        author_profile_id: user.id,
        company_id: companyId,
        kind,
        text: text.trim() || null,
        audio_url: audio,
        metadata: {},
      },
      p_media: media.map((m, i) => ({
        file_url: m.file_url,
        thumbnail_url: m.thumbnail_url,
        file_type: m.file_type,
        sort_order: i,
      })),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro a guardar registo", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registo guardado" });
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    onClose();
  };


  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-2xl sm:w-full sm:rounded-t-xl">
        <SheetHeader><SheetTitle>Novo registo</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <RadioGroup value={kind} onValueChange={setKind} className="grid grid-cols-3 gap-2">
            {[["evolucao","Evolução"],["observacao","Observação"],["punch","Pendência"]].map(([v,l]) => (
              <Label key={v} className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                <RadioGroupItem value={v} /> <span className="text-sm">{l}</span>
              </Label>
            ))}
          </RadioGroup>
          <Textarea placeholder="Descreve..." rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <MediaCapture companyId={companyId} eventId={eventId} registroId={registroId} value={media} onChange={setMedia} onBusyChange={setMediaBusy} />
          <AudioRecorder companyId={companyId} eventId={eventId} registroId={registroId} value={audio} onChange={setAudio} onBusyChange={setAudioBusy} />
          <Button onClick={submit} disabled={saving || mediaBusy || audioBusy} className="w-full" size="lg">
            {saving ? "A guardar..." : mediaBusy || audioBusy ? "A enviar anexos..." : "Guardar registo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
