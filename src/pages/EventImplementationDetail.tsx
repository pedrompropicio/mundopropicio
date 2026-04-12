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

type CityInfo = {
  name: string;
  date: string;
  venue: string;
};

type ExtractedInfo = {
  eventName: string;
  date: string;
  sheetNames: string[];
  isTour: boolean;
  detectedCities: string[];
  cityDetails: CityInfo[];
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
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [sheetSelectionDone, setSheetSelectionDone] = useState(false);

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

  // Parse structured data from notes field (name, per-city dates, venues)
  const parseNotesData = useCallback((notes: string | null): { eventName: string | null; cityDetails: CityInfo[] } => {
    if (!notes) return { eventName: null, cityDetails: [] };
    const nameMatch = notes.match(/se\s+chama\s+["""]([^"""]+)["""]|chama\s+["""]([^"""]+)["""]/i);
    const eventName = nameMatch ? (nameMatch[1] || nameMatch[2])?.trim() || null : null;
    const cityDetails: CityInfo[] = [];
    const cityPattern = /dia\s+(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?\s+(?:n[oa]\s+)?([A-ZÀ-Ú][\wÀ-ú\s]*?)(?:\s+n[oa]\s+(.+?))?(?=\s+e\s+em\b|\s+e\s+(?:n[oa]|em)\b|\s+e\s+(?=.*dia\s)|\s*[.]|\s*$)/gi;
    let m: RegExpExecArray | null;
    while ((m = cityPattern.exec(notes)) !== null) {
      const day = m[1].padStart(2, "0");
      const month = m[2].padStart(2, "0");
      const year = m[3] || new Date().getFullYear().toString();
      cityDetails.push({ name: m[4].trim(), date: `${year}-${month}-${day}`, venue: m[5]?.trim() || "" });
    }
    if (cityDetails.length === 0) {
      const altPattern = /(?:n[oa]|em)\s+([A-ZÀ-Ú][\wÀ-ú]+).*?dia\s+(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?(?:\s+n[oa]\s+(.+?))?(?=\s+e\s+|\s*[.,]|\s*$)/gi;
      while ((m = altPattern.exec(notes)) !== null) {
        const day = m[2].padStart(2, "0");
        const month = m[3].padStart(2, "0");
        const year = m[4] || new Date().getFullYear().toString();
        cityDetails.push({ name: m[1].trim(), date: `${year}-${month}-${day}`, venue: m[5]?.trim() || "" });
      }
    }
    return { eventName, cityDetails };
  }, []);

  // Parse cities from import_instructions
  const parseCitiesFromInstructions = useCallback((instructions: string | null): string[] => {
    if (!instructions) return [];
    const cityPatterns = [
      /cidades[,:\s]+([A-ZÀ-Ú][\wÀ-ú]+(?:\s*[,e]+\s*[A-ZÀ-Ú][\wÀ-ú]+)+)/i,
      /(?:em|para|n[oa])\s+([A-ZÀ-Ú][\wÀ-ú]+(?:\s*[,e]+\s*[A-ZÀ-Ú][\wÀ-ú]+)+)/i,
      /\b([A-ZÀ-Ú][\wÀ-ú]+(?:\s*[,]\s*[A-ZÀ-Ú][\wÀ-ú]+)*\s+e\s+[A-ZÀ-Ú][\wÀ-ú]+)/,
    ];
    for (const pat of cityPatterns) {
      const match = instructions.match(pat);
      if (match) {
        return match[1].split(/\s*[,]\s*|\s+e\s+/i).map(c => c.trim()).filter(c => c.length >= 3 && /^[A-ZÀ-Ú]/.test(c));
      }
    }
    return [];
  }, []);

  // State for per-city details
  const [cityDetails, setCityDetails] = useState<CityInfo[]>([]);

  // Auto-extract event info from XLSX
  const extractFromFile = useCallback(async () => {
    if (!impl?.reference_file_url || !impl.reference_file_name?.match(/\.xlsx?$/i)) return;
    setExtracting(true);
    try {
      const { data: signedData, error: signErr } = await supabase.storage
        .from("implementation-files")
        .createSignedUrl(impl.reference_file_url, 300);
      if (signErr || !signedData?.signedUrl) throw new Error("Erro ao aceder ficheiro");

      const resp = await fetch(signedData.signedUrl);
      const buf = await resp.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const sheetNames = wb.SheetNames.filter(
        (n) => !/^(resumo|total|geral|master|consolidado|template)/i.test(n)
      );

      // Parse notes for structured data (event name, per-city dates/venues)
      const notesData = parseNotesData(impl.notes ?? null);

      // Detect cities from instructions
      const detectedCities = parseCitiesFromInstructions(impl.import_instructions ?? null);
      
      // Merge: if notes has city details, use those; otherwise fall back to instruction cities
      const parsedCityDetails = notesData.cityDetails.length > 0
        ? notesData.cityDetails
        : detectedCities.map(c => ({ name: c, date: "", venue: "" }));

      // Determine tour from saved event_structure, notes city details, or instruction cities
      const savedType = (impl.event_structure as any)?.event_type;
      const isTour = savedType === "new_master" || parsedCityDetails.length > 1 || detectedCities.length > 1;

      // Event name priority: 1) notes field, 2) cleaned Excel name, 3) file name
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      let eventName = notesData.eventName
        || extractEventName(firstSheet)
        || impl.reference_file_name.replace(/\.xlsx?$/i, "");

      // If it's a tour and name came from Excel, clean city suffixes
      if (isTour && !notesData.eventName) {
        const allCityNames = parsedCityDetails.map(c => c.name);
        for (const city of allCityNames) {
          const cityPattern = new RegExp(`\\s*[-–—]\\s*${city}\\s*$`, "i");
          eventName = eventName.replace(cityPattern, "").trim();
        }
      }

      // Extract date from first sheet (fallback if no per-city dates)
      const dateStr = extractDateFromSheet(firstSheet)
        || (parsedCityDetails.length > 0 ? parsedCityDetails[0].date : "")
        || "";

      const info: ExtractedInfo = { eventName, date: dateStr, sheetNames, isTour, detectedCities, cityDetails: parsedCityDetails };
      setExtracted(info);
      setSelectedSheets(sheetNames);
      setCityDetails(parsedCityDetails);

      // Auto-fill form
      setSetupName(eventName);
      if (dateStr) setSetupDate(dateStr);
      if (isTour) {
        setSetupMode("create_master");
        setSetupCities(parsedCityDetails.map(c => c.name).join(", "));
      } else {
        setSetupMode("create_simple");
      }
      setSheetSelectionDone(true);
    } catch (err: any) {
      console.error("Extraction error:", err);
    } finally {
      setExtracting(false);
    }
  }, [impl?.reference_file_url, impl?.reference_file_name, impl?.import_instructions, impl?.event_structure, impl?.notes, parseCitiesFromInstructions, parseNotesData]);

  useEffect(() => {
    if (impl && !impl.event_id && impl.reference_file_url && !extracted) {
      extractFromFile();
    }
  }, [impl, extracted, extractFromFile]);

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
        extracting ? (
          <Card className="border-primary/30">
            <CardContent className="flex items-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">A analisar ficheiro…</span>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {extracted ? (
                  <><Sparkles className="h-5 w-5 text-primary" /> Configurar Evento</>
                ) : (
                  <><Plus className="h-5 w-5" /> Configurar Evento</>
                )}
              </CardTitle>
              {extracted && (
                <p className="text-sm text-muted-foreground">
                  Dados extraídos do ficheiro ({extracted.sheetNames.length} abas detetadas).
                  {extracted.detectedCities.length > 0 && (
                    <> Cidades nas instruções: <span className="font-medium text-primary">{extracted.detectedCities.join(", ")}</span>.</>
                  )}
                  {" "}Confirme os dados abaixo e ajuste se necessário.
                </p>
              )}
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
                    <div className="space-y-3">
                      <div>
                        <Label>Cidades (sub-eventos)</Label>
                        <Input value={setupCities} onChange={(e) => setSetupCities(e.target.value)} placeholder="Lisboa, Porto, Braga" />
                        <p className="text-xs text-muted-foreground mt-1">Separadas por vírgula — cada uma criará um sub-evento</p>
                      </div>

                      {/* Structure preview */}
                      {setupName && setupCities && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                          <p className="text-xs font-semibold text-primary uppercase tracking-wide">Estrutura a criar:</p>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">Master</Badge>
                              {setupName}
                            </div>
                            {setupCities.split(",").map(c => c.trim()).filter(Boolean).map((city, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                                <span className="text-primary/60">↳</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Split</Badge>
                                {setupName} — {city}
                                {setupDate && <span className="text-xs">({format(new Date(setupDate), "dd/MM/yyyy")})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
        )
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
