import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaCapture, type CapturedMedia } from "@/components/operacao/MediaCapture";
import { AudioRecorder } from "@/components/operacao/AudioRecorder";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import { toast } from "@/hooks/use-toast";

export default function ChamadoNovo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [registroId] = useState(() => crypto.randomUUID());
  const [frenteId, setFrenteId] = useState<string>("");
  const [etapaId, setEtapaId] = useState<string>("");
  const [priority, setPriority] = useState<string>("med");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [audio, setAudio] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  // Frentes onde o user participa (visíveis)
  const { data: frentes } = useQuery({
    queryKey: ["op-frentes-visible", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,event_id,company_id, events(name)")
        .order("display_order");
      return data ?? [];
    },
  });

  const { data: etapas } = useQuery({
    queryKey: ["op-etapas-for-frente", frenteId],
    enabled: !!frenteId,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas").select("id,name,status").eq("frente_id", frenteId).order("display_order");
      return data ?? [];
    },
  });

  const selectedFrente = (frentes ?? []).find((f: any) => f.id === frenteId);

  const submit = async () => {
    if (!user || !frenteId || !priority || !text.trim()) {
      toast({ title: "Falta info", description: "Frente, prioridade e texto são obrigatórios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("operacao_registros").insert({
      id: registroId,
      frente_id: frenteId,
      etapa_id: etapaId || null,
      author_profile_id: user.id,
      company_id: (selectedFrente as any)?.company_id,
      kind: "chamado",
      status: "open",
      priority,
      text: text.trim(),
      audio_url: audio,
      metadata: {},
    });
    if (error) { setSaving(false); toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (media.length > 0) {
      await supabase.from("operacao_registro_media").insert(
        media.map((m, i) => ({
          registro_id: registroId,
          company_id: (selectedFrente as any)?.company_id,
          file_url: m.file_url, thumbnail_url: m.thumbnail_url, file_type: m.file_type, sort_order: i,
        })),
      );
    }
    toast({ title: "Chamado aberto" });
    navigate(`/operacao/chamado/${registroId}`);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      <h1 className="text-2xl font-bold">Novo chamado</h1>
      <Card className="p-4 space-y-4">
        <div>
          <Label>Frente *</Label>
          <Select value={frenteId} onValueChange={(v) => { setFrenteId(v); setEtapaId(""); }}>
            <SelectTrigger><SelectValue placeholder="Escolhe a frente" /></SelectTrigger>
            <SelectContent>
              {(frentes ?? []).map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.name} — {f.events?.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Etapa (opcional)</Label>
          <Select value={etapaId} onValueChange={setEtapaId} disabled={!frenteId}>
            <SelectTrigger><SelectValue placeholder="Sem etapa" /></SelectTrigger>
            <SelectContent>
              {(etapas ?? []).map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prioridade *</Label>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {["crit","high","med","low"].map((p) => (
              <button
                key={p} type="button"
                onClick={() => setPriority(p)}
                className={"rounded border p-2 " + (priority === p ? "ring-2 ring-primary" : "")}
              >
                <PriorityBadge priority={p} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Descrição *</Label>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {frenteId && selectedFrente && (
          <>
            <MediaCapture
              companyId={(selectedFrente as any).company_id}
              eventId={(selectedFrente as any).event_id}
              registroId={registroId} value={media} onChange={setMedia} onBusyChange={setMediaBusy}
            />
            <AudioRecorder
              companyId={(selectedFrente as any).company_id}
              eventId={(selectedFrente as any).event_id}
              registroId={registroId} value={audio} onChange={setAudio} onBusyChange={setAudioBusy}
            />
          </>
        )}
        <Button size="lg" className="w-full" onClick={submit} disabled={saving || mediaBusy || audioBusy}>
          {saving ? "A abrir..." : mediaBusy || audioBusy ? "A enviar anexos..." : "Abrir chamado"}
        </Button>
      </Card>
    </div>
  );
}
