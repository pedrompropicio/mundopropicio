import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Upload, FileText, ArrowLeft, Trash2, Eye, CalendarDays, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type Implementation = {
  id: string;
  event_id: string | null;
  status: string;
  reference_file_url: string | null;
  reference_file_name: string | null;
  import_instructions: string | null;
  notes: string | null;
  event_structure: any;
  created_at: string;
  updated_at: string;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  in_progress: { label: "Em Progresso", variant: "default" },
  completed: { label: "Concluído", variant: "outline" },
};

export default function EventImplementations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newEventId, setNewEventId] = useState<string>("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newEventType, setNewEventType] = useState<"existing" | "new_simple" | "new_master">("existing");
  const [newEventName, setNewEventName] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newMasterSplits, setNewMasterSplits] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch implementations
  const { data: implementations = [], isLoading } = useQuery({
    queryKey: ["event-implementations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_implementations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Implementation[];
    },
  });

  // Fetch events for selector
  const { data: events = [] } = useQuery({
    queryKey: ["events-for-impl"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, event_type, parent_event_id, status")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Map event_id to event for display
  const eventMap = Object.fromEntries(events.map((e) => [e.id, e]));

  const createMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let eventId: string | null = null;
      let eventStructure: any = null;

      if (newEventType === "existing") {
        eventId = newEventId || null;
      } else if (newEventType === "new_simple") {
        // Create a new simple event
        const { data: newEvent, error } = await supabase
          .from("events")
          .insert({ name: newEventName, date: newEventDate || new Date().toISOString().slice(0, 10), status: "planning" })
          .select("id")
          .single();
        if (error) throw error;
        eventId = newEvent.id;
      } else if (newEventType === "new_master") {
        // Create master event
        const { data: masterEvent, error: masterErr } = await supabase
          .from("events")
          .insert({ name: newEventName, date: newEventDate || new Date().toISOString().slice(0, 10), event_type: "master", status: "planning" })
          .select("id")
          .single();
        if (masterErr) throw masterErr;
        eventId = masterEvent.id;

        // Create splits from comma-separated cities
        const cities = newMasterSplits.split(",").map((c) => c.trim()).filter(Boolean);
        const splitIds: string[] = [];
        for (const city of cities) {
          const { data: splitEvent, error: splitErr } = await supabase
            .from("events")
            .insert({
              name: `${newEventName} — ${city}`,
              date: newEventDate || new Date().toISOString().slice(0, 10),
              event_type: "split",
              parent_event_id: masterEvent.id,
              status: "planning",
            })
            .select("id")
            .single();
          if (splitErr) throw splitErr;
          splitIds.push(splitEvent.id);
        }
        eventStructure = { master_id: masterEvent.id, splits: cities.map((c, i) => ({ city: c, event_id: splitIds[i] })) };
      }

      // Upload file if selected
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (selectedFile) {
        fileName = selectedFile.name;
        const filePath = `${Date.now()}_${selectedFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("implementation-files")
          .upload(filePath, selectedFile);
        if (uploadErr) throw uploadErr;
        fileUrl = filePath;
      }

      const { error } = await supabase.from("event_implementations").insert({
        event_id: eventId,
        status: "pending",
        reference_file_url: fileUrl,
        reference_file_name: fileName,
        import_instructions: newInstructions || null,
        notes: newNotes || null,
        event_structure: eventStructure,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-implementations"] });
      queryClient.invalidateQueries({ queryKey: ["events-for-impl"] });
      toast.success("Implantação criada com sucesso");
      resetDialog();
    },
    onError: (err: any) => {
      toast.error("Erro ao criar implantação: " + err.message);
    },
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (impl: Implementation) => {
      // Delete file from storage if exists
      if (impl.reference_file_url) {
        await supabase.storage.from("implementation-files").remove([impl.reference_file_url]);
      }
      const { error } = await supabase.from("event_implementations").delete().eq("id", impl.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-implementations"] });
      toast.success("Implantação removida");
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // If completing, remove file from storage
      if (status === "completed") {
        const impl = implementations.find((i) => i.id === id);
        if (impl?.reference_file_url) {
          await supabase.storage.from("implementation-files").remove([impl.reference_file_url]);
          await supabase.from("event_implementations").update({ status, reference_file_url: null }).eq("id", id);
          return;
        }
      }
      const { error } = await supabase.from("event_implementations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-implementations"] });
      toast.success("Status atualizado");
    },
  });

  function resetDialog() {
    setShowNewDialog(false);
    setNewEventId("");
    setNewInstructions("");
    setNewNotes("");
    setNewEventType("existing");
    setNewEventName("");
    setNewEventDate("");
    setNewMasterSplits("");
    setSelectedFile(null);
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">A carregar…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Implantação de Eventos Passados</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Importar e reconciliar dados históricos de eventos
          </p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Implantação
        </Button>
      </div>

      {implementations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhuma implantação registada</p>
            <p className="text-sm">Crie uma nova para iniciar o processo de importação histórica</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {implementations.map((impl) => {
            const event = impl.event_id ? eventMap[impl.event_id] : null;
            const statusInfo = STATUS_MAP[impl.status] || STATUS_MAP.pending;
            return (
              <Card key={impl.id} className="transition-all hover:border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {event ? event.name : impl.event_structure ? `Turnê: ${(impl.event_structure as any)?.splits?.map((s: any) => s.city).join(", ") || "A definir"}` : "Evento não associado"}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </CardTitle>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {event ? format(new Date(event.date), "dd/MM/yyyy") : "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Criado em {format(new Date(impl.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                        </span>
                        {impl.reference_file_name && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {impl.reference_file_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {impl.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: impl.id, status: "in_progress" })}>
                          Iniciar
                        </Button>
                      )}
                      {impl.status === "in_progress" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/implantacao/${impl.id}`)}>
                            <Eye className="h-4 w-4 mr-1" /> Reconciliar
                          </Button>
                          <Button size="sm" variant="default" onClick={() => updateStatus.mutate({ id: impl.id, status: "completed" })}>
                            Concluir
                          </Button>
                        </>
                      )}
                      {impl.status !== "completed" && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                          if (confirm("Remover esta implantação?")) deleteMutation.mutate(impl);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {(impl.import_instructions || impl.notes) && (
                  <CardContent className="pt-0">
                    {impl.import_instructions && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mb-2">
                        <span className="font-medium">Instruções:</span> {impl.import_instructions}
                      </div>
                    )}
                    {impl.notes && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Notas:</span> {impl.notes}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New Implementation Dialog */}
      <Dialog open={showNewDialog} onOpenChange={(open) => { if (!open) resetDialog(); else setShowNewDialog(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Implantação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Evento</Label>
              <Select value={newEventType} onValueChange={(v) => setNewEventType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Associar a evento existente</SelectItem>
                  <SelectItem value="new_simple">Criar evento simples</SelectItem>
                  <SelectItem value="new_master">Criar turnê (Master + Splits)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newEventType === "existing" && (
              <div>
                <Label>Evento</Label>
                <Select value={newEventId} onValueChange={setNewEventId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar evento…" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.parent_event_id ? "↳ " : ""}{e.name} ({format(new Date(e.date), "dd/MM/yyyy")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(newEventType === "new_simple" || newEventType === "new_master") && (
              <>
                <div>
                  <Label>Nome do Evento</Label>
                  <Input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Ex: Artista — Tour 2025" />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={newEventDate} onChange={(e) => setNewEventDate(e.target.value)} />
                </div>
              </>
            )}

            {newEventType === "new_master" && (
              <div>
                <Label>Cidades (sub-eventos)</Label>
                <Input value={newMasterSplits} onChange={(e) => setNewMasterSplits(e.target.value)} placeholder="Lisboa, Porto, Braga (separadas por vírgula)" />
                <p className="text-xs text-muted-foreground mt-1">Cada cidade criará um sub-evento vinculado ao Master</p>
              </div>
            )}

            <div>
              <Label>Ficheiro de Referência (XLSX ou PDF)</Label>
              <div className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border p-4 hover:border-primary/50 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {selectedFile ? selectedFile.name : "Clique para selecionar ficheiro"}
                  </span>
                  <input type="file" className="hidden" accept=".xlsx,.xls,.pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>

            <div>
              <Label>Instruções de Importação</Label>
              <Textarea
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="Orientações específicas para a importação (ex: ignorar aba X, cachê está na aba Y, etc.)"
                rows={3}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Observações gerais sobre este evento"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={uploading || (newEventType === "existing" && !newEventId) || ((newEventType === "new_simple" || newEventType === "new_master") && !newEventName)}
            >
              {uploading ? "A criar…" : "Criar Implantação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
