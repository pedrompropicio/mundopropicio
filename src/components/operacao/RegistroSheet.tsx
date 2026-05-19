import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaCapture, type CapturedMedia } from "./MediaCapture";
import { AudioRecorder } from "./AudioRecorder";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  initialFrenteId?: string;
  initialEtapaId?: string;
  initialKind?: "evolucao" | "observacao" | "punch" | "chamado";
  eventFilterId?: string;
}

/**
 * Bottom-sheet universal para criar um Registo (Evolução / Observação / Punch).
 * - Se receber initialFrenteId, fica pré-seleccionado.
 * - Se receber initialEtapaId, pré-seleccionado e Frente lida via etapa.
 * - Caso contrário pede Frente (e Etapa opcional).
 */
export function RegistroSheet({ open, onClose, initialFrenteId, initialEtapaId, initialKind, eventFilterId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [frenteId, setFrenteId] = useState<string>(initialFrenteId ?? "");
  const [etapaId, setEtapaId] = useState<string>(initialEtapaId ?? "");
  const [kind, setKind] = useState(initialKind ?? "evolucao");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [audio, setAudio] = useState<string | null>(null);
  const [registroId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  // Frentes onde user está
  const { data: frentes } = useQuery({
    queryKey: ["op-my-frentes-select", user?.id],
    enabled: !!user && open && !initialFrenteId,
    queryFn: async () => {
      const { data: team } = await supabase
        .from("operacao_frente_team").select("frente_id").eq("profile_id", user!.id).eq("active", true);
      const ids = Array.from(new Set((team ?? []).map((t: any) => t.frente_id)));
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,event_id,company_id, events(name)")
        .in("id", ids).order("display_order");
      return data ?? [];
    },
  });

  // Se initialEtapaId, descobre frente
  useEffect(() => {
    if (!initialEtapaId || frenteId) return;
    supabase.from("operacao_etapas").select("frente_id").eq("id", initialEtapaId).maybeSingle()
      .then(({ data }) => data?.frente_id && setFrenteId(data.frente_id));
  }, [initialEtapaId, frenteId]);

  const { data: etapas } = useQuery({
    queryKey: ["op-etapas-sheet", frenteId],
    enabled: !!frenteId,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_etapas")
        .select("id,name").eq("frente_id", frenteId).order("display_order");
      return data ?? [];
    },
  });

  const { data: frenteCtx } = useQuery({
    queryKey: ["op-frente-ctx", frenteId],
    enabled: !!frenteId,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes")
        .select("event_id,company_id").eq("id", frenteId).maybeSingle();
      return data;
    },
  });

  const submit = async () => {
    if (!user || !frenteId || !frenteCtx) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_registros").insert({
      id: registroId,
      frente_id: frenteId,
      etapa_id: etapaId || null,
      author_profile_id: user.id,
      company_id: frenteCtx.company_id,
      kind,
      text: text.trim() || null,
      audio_url: audio,
      metadata: {},
    });
    if (error) { setSaving(false); toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (media.length > 0) {
      await supabase.from("operacao_registro_media").insert(
        media.map((m, i) => ({
          registro_id: registroId, company_id: frenteCtx.company_id,
          file_url: m.file_url, thumbnail_url: m.thumbnail_url, file_type: m.file_type, sort_order: i,
        })),
      );
    }
    toast({ title: "Registo guardado" });
    qc.invalidateQueries({ queryKey: ["op-registros"] });
    setSaving(false);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Novo registo</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          {!initialFrenteId && !initialEtapaId && (
            <div>
              <Label>Zona/Serviço *</Label>
              <Select value={frenteId} onValueChange={(v) => { setFrenteId(v); setEtapaId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolhe a Zona/Serviço" /></SelectTrigger>
                <SelectContent>
                  {(frentes ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} — {f.events?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {frenteId && !initialEtapaId && (
            <div>
              <Label>Etapa (opcional)</Label>
              <Select value={etapaId} onValueChange={setEtapaId}>
                <SelectTrigger><SelectValue placeholder="Sem etapa" /></SelectTrigger>
                <SelectContent>
                  {(etapas ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <RadioGroup value={kind} onValueChange={(v) => setKind(v as any)} className="grid grid-cols-3 gap-2">
            {[["evolucao", "Evolução"], ["observacao", "Observação"], ["punch", "Punch"]].map(([v, l]) => (
              <Label key={v} className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                <RadioGroupItem value={v} /> <span className="text-sm">{l}</span>
              </Label>
            ))}
          </RadioGroup>
          <Textarea placeholder="Descreve..." rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          {frenteCtx && (
            <>
              <MediaCapture companyId={frenteCtx.company_id} eventId={frenteCtx.event_id}
                registroId={registroId} value={media} onChange={setMedia} />
              <AudioRecorder companyId={frenteCtx.company_id} eventId={frenteCtx.event_id}
                registroId={registroId} value={audio} onChange={setAudio} />
            </>
          )}
          <Button onClick={submit} disabled={saving || !frenteId} className="w-full" size="lg">
            {saving ? "A guardar..." : "Guardar registo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
