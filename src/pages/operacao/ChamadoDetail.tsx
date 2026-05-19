import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { RegistroFeed } from "@/components/operacao/RegistroFeed";
import { MediaCapture, type CapturedMedia } from "@/components/operacao/MediaCapture";
import { Check, Play, ArrowLeft, AlertCircle } from "lucide-react";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

export default function ChamadoDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [resolveOpen, setResolveOpen] = useState(false);

  const { data: c } = useQuery({
    queryKey: ["op-chamado", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("*, frente:operacao_frentes(id,name,color,current_lead_id,event_id,company_id), etapa:operacao_etapas(id,name), author:profiles!operacao_registros_author_profile_id_fkey(full_name)")
        .eq("id", id!).maybeSingle();
      return data;
    },
  });

  if (!c) return <div className="p-6">A carregar...</div>;
  const frente = (c as any).frente;
  const isLead = frente?.current_lead_id === user?.id;
  const slaInfo = computeSLA(c.sla_due_at);

  const ack = async () => {
    const { error } = await supabase.from("operacao_registros")
      .update({ acked_at: new Date().toISOString(), acked_by_profile_id: user!.id })
      .eq("id", id!);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Reconhecido (ACK)" }); qc.invalidateQueries({ queryKey: ["op-chamado", id] }); }
  };

  const startWork = async () => {
    const { error } = await supabase.from("operacao_registros").update({ status: "in_progress" }).eq("id", id!);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Em curso" }); qc.invalidateQueries({ queryKey: ["op-chamado", id] }); }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      <Link to="/operacao/chamados" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={c.priority} size="large" />
          <OperacaoStatusBadge status={c.status} kind="chamado" className="ml-auto" />
        </div>
        <p className="text-base">{c.text}</p>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Frente: <Link to={`/operacao/frente/${frente?.id}`} className="text-primary underline">{frente?.name}</Link>
            {(c as any).etapa?.name && <> · Etapa: <Link to={`/operacao/etapa/${(c as any).etapa.id}`} className="text-primary underline">{(c as any).etapa.name}</Link></>}
          </p>
          <p>por {(c as any).author?.full_name} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}</p>
        </div>

        {/* SLA */}
        {c.status !== "resolved" && c.status !== "closed" && slaInfo && (
          <div className={"text-sm px-3 py-2 rounded font-medium flex items-center gap-2 " + slaInfo.cls}>
            <AlertCircle className="h-4 w-4" /> {slaInfo.label}
          </div>
        )}

        {/* Timeline */}
        <div className="border-t pt-3 grid grid-cols-4 gap-1 text-[10px] text-center">
          <Step label="Criado" active />
          <Step label="ACK" active={!!c.acked_at} />
          <Step label="Em curso" active={c.status === "in_progress" || c.status === "resolved" || c.status === "closed"} />
          <Step label="Resolvido" active={c.status === "resolved" || c.status === "closed"} />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 pt-2">
          {!c.acked_at && isLead && c.status === "open" && (
            <Button onClick={ack} size="lg" variant="default"><Check className="h-4 w-4 mr-2" /> ACK</Button>
          )}
          {c.status === "open" && (
            <Button onClick={startWork} size="lg" variant="outline"><Play className="h-4 w-4 mr-2" /> Iniciar trabalho</Button>
          )}
          {(c.status === "open" || c.status === "in_progress") && (
            <Button onClick={() => setResolveOpen(true)} size="lg" variant="default"><Check className="h-4 w-4 mr-2" /> Resolver</Button>
          )}
        </div>
      </Card>

      <h2 className="font-semibold text-sm">Atividade desta frente</h2>
      <RegistroFeed filter={{ frente_id: frente?.id }} />

      {resolveOpen && (
        <ResolveDialog chamadoId={id!} frenteId={frente.id} eventId={frente.event_id} companyId={frente.company_id}
          onClose={() => setResolveOpen(false)} />
      )}
    </div>
  );
}

function Step({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={"h-2 w-2 rounded-full " + (active ? "bg-primary" : "bg-muted")} />
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function computeSLA(due: string | null): { label: string; cls: string } | null {
  if (!due) return null;
  const mins = differenceInMinutes(new Date(due), new Date());
  if (mins > 60) return { label: `Vence em ${Math.round(mins / 60)}h`, cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" };
  if (mins > 0) return { label: `Vence em ${mins}min`, cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300" };
  return { label: `Vencido há ${Math.abs(mins)}min`, cls: "bg-red-500/10 text-red-700 dark:text-red-400" };
}

function ResolveDialog({ chamadoId, frenteId, eventId, companyId, onClose }: { chamadoId: string; frenteId: string; eventId: string; companyId: string; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [registroId] = useState(() => crypto.randomUUID());
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user || !text.trim()) return;
    setSaving(true);
    const { error: e1 } = await supabase.from("operacao_registros").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by_profile_id: user.id,
    }).eq("id", chamadoId);
    if (e1) { setSaving(false); toast({ title: "Erro", description: e1.message, variant: "destructive" }); return; }
    const { error: e2 } = await supabase.from("operacao_registros").insert({
      id: registroId,
      frente_id: frenteId,
      author_profile_id: user.id,
      company_id: companyId,
      kind: "evolucao",
      text: `Resolução: ${text.trim()}`,
      metadata: { resolves_chamado: chamadoId },
    });
    if (!e2 && media.length > 0) {
      await supabase.from("operacao_registro_media").insert(
        media.map((m, i) => ({
          registro_id: registroId, company_id: companyId,
          file_url: m.file_url, thumbnail_url: m.thumbnail_url, file_type: m.file_type, sort_order: i,
        })),
      );
    }
    toast({ title: "Chamado resolvido" });
    qc.invalidateQueries({ queryKey: ["op-chamado", chamadoId] });
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolver chamado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>O que foi feito? *</Label>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
          <MediaCapture companyId={companyId} eventId={eventId} registroId={registroId} value={media} onChange={setMedia} />
          <Button onClick={submit} disabled={saving || !text.trim()} className="w-full">
            {saving ? "A guardar..." : "Confirmar resolução"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
