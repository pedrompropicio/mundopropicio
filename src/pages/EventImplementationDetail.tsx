import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Download, Plus, Link2, Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ImplBPTab } from "@/components/implementation/ImplBPTab";
import { ImplTicketsTab } from "@/components/implementation/ImplTicketsTab";
import { ImplApportionmentTab } from "@/components/implementation/ImplApportionmentTab";

/** Try to find a date-like value in the first rows of a sheet */
function extractDateFromSheet(sheet: XLSX.WorkSheet): string | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:Z10");
  const maxRow = Math.min(range.e.r, 9);
  const maxCol = Math.min(range.e.c, 10);
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const val = String(cell.v ?? "");
      // Match dd/mm/yyyy or yyyy-mm-dd
      const m1 = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
      const m2 = val.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m2) return m2[0];
      // Excel serial date
      if (cell.t === "n" && cell.v > 40000 && cell.v < 60000) {
        const d = XLSX.SSF.parse_date_code(cell.v);
        if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

/** Try to find event name from first rows of the first sheet */
function extractEventName(sheet: XLSX.WorkSheet): string | null {
  for (let r = 0; r <= 4; r++) {
    for (let c = 0; c <= 3; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.t !== "s") continue;
      const val = String(cell.v ?? "").trim();
      // Heuristic: a name-like string that's long enough and not a header keyword
      if (val.length >= 5 && !/^(descri|cat|valor|total|item|data|receita|despesa|resumo)/i.test(val)) {
        return val;
      }
    }
  }
  return null;
}

type ExtractedInfo = {
  eventName: string;
  date: string;
  sheetNames: string[];
  isTour: boolean;
};

