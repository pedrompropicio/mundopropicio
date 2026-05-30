/**
 * FeverImportModal — Importação de vendas Fever (2 ficheiros XLSX).
 *
 * MODELO UNIFICADO (decisão 2026-05-03):
 *  - Cada zona-dia (Relvado-Sáb, Relvado-Dom, Tenda-Sáb, Tenda-Dom) é uma
 *    `event_ticket_zones` com session_id próprio.
 *  - Lotes "Entrada Diária" são lotes simples na zona-dia correspondente.
 *  - Passes 2 dias viram lotes com `is_combo=true`, ancorados na zona-Sábado
 *    da mesma família física, com `consumes_zone_ids = [satZoneId, sunZoneId]`.
 *    Isto faz com que cada passe vendido abata 1 lugar na zona-Sáb e 1 na
 *    zona-Dom da família.
 *  - Reimport apaga TODOS os ticket_sales Fever do evento e re-cria.
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
  ArrowRight, ArrowLeft, RefreshCw, Sparkles, Layers,
} from "lucide-react";
import {
  parseFeverXlsx,
  groupFeverLots,
  type FeverParseResult,
  type FeverGroupedLots,
  FEVER_IVA_RATE,
} from "@/lib/parse-fever-xlsx";
import { formatCurrency } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultEventId?: string;
}

type Step = "upload" | "setup" | "preview" | "importing" | "done";

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
  const [grouped, setGrouped] = useState<FeverGroupedLots | null>(null);
  const [importLogId, setImportLogId] = useState<string | null>(null);

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

  useMemo(() => {
    if (!feverAccountId && feverAccounts.length === 1) {
      setFeverAccountId(feverAccounts[0].id);
    }
  }, [feverAccounts, feverAccountId]);

  const { data: existing } = useQuery({
    queryKey: ["fever_event_existing", eventId, feverAccountId],
    enabled: !!eventId,
    queryFn: async () => {
      const [datesRes, sessionsRes, zonesRes] = await Promise.all([
        supabase.from("event_dates").select("id, date, label").eq("event_id", eventId).order("date"),
        supabase.from("event_sessions").select("id, date, label").eq("event_id", eventId).order("date"),
        supabase.from("event_ticket_zones").select("id, name, session_id, total_capacity").eq("event_id", eventId),
      ]);
      const dates = datesRes.data || [];
      const sessions = sessionsRes.data || [];
      const zones = zonesRes.data || [];
      let currentSales: any[] = [];
      if (zones.length > 0 && feverAccountId) {
        const { data: salesData } = await supabase
          .from("ticket_sales")
          .select("id")
          .in("zone_id", zones.map((z: any) => z.id))
          .eq("financial_account_id", feverAccountId);
        currentSales = salesData || [];
      }
      return { dates, sessions, zones, currentSales };
    },
  });

  const handleParse = async () => {
    if (!salesFile || !pricesFile) {
      toast.error("Selecione os 2 ficheiros (vendas e preços).");
      return;
    }
    setParsing(true);
    try {
      const result = await parseFeverXlsx(salesFile, pricesFile);
      setParseResult(result);
      setGrouped(groupFeverLots(result.lots));
      setStep("setup");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao ler ficheiros Fever");
    } finally {
      setParsing(false);
    }
  };

  const isFirstImport = !existing || existing.zones.length === 0;
  const willDeletePriorSales = (existing?.currentSales.length || 0) > 0;

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parseResult || !grouped || !eventId || !feverAccountId) throw new Error("Estado inválido");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      const { data: ev } = await supabase.from("events").select("company_id, date").eq("id", eventId).single();
      if (!ev) throw new Error("Evento não encontrado");
      const companyId = ev.company_id;

      // === 1. DATAS Sábado/Domingo ===
      let saturdayDate: string;
      let sundayDate: string;
      if (existing && existing.dates.length >= 2) {
        const sorted = [...existing.dates].sort((a: any, b: any) => a.date.localeCompare(b.date));
        saturdayDate = sorted[0].date;
        sundayDate = sorted[1].date;
      } else {
        const base = new Date(ev.date + "T00:00:00");
        const next = new Date(base.getTime() + 86400000);
        saturdayDate = ev.date;
        sundayDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      }

      const upsertDate = async (date: string, label: string) => {
        const found = existing?.dates.find((d: any) => d.date === date);
        if (found) return found;
        const { data, error } = await supabase
          .from("event_dates")
          .insert({ event_id: eventId, date, label, company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        return data!;
      };
      const upsertSession = async (date: string, label: string, sortOrder: number) => {
        const found = existing?.sessions.find((s: any) => s.date === date);
        if (found) return found;
        const { data, error } = await supabase
          .from("event_sessions")
          .insert({ event_id: eventId, date, label, sort_order: sortOrder, company_id: companyId })
          .select("id, date, label").single();
        if (error) throw error;
        return data!;
      };

      await upsertDate(saturdayDate, "Sábado");
      await upsertDate(sundayDate, "Domingo");
      const satSession = await upsertSession(saturdayDate, "Sábado", 1);
      const sunSession = await upsertSession(sundayDate, "Domingo", 2);

      // === 1.5. Limpar zonas órfãs do modelo antigo "(Passe 2 dias)" ===
      // No modelo unificado (Opção B) os passes vivem como is_combo=true na zona-Sábado.
      // Zonas com sufixo "(Passe 2 dias)" são resíduo da importação antiga e duplicam receita.
      const orphanZones = (existing?.zones || []).filter((z: any) =>
        /\(passe 2 dias\)/i.test(z.name || ""),
      );
      if (orphanZones.length > 0) {
        const orphanIds = orphanZones.map((z: any) => z.id);
        const { data: orphanLots } = await supabase
          .from("event_ticket_lots")
          .select("id")
          .in("zone_id", orphanIds);
        const orphanLotIds = (orphanLots || []).map((l: any) => l.id);
        if (orphanLotIds.length > 0) {
          await supabase.from("ticket_sales").delete().in("lot_id", orphanLotIds);
          await supabase.from("event_ticket_lots").delete().in("id", orphanLotIds);
        }
        await supabase.from("event_ticket_zones").delete().in("id", orphanIds);
      }

      // === 2. ZONAS-DIA (uma por daily group) ===
      // Sweep TOTAL de lotes Fever do evento (substitutivo):
      //  (a) lotes em zonas cujo nome bate com as zonas-dia esperadas;
      //  (b) lotes ligados a QUALQUER ticket_sale da conta Fever
      //      (apanha phantom lots de runs antigos — ex.: cortesias €300/€900
      //      antes do FEVER_EXCLUDED_PRICES existir).
      const expectedZoneNames = new Set(grouped.dailyGroups.map((g) => norm(g.zoneName)));
      const feverZonesBeforeImport = (existing?.zones || []).filter((z: any) => expectedZoneNames.has(norm(z.name)));
      const lotIdsToSweep = new Set<string>();

      const feverZoneIdsBeforeImport = feverZonesBeforeImport.map((z: any) => z.id);
      if (feverZoneIdsBeforeImport.length > 0) {
        const { data: lotsByZone } = await supabase
          .from("event_ticket_lots").select("id").in("zone_id", feverZoneIdsBeforeImport);
        for (const l of (lotsByZone || []) as any[]) lotIdsToSweep.add(l.id);
      }

      const allEventZoneIdsForSweep = (existing?.zones || []).map((z: any) => z.id);
      if (allEventZoneIdsForSweep.length > 0) {
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: rows, error } = await supabase.from("ticket_sales")
            .select("lot_id")
            .in("zone_id", allEventZoneIdsForSweep)
            .eq("financial_account_id", feverAccountId)
            .not("lot_id", "is", null)
            .range(from, from + pageSize - 1);
          if (error) break;
          if (!rows || rows.length === 0) break;
          for (const r of rows as any[]) if (r.lot_id) lotIdsToSweep.add(r.lot_id);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
      }

      if (lotIdsToSweep.size > 0) {
        const ids = Array.from(lotIdsToSweep);
        const { error: salesByLotErr } = await supabase.from("ticket_sales").delete().in("lot_id", ids);
        if (salesByLotErr) throw salesByLotErr;
        const { error: lotsErr } = await supabase.from("event_ticket_lots").delete().in("id", ids);
        if (lotsErr) throw lotsErr;
      }


      // Reaproveita zonas existentes por nome normalizado, senão cria.
      const zoneIdByKindDay = new Map<string, string>(); // `${kind}|${slot}` -> zone_id
      for (const g of grouped.dailyGroups) {
        const sessionId = g.daySlot === "saturday" ? satSession.id : sunSession.id;
        const match = existing?.zones.find(
          (z: any) => norm(z.name) === norm(g.zoneName) && z.session_id === sessionId,
        );
        let zoneId: string;
        if (match) {
          zoneId = match.id;
        } else {
          const { data, error } = await supabase
            .from("event_ticket_zones")
            .insert({
              event_id: eventId,
              name: g.zoneName,
              session_id: sessionId,
              total_capacity: 0,
              company_id: companyId,
            })
            .select("id").single();
          if (error) throw error;
          zoneId = data!.id;
        }
        zoneIdByKindDay.set(`${g.physicalZone}|${g.daySlot}`, zoneId);
      }

      // === 3. LOTES diários ===
      const resolvedLotIds: Record<string, string> = {}; // ticketKey -> lot_id
      const lotZoneByKey = new Map<string, string>();
      const ensureLot = async (
        zoneId: string,
        lot: { key: string; lotName: string; unitPrice: number; totalQty: number; ticketPrice: number },
        opts: { isCombo: boolean; consumesZoneIds: string[]; lotNumber: number },
      ) => {
        // Combo SEM consumes_zone_ids dá fallback errado em useEventAttendance (0 público no Dom). Bloqueia.
        if (opts.isCombo && opts.consumesZoneIds.length === 0) {
          throw new Error(`Combo "${lot.lotName}" precisa de consumes_zone_ids preenchido (zonas Sáb+Dom).`);
        }

        // tenta achar lote existente nesta zona com mesmo nome/preço
        const { data: existingLots } = await supabase
          .from("event_ticket_lots")
          .select("id, name, price")
          .eq("zone_id", zoneId);
        const found = (existingLots || []).find(
          (l: any) =>
            norm(l.name) === norm(lot.lotName) &&
            (Math.abs(Number(l.price) - lot.unitPrice) < 0.01 ||
              Math.abs(Number(l.price) - lot.ticketPrice) < 0.01),
        );
        if (found) {
          await supabase
            .from("event_ticket_lots")
            .update({
              price: lot.unitPrice,
              quantity: lot.totalQty,
              iva_rate: FEVER_IVA_RATE,
              is_combo: opts.isCombo,
              lot_kind: opts.isCombo ? "combo" : "simple",
              consumes_zone_ids: opts.isCombo ? opts.consumesZoneIds : [],
            })
            .eq("id", found.id);
          resolvedLotIds[lot.key] = found.id;
        } else {
          const { data, error } = await supabase
            .from("event_ticket_lots")
            .insert({
              zone_id: zoneId,
              name: lot.lotName,
              lot_number: opts.lotNumber,
              lot_type: "regular",
              lot_kind: opts.isCombo ? "combo" : "simple",
              is_combo: opts.isCombo,
              consumes_zone_ids: opts.isCombo ? opts.consumesZoneIds : [],
              price: lot.unitPrice,
              quantity: lot.totalQty,
              iva_rate: FEVER_IVA_RATE,
              company_id: companyId,
            })
            .select("id").single();
          if (error) throw error;
          resolvedLotIds[lot.key] = data!.id;
        }
        lotZoneByKey.set(lot.key, zoneId);
      };

      for (const g of grouped.dailyGroups) {
        const zoneId = zoneIdByKindDay.get(`${g.physicalZone}|${g.daySlot}`)!;
        let n = 1;
        for (const lot of g.lots) {
          await ensureLot(zoneId, lot, { isCombo: false, consumesZoneIds: [], lotNumber: n++ });
        }
      }

      // === 4. LOTES combo (passes 2 dias) — ancorados em zona-Sábado da família ===
      for (const g of grouped.comboGroups) {
        const satZoneId = zoneIdByKindDay.get(`${g.physicalZone}|saturday`);
        const sunZoneId = zoneIdByKindDay.get(`${g.physicalZone}|sunday`);
        if (!satZoneId || !sunZoneId) {
          throw new Error(
            `Combo "${g.groupLabel}" requer zonas Sáb+Dom da família ${g.physicalZone}. ` +
            `Verifique se o ficheiro tem entradas diárias dessa família nos 2 dias.`,
          );
        }
        let n = 1;
        for (const lot of g.lots) {
          await ensureLot(satZoneId, lot, {
            isCombo: true,
            consumesZoneIds: [satZoneId, sunZoneId],
            lotNumber: n++,
          });
        }
      }

      // === 5. Assignment Fever → evento ===
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

      // === 6. APAGAR ticket_sales Fever existentes ===
      // Importante: apagar TODAS as vendas Fever deste evento (não só nas zonas
      // novas). Se a importação anterior criou zonas com nome ligeiramente
      // diferente, as vendas antigas ficariam órfãs e somariam por cima
      // (re-import duplicaria a receita).
      const { data: allEventZones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);
      const allEventZoneIds = (allEventZones || []).map((z: any) => z.id);
      if (allEventZoneIds.length > 0) {
        const { error } = await supabase
          .from("ticket_sales")
          .delete()
          .in("zone_id", allEventZoneIds)
          .eq("financial_account_id", feverAccountId);
        if (error) throw error;
      }

      // === 7. INSERIR ticket_sales ===
      const importBatchId = crypto.randomUUID();
      const salesPayload = parseResult.sales.map((s) => ({
        zone_id: lotZoneByKey.get(s.lotKey)!,
        lot_id: resolvedLotIds[s.lotKey],
        sale_date: s.purchaseDate,
        quantity: s.quantity,
        unit_price: s.unitPrice,
        total_value: s.totalValue,
        financial_account_id: feverAccountId,
        source: "fever_import",
        notes: `Fever • ${s.weekday} • ${s.ticketType}`,
        import_batch_id: importBatchId,
        created_by: userId,
        company_id: companyId,
      }));

      for (let i = 0; i < salesPayload.length; i += 500) {
        const chunk = salesPayload.slice(i, i + 500);
        const { error } = await supabase.from("ticket_sales").insert(chunk);
        if (error) throw error;
      }

      // === 8. Log ===
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
          zones_created: 0,
          lots_created: 0,
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
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sim-coala-lot-sales", eventId] });
      queryClient.invalidateQueries({ queryKey: ["sim-coala-be-lots-v2", eventId] });
      queryClient.invalidateQueries({ queryKey: ["city-sim-lots", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_zones_attendance", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_lots_attendance", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_real_sales_attendance", eventId] });
      toast.success(`${res.rowsImported} vendas Fever importadas com sucesso.`);
      setStep("done");
    },
    onError: (e: any) => {
      toast.error(e?.message || "Erro na importação");
      setStep("preview");
    },
  });

  const reset = () => {
    setStep("upload");
    setSalesFile(null);
    setPricesFile(null);
    setParseResult(null);
    setGrouped(null);
    setImportLogId(null);
  };
  const handleClose = () => { reset(); onClose(); };

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
                  <button
                    type="button"
                    onClick={() => salesRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors hover:border-primary ${salesFile ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm font-medium">1️⃣ Vendas por dia</div>
                    <div className="text-xs text-muted-foreground mt-1">tickets_per_ticket_type_and_purchase_date_*.xlsx</div>
                    {salesFile && <div className="mt-2 text-xs text-primary truncate">✓ {salesFile.name}</div>}
                  </button>
                  <input ref={salesRef} type="file" accept=".xlsx" hidden
                    onChange={(e) => setSalesFile(e.target.files?.[0] || null)} />

                  <button
                    type="button"
                    onClick={() => pricesRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors hover:border-primary ${pricesFile ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm font-medium">2️⃣ Preços e totais</div>
                    <div className="text-xs text-muted-foreground mt-1">sales_per_ticket_type_and_ticket_price_*.xlsx</div>
                    {pricesFile && <div className="mt-2 text-xs text-primary truncate">✓ {pricesFile.name}</div>}
                  </button>
                  <input ref={pricesRef} type="file" accept=".xlsx" hidden
                    onChange={(e) => setPricesFile(e.target.files?.[0] || null)} />
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

          {step === "setup" && parseResult && grouped && (
            <div className="space-y-4">
              {isFirstImport && (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>1ª importação — modelo unificado</AlertTitle>
                  <AlertDescription className="text-xs">
                    Vão ser criadas <strong>{grouped.dailyGroups.length} zonas-dia</strong> e{" "}
                    <strong>{grouped.dailyGroups.reduce((s, g) => s + g.lots.length, 0)} lotes simples</strong>.
                    {grouped.comboGroups.length > 0 && (
                      <>
                        {" "}Os passes de 2 dias viram <strong>{grouped.comboGroups.reduce((s, g) => s + g.lots.length, 0)} lotes Combo</strong>{" "}
                        ancorados na zona-Sábado da família, consumindo capacidade de Sáb e Dom.
                      </>
                    )}
                    {" "}Capacidade fica a 0 — configure depois na página do evento.
                  </AlertDescription>
                </Alert>
              )}

              {/* Zonas-dia */}
              <div className="space-y-3">
                {grouped.dailyGroups.map((g, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">{g.zoneName}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.lots.length} lotes · {g.lots.reduce((s, l) => s + l.totalQty, 0)} bilhetes
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Lote</TableHead>
                          <TableHead className="text-xs text-right">Preço</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right">Receita bruta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.lots.map((lot) => (
                          <TableRow key={lot.key}>
                            <TableCell className="text-xs">{lot.lotName}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(lot.unitPrice)}</TableCell>
                            <TableCell className="text-xs text-right">{lot.totalQty}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(lot.totalGross)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>

              {/* Combos */}
              {grouped.comboGroups.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> Combos (Passes 2 dias)
                  </h4>
                  {grouped.comboGroups.map((g, idx) => (
                    <div key={idx} className="border rounded-lg p-3 border-primary/30 bg-primary/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {g.groupLabel}
                          <Badge variant="default" className="text-xs">combo · consome Sáb + Dom</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {g.lots.length} lotes · {g.lots.reduce((s, l) => s + l.totalQty, 0)} passes
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Lote</TableHead>
                            <TableHead className="text-xs text-right">Preço</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                            <TableHead className="text-xs text-right">Receita bruta</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.lots.map((lot) => (
                            <TableRow key={lot.key}>
                              <TableCell className="text-xs">{lot.lotName}</TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(lot.unitPrice)}</TableCell>
                              <TableCell className="text-xs text-right">{lot.totalQty}</TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(lot.totalGross)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                <KPI label="Combos" value={(grouped?.comboGroups.reduce((s, g) => s + g.lots.length, 0) ?? 0).toString()} />
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
          {step === "upload" && (() => {
            const reasons: string[] = [];
            if (!eventId) reasons.push("Selecione o evento");
            if (!feverAccountId) reasons.push(feverAccounts.length === 0 ? "Sem conta Fever disponível nesta empresa" : "Selecione a bilheteira Fever");
            if (!salesFile) reasons.push("Anexe o ficheiro de vendas");
            if (!pricesFile) reasons.push("Anexe o ficheiro de preços");
            const disabled = reasons.length > 0 || parsing;
            const reasonText = parsing ? "A processar…" : reasons.join(" · ");
            return (
              <>
                {disabled && reasonText && (
                  <span className="text-xs text-muted-foreground mr-auto self-center">{reasonText}</span>
                )}
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <span title={disabled ? reasonText : undefined} className={disabled ? "cursor-not-allowed" : ""}>
                  <Button disabled={disabled} onClick={handleParse}>
                    {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A ler…</> : <>Analisar <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </span>
              </>
            );
          })()}
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
          {step === "done" && <Button onClick={handleClose}>Fechar</Button>}
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
