/**
 * FeverImportModal — Importação de vendas de bilheteira Fever (2 ficheiros XLSX).
 *
 * Wizard em 4 passos:
 *  1) Upload   — escolher evento, conta Fever (auto), 2 ficheiros XLSX.
 *  2) Setup    — preview de zonas/lotes que vão ser criados (1ª importação) ou
 *                relação com zonas/lotes existentes (re-importação). Sem capacidade
 *                — pode ser configurada depois na página do evento.
 *  3) Preview  — totais, divergências vs estado atual da BD (qty / preço / lotes
 *                novos), warnings.
 *  4) Importar — apaga TODOS os ticket_sales Fever do evento e re-cria a partir
 *                do ficheiro. Gera relatório PDF.
 */
import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2,
  ArrowRight, ArrowLeft, RefreshCw, Sparkles, Download,
} from "lucide-react";
import {
  parseFeverXlsx,
  groupFeverLotsByZone,
  type FeverParseResult,
  type FeverParsedLot,
  type FeverZoneGroup,
  FEVER_IVA_RATE,
} from "@/lib/parse-fever-xlsx";
import { formatCurrency } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  /** evento pré-selecionado opcional */
  defaultEventId?: string;
}

type Step = "upload" | "setup" | "preview" | "importing" | "done";

interface ExistingZoneInfo {
  id: string;
  name: string;
  session_id: string | null;
  total_capacity: number;
}
interface ExistingLotInfo {
  id: string;
  zone_id: string;
  name: string;
  price: number;
  quantity: number;
}
interface ExistingDateInfo { id: string; date: string; label: string | null; }
interface ExistingSessionInfo { id: string; date: string; label: string | null; }

interface ZoneMappingRow {
  group: FeverZoneGroup;
  /** existingZoneId quando match com zona existente, null = criar nova */
  existingZoneId: string | null;
  /** mapping ticketKey → existingLotId (null = criar lote novo) */
  lotMapping: Record<string, string | null>;
}

interface DivergenceRow {
  lotKey: string;
  ticketType: string;
  zoneName: string;
  before: { qty: number; revenue: number };
  after: { qty: number; revenue: number };
  diffQty: number;
  diffRevenue: number;
}