export default function EventImplementationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("bp");

  // Setup state for event creation
  const [setupMode, setSetupMode] = useState<"create_simple" | "create_master" | "link_existing">("create_simple");
  const [setupName, setSetupName] = useState("");
  const [setupDate, setSetupDate] = useState("");
  const [setupCities, setSetupCities] = useState("");
  const [setupExistingId, setSetupExistingId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedInfo | null>(null);

  const { data: impl, isLoading } = useQuery({
    queryKey: ["event-implementation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_implementations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: event } = useQuery({
    queryKey: ["event-for-impl", impl?.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, event_type, parent_event_id, status")
        .eq("id", impl!.event_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!impl?.event_id,
  });

  // Fetch existing events for linking
  const { data: existingEvents = [] } = useQuery({
    queryKey: ["events-for-impl-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, parent_event_id")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !impl?.event_id,
  });

  // For master events, fetch splits
  const { data: splitEvents = [] } = useQuery({
    queryKey: ["split-events-impl", event?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, event_type, parent_event_id, status")
        .eq("parent_event_id", event!.id)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!event && (event.event_type === "master" || event.event_type === "multi_day"),
  });

  const allEvents = event ? (
    (event.event_type === "master" || event.event_type === "multi_day") ? [event, ...splitEvents] : [event]
  ) : [];

  const allEventIds = allEvents.map(e => e.id);

  const { data: eventDates = [] } = useQuery({
    queryKey: ["impl-event-dates", allEventIds],
    queryFn: async () => {
      if (allEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_dates")
        .select("*")
        .in("event_id", allEventIds)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: allEventIds.length > 0,
  });

  const { data: eventSessions = [] } = useQuery({
    queryKey: ["impl-event-sessions", allEventIds],
    queryFn: async () => {
      if (allEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*")
        .in("event_id", allEventIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: allEventIds.length > 0,
  });

  // Mutation to create event and link to implementation
  const createAndLinkMutation = useMutation({
    mutationFn: async () => {
      let eventId: string;

      if (setupMode === "link_existing") {
        if (!setupExistingId) throw new Error("Selecione um evento");
        eventId = setupExistingId;
      } else if (setupMode === "create_simple") {
        if (!setupName) throw new Error("Informe o nome do evento");
        const { data, error } = await supabase
          .from("events")
          .insert({
            name: setupName,
            date: setupDate || new Date().toISOString().slice(0, 10),
            status: "planning",
          })
          .select("id")
          .single();
        if (error) throw error;
        eventId = data.id;
      } else {
        // create_master
        if (!setupName) throw new Error("Informe o nome do evento");
        const { data: master, error: masterErr } = await supabase
          .from("events")
          .insert({
            name: setupName,
            date: setupDate || new Date().toISOString().slice(0, 10),
            event_type: "master",
            status: "planning",
          })
          .select("id")
          .single();
        if (masterErr) throw masterErr;
        eventId = master.id;

        const cities = setupCities.split(",").map(c => c.trim()).filter(Boolean);
        for (const city of cities) {
          const { error } = await supabase
            .from("events")
            .insert({
              name: `${setupName} — ${city}`,
              date: setupDate || new Date().toISOString().slice(0, 10),
              event_type: "split",
              parent_event_id: master.id,
              status: "planning",
            });
          if (error) throw error;
        }
      }

      // Link to implementation
      const { error } = await supabase
        .from("event_implementations")
        .update({ event_id: eventId })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-implementation", id] });
      queryClient.invalidateQueries({ queryKey: ["event-for-impl"] });
      toast.success("Evento associado com sucesso");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDownloadRef = async () => {
    if (!impl?.reference_file_url) return;
    const { data, error } = await supabase.storage
      .from("implementation-files")
      .createSignedUrl(impl.reference_file_url, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Erro ao gerar link de download");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">A carregar…</div>;
  }

  if (!impl) {
    return <div className="p-6 text-destructive">Implantação não encontrada</div>;
  }

  const isMaster = event?.event_type === "master" || event?.event_type === "multi_day";
  const needsEventSetup = !impl.event_id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/implantacao")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">
              {event?.name || "Implantação"}
            </h1>
            <Badge variant={impl.status === "in_progress" ? "default" : "secondary"}>
              {impl.status === "in_progress" ? "Em Progresso" : impl.status === "completed" ? "Concluído" : "Pendente"}
            </Badge>
          </div>
          <div className="ml-10 flex items-center gap-4 text-xs text-muted-foreground">
            {event && <span>{format(new Date(event.date), "dd/MM/yyyy")}</span>}
            {isMaster && <span>Turnê ({splitEvents.length} sub-eventos)</span>}
            {eventDates.length > 0 && <span>{eventDates.length} datas</span>}
            <span>Atualizado em {format(new Date(impl.updated_at), "dd/MM/yyyy HH:mm", { locale: pt })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {impl.reference_file_url && (
            <Button variant="outline" size="sm" onClick={handleDownloadRef}>
              <Download className="h-4 w-4 mr-1" /> {impl.reference_file_name || "Ficheiro"}
            </Button>
          )}
        </div>
      </div>

      {/* Instructions banner */}
      {impl.import_instructions && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <span className="font-medium text-primary">Instruções:</span>{" "}
          <span className="text-foreground">{impl.import_instructions}</span>
        </div>
      )}

      {/* Event Setup Panel — shown when no event is linked */}
      {needsEventSetup ? (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Configurar Evento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Esta implantação ainda não tem um evento associado. Crie um novo ou vincule a um existente para iniciar a reconciliação.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Ação</Label>
              <Select value={setupMode} onValueChange={(v) => setSetupMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_simple">Criar evento simples</SelectItem>
                  <SelectItem value="create_master">Criar turnê (Master + Splits)</SelectItem>
                  <SelectItem value="link_existing">Vincular a evento existente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {setupMode === "link_existing" ? (
              <div>
                <Label>Evento</Label>
                <Select value={setupExistingId} onValueChange={setSetupExistingId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar evento…" /></SelectTrigger>
                  <SelectContent>
                    {existingEvents.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.parent_event_id ? "↳ " : ""}{e.name} ({format(new Date(e.date), "dd/MM/yyyy")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Nome do Evento</Label>
                  <Input value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="Ex: Artista — Tour 2025" />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={setupDate} onChange={(e) => setSetupDate(e.target.value)} />
                </div>
                {setupMode === "create_master" && (
                  <div>
                    <Label>Cidades (sub-eventos)</Label>
                    <Input value={setupCities} onChange={(e) => setSetupCities(e.target.value)} placeholder="Lisboa, Porto, Braga" />
                    <p className="text-xs text-muted-foreground mt-1">Separadas por vírgula — cada uma criará um sub-evento</p>
                  </div>
                )}
              </>
            )}

            <Button
              onClick={() => createAndLinkMutation.mutate()}
              disabled={
                createAndLinkMutation.isPending ||
                (setupMode === "link_existing" && !setupExistingId) ||
                (setupMode !== "link_existing" && !setupName)
              }
            >
              {setupMode === "link_existing" ? (
                <><Link2 className="h-4 w-4 mr-2" /> Vincular Evento</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Criar e Vincular Evento</>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Tabs — only shown when event is linked */
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="bp">BP / Despesas</TabsTrigger>
            <TabsTrigger value="tickets">Vendas / Bilhetes</TabsTrigger>
            {isMaster && <TabsTrigger value="apportionment">Análise de Rateio</TabsTrigger>}
          </TabsList>

          <TabsContent value="bp" className="mt-4">
            <ImplBPTab
              implementation={impl}
              event={event}
              allEvents={allEvents}
              eventDates={eventDates}
              eventSessions={eventSessions}
            />
          </TabsContent>

          <TabsContent value="tickets" className="mt-4">
            <ImplTicketsTab
              implementation={impl}
              event={event}
              allEvents={allEvents}
              eventDates={eventDates}
              eventSessions={eventSessions}
            />
          </TabsContent>

          {isMaster && (
            <TabsContent value="apportionment" className="mt-4">
              <ImplApportionmentTab
                implementation={impl}
                masterEvent={event!}
                splitEvents={splitEvents}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