const norm = (s: string) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function FeverImportModal({ open, onClose, defaultEventId }: Props) {
  const queryClient = useQueryClient();
  const salesRef = useRef<HTMLInputElement>(null);
  const pricesRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [eventId, setEventId] = useState(defaultEventId || "");
  const [feverAccountId, setFeverAccountId] = useState<string>("");
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [pricesFile, setPricesFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<FeverParseResult | null>(null);
  const [zoneMappings, setZoneMappings] = useState<ZoneMappingRow[]>([]);
  const [importLogId, setImportLogId] = useState<string | null>(null);

  // ---- Eventos elegíveis (planning/confirmed/active/completed) ----
  const { data: events = [] } = useQuery({
    queryKey: ["fever_import_events"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, date")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ---- Conta Fever (pré-selecionada) ----
  const { data: feverAccounts = [] } = useQuery({
    queryKey: ["fever_accounts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("type", "ticket_office")
        .ilike("name", "%fever%")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-select se só houver 1 Fever
  useMemo(() => {
    if (!feverAccountId && feverAccounts.length === 1) {
      setFeverAccountId(feverAccounts[0].id);
    }
  }, [feverAccounts, feverAccountId]);

  // ---- Estado atual do evento (para detectar 1ª vs re-importação) ----
  const { data: existing } = useQuery({
    queryKey: ["fever_event_existing", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [datesRes, sessionsRes, zonesRes] = await Promise.all([
        supabase.from("event_dates").select("id, date, label").eq("event_id", eventId).order("date"),
        supabase.from("event_sessions").select("id, date, label").eq("event_id", eventId).order("date"),
        supabase.from("event_ticket_zones").select("id, name, session_id, total_capacity").eq("event_id", eventId),
      ]);
      const dates: ExistingDateInfo[] = datesRes.data || [];
      const sessions: ExistingSessionInfo[] = sessionsRes.data || [];
      const zones: ExistingZoneInfo[] = zonesRes.data || [];
      let lots: ExistingLotInfo[] = [];
      if (zones.length > 0) {
        const { data: lotData } = await supabase
          .from("event_ticket_lots")
          .select("id, zone_id, name, price, quantity")
          .in("zone_id", zones.map((z) => z.id));
        lots = lotData || [];
      }
      // sales atuais Fever (para divergências)
      let currentSales: any[] = [];
      if (zones.length > 0 && feverAccountId) {
        const { data: salesData } = await supabase
          .from("ticket_sales")
          .select("lot_id, quantity, unit_price")
          .in("zone_id", zones.map((z) => z.id))
          .eq("financial_account_id", feverAccountId);
        currentSales = salesData || [];
      }
      return { dates, sessions, zones, lots, currentSales };
    },
  });

  // ---- Upload + parse ----
  const handleParse = async () => {
    if (!salesFile || !pricesFile) {
      toast.error("Selecione os 2 ficheiros (vendas e preços).");
      return;
    }
    setParsing(true);
    try {
      const result = await parseFeverXlsx(salesFile, pricesFile);
      setParseResult(result);
      // construir mapeamento inicial de zonas
      const groups = groupFeverLotsByZone(result.lots);
      const initialMappings: ZoneMappingRow[] = groups.map((g) => {
        // tentar match com zona existente por nome normalizado
        const match = existing?.zones.find((z) => norm(z.name) === norm(g.zoneName));
        const lotMapping: Record<string, string | null> = {};
        for (const lot of g.lots) {
          const existingLot = existing?.lots.find(
            (l) =>
              l.zone_id === match?.id &&
              norm(l.name) === norm(lot.lotName) &&
              Math.abs(l.price - lot.unitPrice) < 0.01,
          );
          lotMapping[lot.key] = existingLot?.id || null;
        }
        return {
          group: g,
          existingZoneId: match?.id || null,
          lotMapping,
        };
      });
      setZoneMappings(initialMappings);
      setStep("setup");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao ler ficheiros Fever");
    } finally {
      setParsing(false);
    }
  };

  // ---- Cálculo de divergências para a página de Preview ----
  const divergences = useMemo<DivergenceRow[]>(() => {
    if (!parseResult || !existing) return [];
    const rows: DivergenceRow[] = [];
    // por lote: comparar (qty, receita) atual vs novo
    for (const map of zoneMappings) {
      for (const lot of map.group.lots) {
        const existingLotId = map.lotMapping[lot.key];
        const before = existing.currentSales
          .filter((s) => s.lot_id === existingLotId)
          .reduce(
            (acc, s) => ({
              qty: acc.qty + (s.quantity || 0),
              revenue: acc.revenue + (s.quantity || 0) * (s.unit_price || 0),
            }),
            { qty: 0, revenue: 0 },
          );
        const after = { qty: lot.totalQty, revenue: lot.totalGross };
        const diffQty = after.qty - before.qty;
        const diffRevenue = after.revenue - before.revenue;
        if (Math.abs(diffQty) > 0 || Math.abs(diffRevenue) > 0.5) {
          rows.push({
            lotKey: lot.key,
            ticketType: lot.ticketType,
            zoneName: map.group.zoneName,
            before, after, diffQty, diffRevenue,
          });
        }
      }
    }
    return rows;
  }, [parseResult, existing, zoneMappings]);

  const isFirstImport = !existing || existing.zones.length === 0;
  const newZonesCount = zoneMappings.filter((m) => !m.existingZoneId).length;
  const newLotsCount = zoneMappings.reduce(
    (s, m) => s + m.group.lots.filter((l) => !m.lotMapping[l.key]).length,
    0,
  );
  const willDeletePriorSales = (existing?.currentSales.length || 0) > 0;

  // ---- IMPORT mutation ----
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parseResult || !eventId || !feverAccountId) throw new Error("Estado inválido");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      const { data: ev } = await supabase.from("events").select("company_id, date").eq("id", eventId).single();
      if (!ev) throw new Error("Evento não encontrado");
      const companyId = ev.company_id;

      // === 1. CRIAR datas + sessões em falta (1ª importação) ===
      // Coala ⇒ datas inferidas dos lotes diários (saturday, sunday)
      // Estratégia genérica: se não existem datas, criamos a partir dos
      // dias presentes nos rótulos "Sábado/Domingo X Mes" do Fever.
      // Para a Coala 2026: 30 e 31 Maio.
      // Como não temos parser robusto da data dentro do ticket_type, vamos
      // assumir as 2 datas a partir do `events.date` (sábado) e dia seguinte.
      let saturdayDate: string;
      let sundayDate: string;
      if (existing && existing.dates.length >= 2) {
        const sorted = [...existing.dates].sort((a, b) => a.date.localeCompare(b.date));
        saturdayDate = sorted[0].date;
        sundayDate = sorted[1].date;
      } else {
        // ev.date — assumir sáb e sáb+1
        const base = new Date(ev.date + "T00:00:00");
        const next = new Date(base.getTime() + 86400000);
        saturdayDate = ev.date;
        sundayDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      }

      // event_dates
      let satDate = existing?.dates.find((d) => d.date === saturdayDate);
      let sunDate = existing?.dates.find((d) => d.date === sundayDate);
      if (!satDate) {
        const { data, error } = await supabase
          .from("event_dates")
          .insert({ event_id: eventId, date: saturdayDate, label: "Sábado", company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        satDate = data!;
      }
      if (!sunDate) {
        const { data, error } = await supabase
          .from("event_dates")
          .insert({ event_id: eventId, date: sundayDate, label: "Domingo", company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        sunDate = data!;
      }

      // event_sessions (uma por dia)
      let satSession = existing?.sessions.find((s) => s.date === saturdayDate);
      let sunSession = existing?.sessions.find((s) => s.date === sundayDate);
      if (!satSession) {
        const { data, error } = await supabase
          .from("event_sessions")
          .insert({ event_id: eventId, date: saturdayDate, label: "Sábado", sort_order: 1, company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        satSession = data!;
      }
      if (!sunSession) {
        const { data, error } = await supabase
          .from("event_sessions")
          .insert({ event_id: eventId, date: sundayDate, label: "Domingo", sort_order: 2, company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        sunSession = data!;
      }

      // === 2. CRIAR / RESOLVER zonas ===
      // mapeamento zoneKind → session_id (null para passes)
      const sessionForKind: Record<string, string | null> = {
        relvado_diario_saturday: satSession.id,
        relvado_diario_sunday: sunSession.id,
        tenda_diario_saturday: satSession.id,
        tenda_diario_sunday: sunSession.id,
        relvado_passe_null: null,
        tenda_passe_null: null,
      };

      const resolvedZoneIds: Record<number, string> = {};
      for (let i = 0; i < zoneMappings.length; i++) {
        const m = zoneMappings[i];
        if (m.existingZoneId) {
          resolvedZoneIds[i] = m.existingZoneId;
        } else {
          const sessKey = `${m.group.zoneKind}_${m.group.daySlot || "null"}`;
          const session_id = sessionForKind[sessKey] ?? null;
          const { data, error } = await supabase
            .from("event_ticket_zones")
            .insert({
              event_id: eventId,
              name: m.group.zoneName,
              session_id,
              total_capacity: 0, // configurar depois
              company_id: companyId,
            })
            .select("id").single();
          if (error) throw error;
          resolvedZoneIds[i] = data!.id;
        }
      }

      // === 3. CRIAR / RESOLVER lotes ===
      const resolvedLotIds: Record<string, string> = {}; // ticketKey → lot_id
      for (let i = 0; i < zoneMappings.length; i++) {
        const m = zoneMappings[i];
        const zoneId = resolvedZoneIds[i];
        for (let j = 0; j < m.group.lots.length; j++) {
          const lot = m.group.lots[j];
          const existingLotId = m.lotMapping[lot.key];
          if (existingLotId) {
            resolvedLotIds[lot.key] = existingLotId;
          } else {
            const { data, error } = await supabase
              .from("event_ticket_lots")
              .insert({
                zone_id: zoneId,
                name: lot.lotName,
                lot_number: j + 1,
                lot_type: lot.lotKind === "pass" ? "regular" : "regular",
                price: lot.unitPrice,
                quantity: lot.totalQty, // estimativa = qty já vendida (sem capacidade definida)
                iva_rate: FEVER_IVA_RATE,
                company_id: companyId,
              })
              .select("id").single();
            if (error) throw error;
            resolvedLotIds[lot.key] = data!.id;
          }
        }
      }

      // === 4. ASSIGNMENT Fever → evento (se não existir) ===
      const { data: existingAssign } = await supabase
        .from("event_ticket_office_assignments")
        .select("id")
        .eq("event_id", eventId)
        .eq("financial_account_id", feverAccountId)
        .is("event_date_id", null)
        .maybeSingle();
      if (!existingAssign) {
        const { error } = await supabase
          .from("event_ticket_office_assignments")
          .insert({
            event_id: eventId,
            event_date_id: null,
            financial_account_id: feverAccountId,
            company_id: companyId,
          });
        if (error) throw error;
      }

      // === 5. APAGAR ticket_sales Fever existentes (re-import: fonte de verdade) ===
      const allZoneIds = Object.values(resolvedZoneIds);
      if (allZoneIds.length > 0) {
        const { error } = await supabase
          .from("ticket_sales")
          .delete()
          .in("zone_id", allZoneIds)
          .eq("financial_account_id", feverAccountId);
        if (error) throw error;
      }

      // === 6. INSERIR ticket_sales (1 linha por purchase_date × lote) ===
      // Resolver zone_id para cada venda usando o lote
      const lotToZone = new Map<string, string>();
      for (let i = 0; i < zoneMappings.length; i++) {
        const m = zoneMappings[i];
        for (const lot of m.group.lots) {
          lotToZone.set(lot.key, resolvedZoneIds[i]);
        }
      }

      const importBatchId = crypto.randomUUID();
      const salesPayload = parseResult.sales.map((s) => ({
        zone_id: lotToZone.get(s.lotKey)!,
        lot_id: resolvedLotIds[s.lotKey],
        sale_date: s.purchaseDate,
        quantity: s.quantity,
        unit_price: s.unitPrice,
        total_value: +(s.quantity * s.unitPrice).toFixed(2),
        financial_account_id: feverAccountId,
        source: "fever_import",
        notes: `Fever • ${s.weekday} • ${s.ticketType}`,
        import_batch_id: importBatchId,
        created_by: userId,
        company_id: companyId,
      }));

      // batch insert (chunks de 500)
      for (let i = 0; i < salesPayload.length; i += 500) {
        const chunk = salesPayload.slice(i, i + 500);
        const { error } = await supabase.from("ticket_sales").insert(chunk);
        if (error) throw error;
      }

      // === 7. Log de importação ===
      const { data: log, error: logErr } = await supabase
        .from("ticket_import_logs")
        .insert({
          event_id: eventId,
          financial_account_id: feverAccountId,
          file_name: `${salesFile?.name || "fever_sales"} + ${pricesFile?.name || "fever_prices"}`,
          import_type: "sales",
          period_from: parseResult.totals.periodFrom,
          period_to: parseResult.totals.periodTo,
          rows_imported: salesPayload.length,
          rows_skipped: 0,
          zones_created: zoneMappings.filter((m) => !m.existingZoneId).length,
          lots_created: zoneMappings.reduce(
            (s, m) => s + m.group.lots.filter((l) => !m.lotMapping[l.key]).length,
            0,
          ),
          imported_by: userId,
          company_id: companyId,
        })
        .select("id").single();
      if (logErr) console.warn("ticket_import_logs insert failed:", logErr);

      return { logId: log?.id, rowsImported: salesPayload.length };
    },
    onSuccess: (res) => {
      setImportLogId(res.logId || null);
      queryClient.invalidateQueries({ queryKey: ["ticket_office_sales_all"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_offices"] });
      queryClient.invalidateQueries({ queryKey: ["fever_event_existing"] });
      toast.success(`${res.rowsImported} vendas Fever importadas com sucesso.`);
      setStep("done");
    },
    onError: (e: any) => {
      toast.error(e?.message || "Erro na importação");
      setStep("preview");
    },
  });

  // ---- handlers ----
  const reset = () => {
    setStep("upload");
    setSalesFile(null);
    setPricesFile(null);
    setParseResult(null);
    setZoneMappings([]);
    setImportLogId(null);
  };
  const handleClose = () => { reset(); onClose(); };

  // ---- RENDER ----
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importação Fever
            {step !== "upload" && (
              <Badge variant="outline" className="ml-2 text-xs">
                {step === "setup" && "Passo 2/4 · Setup"}
                {step === "preview" && "Passo 3/4 · Preview"}
                {step === "importing" && "A importar…"}
                {step === "done" && "Concluído"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          {/* ============= STEP 1: UPLOAD ============= */}
          {step === "upload" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Evento</Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o evento…" /></SelectTrigger>
                    <SelectContent>
                      {events.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} <span className="text-xs text-muted-foreground ml-2">({e.date})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bilheteira (conta financeira)</Label>
                  <Select value={feverAccountId} onValueChange={setFeverAccountId}>
                    <SelectTrigger><SelectValue placeholder="Conta Fever" /></SelectTrigger>
                    <SelectContent>
                      {feverAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2 text-sm">Ficheiros Fever (XLSX)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Faça upload dos 2 relatórios exportados do back-office Fever:
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* SALES */}
                  <button
                    type="button"
                    onClick={() => salesRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors hover:border-primary ${salesFile ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm font-medium">1️⃣ Vendas por dia</div>
                    <div className="text-xs text-muted-foreground mt-1">tickets_per_ticket_type_and_purchase_date_*.xlsx</div>
                    {salesFile && (
                      <div className="mt-2 text-xs text-primary truncate">✓ {salesFile.name}</div>
                    )}
                  </button>
                  <input
                    ref={salesRef} type="file" accept=".xlsx" hidden
                    onChange={(e) => setSalesFile(e.target.files?.[0] || null)}
                  />

                  {/* PRICES */}
                  <button
                    type="button"
                    onClick={() => pricesRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors hover:border-primary ${pricesFile ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm font-medium">2️⃣ Preços e totais</div>
                    <div className="text-xs text-muted-foreground mt-1">sales_per_ticket_type_and_ticket_price_*.xlsx</div>
                    {pricesFile && (
                      <div className="mt-2 text-xs text-primary truncate">✓ {pricesFile.name}</div>
                    )}
                  </button>
                  <input
                    ref={pricesRef} type="file" accept=".xlsx" hidden
                    onChange={(e) => setPricesFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {existing && existing.zones.length > 0 && feverAccountId && (
                <Alert>
                  <RefreshCw className="h-4 w-4" />
                  <AlertTitle>Re-importação detectada</AlertTitle>
                  <AlertDescription>
                    Este evento já tem {existing.zones.length} zonas configuradas. As vendas Fever existentes
                    ({existing.currentSales.length} registos) serão <strong>substituídas pelas do ficheiro</strong>.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ============= STEP 2: SETUP ============= */}
          {step === "setup" && parseResult && (
            <div className="space-y-4">
              {isFirstImport && (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>1ª importação — setup automático</AlertTitle>
                  <AlertDescription className="text-xs">
                    Vão ser criadas: <strong>2 datas</strong> (Sáb/Dom), <strong>2 sessões</strong>,{" "}
                    <strong>{zoneMappings.length} zonas</strong> (4 diárias por sessão + 2 para Passes 2 dias),{" "}
                    <strong>{parseResult.lots.length} lotes</strong> (1 por variante de preço).
                    Capacidade fica a 0 — configure depois na página do evento.
                  </AlertDescription>
                </Alert>
              )}

              {!isFirstImport && newZonesCount > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Novas zonas/lotes detectados</AlertTitle>
                  <AlertDescription className="text-xs">
                    Este ficheiro Fever introduz <strong>{newZonesCount} zonas novas</strong> e{" "}
                    <strong>{newLotsCount} lotes novos</strong> que serão criados na importação.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {zoneMappings.map((m, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {m.group.zoneName}
                        <Badge variant={m.existingZoneId ? "secondary" : "default"} className="text-xs">
                          {m.existingZoneId ? "existente" : "será criada"}
                        </Badge>
                        {m.group.daySlot === null && (
                          <Badge variant="outline" className="text-xs">sem sessão (passe 2 dias)</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.group.lots.length} lotes · {m.group.lots.reduce((s, l) => s + l.totalQty, 0)} bilhetes
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Lote</TableHead>
                          <TableHead className="text-xs text-right">Preço</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right">Receita bruta</TableHead>
                          <TableHead className="text-xs">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.group.lots.map((lot) => (
                          <TableRow key={lot.key}>
                            <TableCell className="text-xs">{lot.lotName}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(lot.unitPrice)}</TableCell>
                            <TableCell className="text-xs text-right">{lot.totalQty}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(lot.totalGross)}</TableCell>
                            <TableCell className="text-xs">
                              {m.lotMapping[lot.key] ? (
                                <Badge variant="secondary" className="text-xs">existente</Badge>
                              ) : (
                                <Badge variant="default" className="text-xs">novo</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============= STEP 3: PREVIEW ============= */}
          {step === "preview" && parseResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <KPI label="Bilhetes" value={parseResult.totals.totalQty.toString()} />
                <KPI label="Receita bruta" value={formatCurrency(parseResult.totals.totalGross)} />
                <KPI label="Desconto" value={formatCurrency(parseResult.totals.totalDiscount)} />
                <KPI label="User Payment" value={formatCurrency(parseResult.totals.totalUserPayment)} />
                <KPI label="Período" value={`${parseResult.totals.periodFrom} → ${parseResult.totals.periodTo}`} small />
                <KPI label="Tipos de bilhete" value={parseResult.totals.distinctTypes.toString()} />
                <KPI label="Linhas de venda" value={parseResult.sales.length.toString()} />
                <KPI label="Zonas (criar/usar)" value={`${newZonesCount}+${zoneMappings.length - newZonesCount}`} />
              </div>

              {willDeletePriorSales && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Substituição de vendas anteriores</AlertTitle>
                  <AlertDescription className="text-xs">
                    Vão ser apagadas <strong>{existing!.currentSales.length} linhas</strong> de vendas Fever
                    existentes neste evento e re-criadas a partir deste ficheiro (Fever é a fonte de verdade).
                  </AlertDescription>
                </Alert>
              )}

              {divergences.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Divergências vs estado atual ({divergences.length} lotes)
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Lote</TableHead>
                        <TableHead className="text-xs text-right">Antes (qty / €)</TableHead>
                        <TableHead className="text-xs text-right">Depois (qty / €)</TableHead>
                        <TableHead className="text-xs text-right">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {divergences.slice(0, 50).map((d) => (
                        <TableRow key={d.lotKey}>
                          <TableCell className="text-xs">
                            <div className="font-medium">{d.ticketType}</div>
                            <div className="text-muted-foreground">{d.zoneName}</div>
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {d.before.qty} / {formatCurrency(d.before.revenue)}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {d.after.qty} / {formatCurrency(d.after.revenue)}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            <span className={d.diffQty > 0 ? "text-green-500" : "text-red-500"}>
                              {d.diffQty > 0 ? "+" : ""}{d.diffQty}
                            </span>
                            <span className="text-muted-foreground"> / </span>
                            <span className={d.diffRevenue > 0 ? "text-green-500" : "text-red-500"}>
                              {d.diffRevenue > 0 ? "+" : ""}{formatCurrency(d.diffRevenue)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {divergences.length > 50 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ... e mais {divergences.length - 50} linhas (ver no relatório PDF após importar).
                    </p>
                  )}
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Avisos do ficheiro</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-xs">
                      {parseResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ============= STEP DONE ============= */}
          {step === "done" && (
            <div className="text-center py-10 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Importação concluída!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {parseResult?.totals.totalQty} bilhetes ·{" "}
                  {formatCurrency(parseResult?.totals.totalGross || 0)} de receita bruta
                  importados na conta Fever.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          {step === "upload" && (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button
                disabled={!eventId || !feverAccountId || !salesFile || !pricesFile || parsing}
                onClick={handleParse}
              >
                {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A ler…</> : <>Analisar <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </>
          )}
          {step === "setup" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button onClick={() => setStep("preview")}>
                Continuar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("setup")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button
                disabled={importMutation.isPending}
                onClick={() => { setStep("importing"); importMutation.mutate(); }}
              >
                {importMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A importar…</> : <>Importar {parseResult?.sales.length} vendas <Upload className="h-4 w-4 ml-2" /></>}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KPI({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={small ? "text-xs font-medium mt-1" : "text-lg font-bold mt-1"}>{value}</div>
    </div>
  );
}
