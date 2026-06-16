import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Ticket, Calendar, Layers, Route, TrendingUp, TrendingDown, FileText, Paperclip, ClipboardList, LayoutList, Table2, Download, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import { type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { calcTotalWithIva } from "@/lib/iva";
import PartnerDREDialog from "@/components/PartnerDREDialog";
import BPGridEditor from "@/components/BPGridEditor";
import { withCompanyPath } from "@/lib/storage";
import { exportPartnerBPPdf } from "@/lib/export-partner-bp-pdf";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

/** Resolve um file_url de transaction_documents em URL clicável.
 *  - ref://http(s)://… → link externo direto
 *  - ref://… (placeholder interno) → null (não clicável)
 *  - http(s)://… → devolvido como está
 *  - resto → Signed URL no bucket multi-tenant (transaction-documents / camarim-documents)
 */
async function resolveDocUrl(fileUrl: string | null | undefined): Promise<string | null> {
  if (!fileUrl) return null;
  if (/^ref:\/\/https?:\/\//i.test(fileUrl)) return fileUrl.replace(/^ref:\/\//i, "");
  if (fileUrl.startsWith("ref://")) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  let bucket: "transaction-documents" | "camarim-documents" = "transaction-documents";
  let path = fileUrl;
  if (fileUrl.startsWith("camarim://")) {
    bucket = "camarim-documents";
    path = fileUrl.replace(/^camarim:\/\//, "");
  }

  // Download autenticado evita falsos negativos de HEAD/CORS em URLs assinadas.
  const tryDownload = async (p: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(bucket).download(p);
    if (error || !data) return null;
    const blobUrl = URL.createObjectURL(data);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return blobUrl;
  };

  // 1) Tenta o path multi-tenant com prefixo da empresa.
  try {
    const prefixedPath = await withCompanyPath(bucket, path);
    const prefixed = await tryDownload(prefixedPath);
    if (prefixed) return prefixed;
  } catch { /* fallback abaixo */ }

  // 2) Fallback: paths antigos guardados sem prefixo de empresa.
  const raw = await tryDownload(path);
  if (raw) return raw;

  return null;
}


async function openDoc(fileUrl: string) {
  const url = await resolveDocUrl(fileUrl);
  if (!url) {
    toast.error("Anexo indisponível");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const eventTypeLabels: Record<string, string> = {
  simple: "Evento Simples",
  festival: "Festival",
  multi_day: "Múltiplos Dias / Turnê",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "A Pagar",
  paid: "Pago",
  draft: "Rascunho",
};

export default function PartnerEventDetail() {
  const { id } = useParams();
  const { user, hasPermission } = useAuth();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [dreOpen, setDreOpen] = useState(false);
  const [bpViewMode, setBpViewMode] = useState<"grouped" | "grid">("grouped");
  const isMobile = useIsMobile();
  // No mobile a edição em grelha não cabe — força sempre vista Agrupada.
  const effectiveBpViewMode: "grouped" | "grid" = isMobile ? "grouped" : bpViewMode;
  const [advancesOpen, setAdvancesOpen] = useState(false);
  const [paidByPartnerOpen, setPaidByPartnerOpen] = useState(false);

  // ── Batch 1: parallel independent queries ──
  const { data: accessRows = [], isLoading: isLoadingAccess } = useQuery({
    queryKey: ["partner_access_rows", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_event_access")
        .select("event_id, can_edit_bp, default_tab")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as { event_id: string; can_edit_bp: boolean; default_tab: string | null }[];
    },
    enabled: !!user,
  });
  const accessList = accessRows.map((a) => a.event_id);
  const canEditBpForActive = (activeId: string) => accessRows.some((a) => a.event_id === activeId && a.can_edit_bp);
  const defaultTabForActive = (activeId: string): string => {
    const row = accessRows.find((a) => a.event_id === activeId);
    return row?.default_tab || "bp";
  };

  const { data: allCategories = [] } = useQuery({
    queryKey: ["all_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, code, name, parent_id, type, is_active");
      if (error) throw error;
      return data as (CategoryNode & { type: string; is_active: boolean })[];
    },
    staleTime: 5 * 60_000, // categories rarely change
  });

  // Fetch event + sub-events in one query to eliminate waterfall
  const { data: eventBundle, isLoading } = useQuery({
    queryKey: ["partner_event_bundle", id],
    queryFn: async () => {
      const [eventRes, subRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", id!).single(),
        supabase.from("events").select("*").eq("parent_event_id", id!).order("date", { ascending: true }),
      ]);
      if (eventRes.error) throw eventRes.error;
      return { event: eventRes.data as any, subEvents: (subRes.data ?? []) as any[] };
    },
    enabled: !!id,
  });

  const event = eventBundle?.event;
  const eventType = event?.event_type || "simple";
  const subEvents = eventType === "multi_day" ? (eventBundle?.subEvents ?? []) : [];

  const authorizedSubEvents = subEvents.filter((s: any) => accessList.includes(s.id));
  const hasParentAccess = accessList.includes(id!);
  const visibleSubEvents = hasParentAccess ? subEvents : authorizedSubEvents;

  // Para turnê: default = Master (mostra agregado de todas as cidades).
  const defaultMultiDayId = id!;
  const activeEventId = selectedSubEvent || (eventType === "multi_day" ? defaultMultiDayId : id!);
  const isMasterView = eventType === "multi_day" && activeEventId === id;

  // ── Fase 2b: edição do BP em grelha (estilo planilha) ──
  const canEditBpHere = !!activeEventId && !isMasterView
    && canEditBpForActive(activeEventId)
    && hasPermission("edit_approved_bp");

  const { data: bpActiveVersionId } = useQuery({
    queryKey: ["bp_active_version_id_partner", activeEventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bp_versions")
        .select("id")
        .eq("event_id", activeEventId!)
        .eq("state", "active")
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
    enabled: canEditBpHere,
  });

  const { data: bpGridForecasts = [] } = useQuery({
    queryKey: ["event_forecasts", "partner_grid", activeEventId, bpActiveVersionId ?? null],
    queryFn: async () => {
      const q = supabase
        .from("event_forecasts")
        .select("*, account_categories(id, code, name, parent_id, type)")
        .eq("event_id", activeEventId!)
        .order("type", { ascending: true });
      const { data, error } = bpActiveVersionId
        ? await q.eq("version_id", bpActiveVersionId)
        : await q.is("version_id", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: canEditBpHere && bpViewMode === "grid",
  });

  // ── Batch 2: all event-specific data in parallel ──
  const shouldFetchEventData = !!activeEventId;

  // parentEventId tem de ser o pai do evento ATIVO (sub-evento selecionado),
  // não do evento da URL. Em turnês multi_day, a URL é o Master mas o
  // activeEventId é a primeira cidade — o pai dessa cidade é o Master.
  const parentEventId = activeEventId === id
    ? ((event as any)?.parent_event_id ?? null)
    : id ?? null;

  const { data: eventData } = useQuery({
    queryKey: ["partner_event_data", activeEventId, parentEventId, isMasterView, subEvents.map((s:any)=>s.id).join(",")],
    queryFn: async () => {
      // Em modo Master: agrega Master + todos sub-eventos visíveis
      // Em modo cidade: ativo + Master (rateado ÷N)
      const subIds = visibleSubEvents.map((s: any) => s.id);
      const txEventIds = isMasterView
        ? [id!, ...subIds]
        : ([activeEventId, parentEventId].filter(Boolean) as string[]);
      const overheadEventIds = txEventIds;

      // Conta de irmãos para ratear transações Master ÷ N quando sub-evento
      const siblingsRes = parentEventId
        ? await supabase.from("events").select("id").eq("parent_event_id", parentEventId)
        : { data: null as any[] | null, error: null };
      const siblingCount = siblingsRes.data?.length || 1;
      const masterChildCount = subIds.length || 1;

      // Em Master view, buscar zonas de TODOS os sub-eventos (para receita de bilheteira agregada).
      const zonesEventIds = isMasterView ? [id!, ...subIds] : [activeEventId];
      const [zonesRes, txRes, sessionsRes, activeVersionRes, overheadsRes] = await Promise.all([
        supabase.from("event_ticket_zones").select("*, event_ticket_lots(*)").in("event_id", zonesEventIds),
        supabase
          .from("transactions")
          .select("*, account_categories(id, code, name, parent_id)")
          .in("event_id", txEventIds)
          .order("date", { ascending: false }),
        supabase.from("event_sessions").select("id, label, date, start_time, sort_order").eq("event_id", activeEventId).order("sort_order"),
        supabase.from("bp_versions").select("version_number, approved_at, description").eq("event_id", activeEventId).eq("state", "active").maybeSingle(),
        supabase
          .from("event_forecasts")
          .select("id, event_id, amount, iva_rate, description, category_id, status, type, is_overhead, account_categories(id, code, name, parent_id)")
          .in("event_id", overheadEventIds)
          .eq("status", "approved")
          .is("version_id", null),
      ]);
      if (zonesRes.error) throw zonesRes.error;
      if (txRes.error) throw txRes.error;

      const zones = (zonesRes.data ?? []) as any[];
      const allTxs = (txRes.data ?? []) as any[];
      const txIds = allTxs.map((t: any) => t.id);

      const isValidTx = (t: any) =>
        (t.status === "approved" || t.status === "paid") &&
        !t.is_transitory &&
        !t.exclude_from_result;

      let effectiveTransactions: any[];
      if (isMasterView) {
        // Master: locais (Master) + todos sub-eventos, sem rateio
        effectiveTransactions = allTxs.filter(isValidTx);
      } else {
        const localTx = allTxs.filter((t: any) => t.event_id === activeEventId && isValidTx(t));
        const masterTx = parentEventId
          ? allTxs
              .filter((t: any) => t.event_id === parentEventId && isValidTx(t))
              .map((t: any) => ({
                ...t,
                amount: Number(t.amount) / siblingCount,
                paid_amount: t.paid_amount != null ? Number(t.paid_amount) / siblingCount : t.paid_amount,
                _viaMaster: true,
              }))
          : [];
        effectiveTransactions = [...localTx, ...masterTx];
      }

      // Zone IDs
      const zoneIds = zones.map((z: any) => z.id);

      const [salesRes, docsRes] = await Promise.all([
        zoneIds.length > 0
          ? supabase.from("ticket_sales").select("zone_id, quantity, unit_price, lot_id, financial_account_id").in("zone_id", zoneIds)
          : Promise.resolve({ data: [], error: null }),
        txIds.length > 0
          ? supabase.from("transaction_documents").select("id, transaction_id, name, file_url, doc_type").in("transaction_id", txIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const allForecastsRaw = (overheadsRes.data ?? []) as any[];
      const overheadsRaw = allForecastsRaw.filter((f: any) => f.is_overhead === true);
      // Para a aba BP de custos: todas as previsões de despesa (overhead ou não).
      const bpExpensesRaw = allForecastsRaw.filter((f: any) => f.type === "expense");

      const rateForActive = (raw: any[]) => {
        if (isMasterView) return raw;
        return raw.flatMap((o: any) => {
          if (o.event_id === activeEventId) return [o];
          if (o.event_id === parentEventId) {
            return [{ ...o, amount: Number(o.amount) / siblingCount, _viaMaster: true }];
          }
          return [];
        });
      };
      const overheadsForActive: any[] = rateForActive(overheadsRaw);
      const bpExpensesForActive: any[] = rateForActive(bpExpensesRaw);

      // Para vista Master: calcular per-city (ratear Master ÷N nos sub-eventos)
      const perCityBreakdown = isMasterView
        ? visibleSubEvents.map((sub: any) => {
            const localTx = allTxs.filter((t: any) => t.event_id === sub.id && isValidTx(t));
            const masterTxRated = allTxs
              .filter((t: any) => t.event_id === id && isValidTx(t))
              .map((t: any) => ({ ...t, amount: Number(t.amount) / masterChildCount }));
            const cityTx = [...localTx, ...masterTxRated];
            const cityOverheads = overheadsRaw.flatMap((o: any) => {
              if (o.event_id === sub.id) return [o];
              if (o.event_id === id) return [{ ...o, amount: Number(o.amount) / masterChildCount }];
              return [];
            });
            // Receita de bilheteira líquida da cidade
            const cityZoneIds = new Set(zones.filter((z: any) => z.event_id === sub.id).map((z: any) => z.id));
            const cityLotIva: Record<string, number> = {};
            zones.filter((z: any) => z.event_id === sub.id).forEach((z: any) => {
              (z.event_ticket_lots || []).forEach((l: any) => { cityLotIva[l.id] = Number(l.iva_rate ?? 6); });
            });
            const citySales = (salesRes.data ?? []).filter((s: any) => cityZoneIds.has(s.zone_id));
            const cityTicketNet = citySales.reduce((s: number, sale: any) => {
              const gross = Number(sale.quantity) * Number(sale.unit_price);
              const iva = cityLotIva[sale.lot_id] ?? 6;
              return s + gross / (1 + iva / 100);
            }, 0);
            const txIncome = cityTx
              .filter((t: any) => t.type === "income")
              .reduce((s: number, t: any) => s + Number(t.amount), 0);
            const income = txIncome + cityTicketNet;
            const expense = cityTx
              .filter((t: any) => t.type === "expense")
              .reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate || 0)), 0)
              + cityOverheads.reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount || 0), Number(o.iva_rate || 0)), 0);
            return { id: sub.id, name: sub.name, income, expense, result: income - expense };
          })
        : [];

      return {
        ticketZones: zones,
        ticketSales: (salesRes.data ?? []) as any[],
        transactions: effectiveTransactions,
        transactionDocs: (docsRes.data ?? []) as any[],
        sessions: (sessionsRes.data ?? []) as any[],
        activeBPVersion: (activeVersionRes.data ?? null) as { version_number: number; approved_at: string | null; description: string | null } | null,
        overheads: overheadsForActive,
        bpExpenses: bpExpensesForActive,
        perCityBreakdown,
      };
    },
    enabled: shouldFetchEventData,
  });

  const ticketZones = eventData?.ticketZones ?? [];
  const ticketSales = eventData?.ticketSales ?? [];
  const transactions = eventData?.transactions ?? [];
  const transactionDocs = eventData?.transactionDocs ?? [];
  const sessions = eventData?.sessions ?? [];
  const activeBPVersion = eventData?.activeBPVersion ?? null;
  const overheads = eventData?.overheads ?? [];
  const bpExpenses: any[] = (eventData as any)?.bpExpenses ?? [];
  const perCityBreakdown = eventData?.perCityBreakdown ?? [];

  // Última importação/criação de vendas de bilhetes (MAX(created_at)) — aba Bilhetes
  const zoneIdsForSales = useMemo(
    () => (eventData?.ticketZones ?? []).map((z: any) => z.id),
    [eventData?.ticketZones],
  );
  const { data: lastSaleAt } = useQuery({
    queryKey: ["partner_last_sale_created_at", zoneIdsForSales.join(",")],
    queryFn: async () => {
      if (zoneIdsForSales.length === 0) return null;
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("created_at")
        .in("zone_id", zoneIdsForSales)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data?.created_at as string | undefined) ?? null;
    },
    enabled: zoneIdsForSales.length > 0,
  });

  const bpVersionLabel = activeBPVersion
    ? `Business Plan — versão v${activeBPVersion.version_number}${
        activeBPVersion.approved_at
          ? ` (${new Date(activeBPVersion.approved_at).toLocaleDateString("pt-PT")})`
          : ""
      }`
    : null;


  // ── Extras / Despesas pagas pelo Sócio (Master view = todos os sub-eventos) ──
  const partnerEventIds = useMemo(
    () => (isMasterView ? [id!, ...visibleSubEvents.map((s: any) => s.id)] : [activeEventId!].filter(Boolean)),
    [isMasterView, id, visibleSubEvents, activeEventId],
  );
  const partnerEventIdsKey = partnerEventIds.join(",");

  const { data: partnerAdvances = [] } = useQuery({
    queryKey: ["partner_event_advances", partnerEventIdsKey],
    queryFn: async () => {
      if (partnerEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("partner_advance_expenses")
        .select("id, event_id, notes, created_at, transactions(description, amount, iva_rate, date)")
        .in("event_id", partnerEventIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: partnerEventIds.length > 0,
  });

  const { data: partnerPaidExpenses = [] } = useQuery({
    queryKey: ["partner_event_paid", partnerEventIdsKey],
    queryFn: async () => {
      if (partnerEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("id, event_id, notes, paid_date, created_at, transactions(description, amount, iva_rate, date)")
        .in("event_id", partnerEventIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: partnerEventIds.length > 0,
  });

  // ── Anexos do BP (RPC SECURITY DEFINER — mostra sempre na Agrupada, ignora gate view_partner_documents)
  const { data: bpAttachmentsRaw = [] } = useQuery({
    queryKey: ["bp_line_attachments_partner", partnerEventIdsKey],
    queryFn: async () => {
      if (partnerEventIds.length === 0) return [];
      const { data, error } = await supabase.rpc("get_bp_line_attachments" as any, {
        _event_ids: partnerEventIds,
      } as any);
      if (error) throw error;
      return (data ?? []) as Array<{ forecast_id: string; kind: string; document_id: string; file_name: string }>;
    },
    enabled: partnerEventIds.length > 0,
  });

  const bpAttachmentsByForecast = useMemo(() => {
    const m: Record<string, Array<{ kind: string; document_id: string; file_name: string }>> = {};
    bpAttachmentsRaw.forEach((a) => {
      if (!m[a.forecast_id]) m[a.forecast_id] = [];
      m[a.forecast_id].push({ kind: a.kind, document_id: a.document_id, file_name: a.file_name });
    });
    return m;
  }, [bpAttachmentsRaw]);

  const openBpAttachment = async (kind: string, documentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("resolve-attachment-url", {
        body: { kind, documentId, mode: "signed-url" },
      });
      if (error) throw error;
      const url = (data as any)?.signedUrl;
      if (!url) throw new Error("Sem URL");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível abrir o anexo");
    }
  };

  const eventNameById = useMemo(() => {

    const map: Record<string, string> = {};
    if (event) map[id!] = event.name;
    visibleSubEvents.forEach((s: any) => { map[s.id] = s.name; });
    return map;
  }, [event, visibleSubEvents, id]);

  const totalAdvances = useMemo(
    () => (partnerAdvances as any[]).reduce((s, a) => s + calcTotalWithIva(Number(a.transactions?.amount || 0), Number(a.transactions?.iva_rate || 0)), 0),
    [partnerAdvances],
  );
  const totalPaidByPartner = useMemo(
    () => (partnerPaidExpenses as any[]).reduce((s, a) => s + calcTotalWithIva(Number(a.transactions?.amount || 0), Number(a.transactions?.iva_rate || 0)), 0),
    [partnerPaidExpenses],
  );

  // Filter zones by selected session
  const filteredZones = useMemo(() => {
    if (!selectedSession) return ticketZones; // "Todas"
    return ticketZones.filter((z: any) => z.session_id === selectedSession);
  }, [ticketZones, selectedSession]);

  // Filter sales to only include filtered zones
  const filteredZoneIds = useMemo(() => new Set(filteredZones.map((z: any) => z.id)), [filteredZones]);
  const filteredSales = useMemo(() => ticketSales.filter((s: any) => filteredZoneIds.has(s.zone_id)), [ticketSales, filteredZoneIds]);

  // Group docs by transaction
  const docsByTx = useMemo(() => {
    const map: Record<string, any[]> = {};
    transactionDocs.forEach((d: any) => {
      if (!map[d.transaction_id]) map[d.transaction_id] = [];
      map[d.transaction_id].push(d);
    });
    return map;
  }, [transactionDocs]);

  // ─── Transaction hierarchy groups (L1 > L2 > L3) ───
  // Overheads do BP são embutidos nas despesas pela categoria respetiva,
  // sem qualquer marca/badge — aparecem como linhas normais.
  const txGroupedHier = useMemo(() => {
    const byId: Record<string, CategoryNode> = {};
    allCategories.forEach((c) => { byId[c.id] = c; });

    const getChain = (catId: string | null): { l1: CategoryNode | null; l2: CategoryNode | null; l3: CategoryNode | null } => {
      if (!catId || !byId[catId]) return { l1: null, l2: null, l3: null };
      const cat = byId[catId];
      const pid = cat.parent_id ?? null;
      if (!pid) return { l1: cat, l2: null, l3: null };
      const parent = byId[pid];
      if (!parent) return { l1: null, l2: null, l3: cat };
      const gpid = parent.parent_id ?? null;
      if (!gpid) return { l1: parent, l2: cat, l3: null };
      const gp = byId[gpid];
      return { l1: gp || null, l2: parent, l3: cat };
    };

    type TxItem = {
      id: string; date: string; description: string; amount: number;
      status: string; type: string; docs: any[]; isOverhead?: boolean;
    };
    type L3Group = { code: string; name: string; items: TxItem[]; total: number };
    type L2Group = { code: string; name: string; l3Groups: L3Group[]; total: number };
    type L1Group = { code: string; name: string; l2Groups: L2Group[]; total: number };

    const pushItem = (l1Map: Record<string, L1Group>, catId: string | null, item: TxItem) => {
      const chain = getChain(catId);
      const l1Name = chain.l1?.name ?? "Sem Grupo";
      const l1Code = chain.l1?.code ?? "Z";
      const l2Name = chain.l2?.name ?? chain.l1?.name ?? "Geral";
      const l2Code = chain.l2?.code ?? chain.l1?.code ?? "Z.Z";
      const l3Name = chain.l3?.name ?? chain.l2?.name ?? chain.l1?.name ?? item.description;
      const l3Code = chain.l3?.code ?? chain.l2?.code ?? chain.l1?.code ?? "";

      if (!l1Map[l1Name]) l1Map[l1Name] = { code: l1Code, name: l1Name, l2Groups: [], total: 0 };
      let l2 = l1Map[l1Name].l2Groups.find((g) => g.name === l2Name);
      if (!l2) {
        l2 = { code: l2Code, name: l2Name, l3Groups: [], total: 0 };
        l1Map[l1Name].l2Groups.push(l2);
      }
      let l3 = l2.l3Groups.find((g) => g.name === l3Name);
      if (!l3) {
        l3 = { code: l3Code, name: l3Name, items: [], total: 0 };
        l2.l3Groups.push(l3);
      }
      l3.items.push(item);
      l3.total += item.amount;
      l2.total += item.amount;
      l1Map[l1Name].total += item.amount;
    };

    const buildForType = (type: "income" | "expense"): L1Group[] => {
      const l1Map: Record<string, L1Group> = {};

      transactions
        .filter((t: any) => t.type === type)
        .forEach((t: any) => {
          // Vista do sócio (modo Brasil): despesas em BRUTO (com IVA);
          // receitas em LÍQUIDO. Alinhado com buildPartnerSettlementReportData.
          const baseAmount = Number(t.amount);
          const displayAmount = type === "expense"
            ? calcTotalWithIva(baseAmount, Number(t.iva_rate || 0))
            : baseAmount;
          pushItem(l1Map, t.category_id, {
            id: t.id,
            date: t.date,
            description: t.description,
            amount: displayAmount,
            status: t.status,
            type: t.type,
            docs: docsByTx[t.id] || [],
          });
        });

      // Overheads embutidos nas despesas (sem marcação) — também em BRUTO
      if (type === "expense") {
        overheads.forEach((o: any, idx: number) => {
          if (!o.category_id) return;
          const baseAmount = Number(o.amount || 0);
          const grossAmount = calcTotalWithIva(baseAmount, Number(o.iva_rate || 0));
          pushItem(l1Map, o.category_id, {
            id: `overhead-${o.id}-${idx}`,
            date: "",
            description: o.description || "",
            amount: grossAmount,
            status: "approved",
            type: "expense",
            docs: [],
            isOverhead: true,
          });
        });
      }

      return Object.values(l1Map)
        .map((g) => ({
          ...g,
          l2Groups: g.l2Groups
            .map((l2) => ({
              ...l2,
              l3Groups: l2.l3Groups.sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
            }))
            .sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
        }))
        .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    };

    return { income: buildForType("income"), expense: buildForType("expense") };
  }, [transactions, overheads, allCategories, docsByTx]);

  // ─── BP de custos agrupado L1>L2>L3 (vista do parceiro) ───
  const bpGroupedHier = useMemo(() => {
    const byId: Record<string, CategoryNode> = {};
    allCategories.forEach((c) => { byId[c.id] = c; });
    const getChain = (catId: string | null) => {
      if (!catId || !byId[catId]) return { l1: null as any, l2: null as any, l3: null as any };
      const cat = byId[catId];
      const pid = cat.parent_id ?? null;
      if (!pid) return { l1: cat, l2: null, l3: null };
      const parent = byId[pid];
      if (!parent) return { l1: null, l2: null, l3: cat };
      const gpid = parent.parent_id ?? null;
      if (!gpid) return { l1: parent, l2: cat, l3: null };
      const gp = byId[gpid];
      return { l1: gp || null, l2: parent, l3: cat };
    };

    type Item = { id: string; description: string; amount: number; viaMaster?: boolean };
    type L3G = { code: string; name: string; items: Item[]; total: number };
    type L2G = { code: string; name: string; l3Groups: L3G[]; total: number };
    type L1G = { code: string; name: string; l2Groups: L2G[]; total: number };

    const l1Map: Record<string, L1G> = {};
    bpExpenses.forEach((f: any) => {
      const chain = getChain(f.category_id);
      const l1Name = chain.l1?.name ?? "Sem Grupo";
      const l1Code = chain.l1?.code ?? "Z";
      const l2Name = chain.l2?.name ?? chain.l1?.name ?? "Geral";
      const l2Code = chain.l2?.code ?? chain.l1?.code ?? "Z.Z";
      const l3Name = chain.l3?.name ?? chain.l2?.name ?? chain.l1?.name ?? (f.description || "—");
      const l3Code = chain.l3?.code ?? chain.l2?.code ?? chain.l1?.code ?? "";
      const grossAmount = calcTotalWithIva(Number(f.amount || 0), Number(f.iva_rate || 0));
      if (!l1Map[l1Name]) l1Map[l1Name] = { code: l1Code, name: l1Name, l2Groups: [], total: 0 };
      let l2 = l1Map[l1Name].l2Groups.find((g) => g.name === l2Name);
      if (!l2) { l2 = { code: l2Code, name: l2Name, l3Groups: [], total: 0 }; l1Map[l1Name].l2Groups.push(l2); }
      let l3 = l2.l3Groups.find((g) => g.name === l3Name);
      if (!l3) { l3 = { code: l3Code, name: l3Name, items: [], total: 0 }; l2.l3Groups.push(l3); }
      l3.items.push({ id: f.id, description: f.description || "—", amount: grossAmount, viaMaster: !!f._viaMaster });
      l3.total += grossAmount;
      l2.total += grossAmount;
      l1Map[l1Name].total += grossAmount;
    });

    return Object.values(l1Map)
      .map((g) => ({
        ...g,
        l2Groups: g.l2Groups
          .map((l2) => ({ ...l2, l3Groups: l2.l3Groups.sort((a, b) => compareHierarchicalCodes(a.code, b.code)) }))
          .sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
      }))
      .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
  }, [bpExpenses, allCategories]);

  const bpTotalExpense = useMemo(
    () => bpGroupedHier.reduce((s, g) => s + g.total, 0),
    [bpGroupedHier],
  );

  const handleExportBPPdf = async () => {
    if (!event) return;
    try {
      await exportPartnerBPPdf({
        eventName: event.name,
        eventDate: event.date ?? null,
        eventLocation: (event as any).location ?? null,
        cityLabel: (event as any).cities?.name ?? null,
        bpVersionLabel,
        bpVersionDescription: activeBPVersion?.description ?? null,
        groups: bpGroupedHier as any,
        totalExpense: bpTotalExpense,
      });
    } catch (err: any) {
      toast.error("Erro ao exportar PDF", { description: err?.message });
    }
  };


  if (isLoading || isLoadingAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return <div className="p-8 text-center text-muted-foreground">Evento não encontrado.</div>;
  }

  const hasAccess = hasParentAccess || visibleSubEvents.length > 0;
  if (!hasAccess) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-muted-foreground">Não tem autorização para ver este evento.</p>
        <Link to="/parceiro" className="text-sm text-primary hover:underline">Voltar ao portal</Link>
      </div>
    );
  }

  const EventTypeIcon = eventType === "festival" ? Layers : eventType === "multi_day" ? Route : Calendar;

  // ─── Ticket calculations (use filtered zones/sales) ───
  const salesByZone: Record<string, { qty: number; revenue: number }> = {};
  filteredSales.forEach((s: any) => {
    if (!salesByZone[s.zone_id]) salesByZone[s.zone_id] = { qty: 0, revenue: 0 };
    salesByZone[s.zone_id].qty += s.quantity;
    salesByZone[s.zone_id].revenue += s.quantity * Number(s.unit_price);
  });

  const totalCapacity = filteredZones.reduce((s: number, z: any) => s + (z.total_capacity || 0), 0);
  const totalLotQty = filteredZones.reduce((s: number, z: any) => s + (z.event_ticket_lots || []).reduce((ls: number, l: any) => ls + l.quantity, 0), 0);
  const totalLotRevenue = filteredZones.reduce((s: number, z: any) => s + (z.event_ticket_lots || []).reduce((ls: number, l: any) => ls + l.quantity * Number(l.price), 0), 0);
  const totalSoldQty = Object.values(salesByZone).reduce((s, v) => s + v.qty, 0);
  const totalSoldRevenue = Object.values(salesByZone).reduce((s, v) => s + v.revenue, 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((totalSoldQty / totalCapacity) * 100) : 0;

  // ─── Receita líquida de bilheteira (unit_price é c/IVA → extrair pela iva_rate do lote) ───
  const lotIvaById: Record<string, number> = {};
  ticketZones.forEach((z: any) => {
    (z.event_ticket_lots || []).forEach((l: any) => {
      lotIvaById[l.id] = Number(l.iva_rate ?? 6);
    });
  });
  const ticketRevenueNet = ticketSales.reduce((s: number, sale: any) => {
    const gross = sale.quantity * Number(sale.unit_price);
    const iva = lotIvaById[sale.lot_id] ?? 6;
    return s + gross / (1 + iva / 100);
  }, 0);

  // ─── Cards (vista do sócio / Brasil) ───
  // Receitas: NET (alinhado com getPartnerRevenueBase). Despesas: BRUTO c/IVA
  // (alinhado com calcBasis Brasil em buildPartnerSettlementReportData).
  const transactionIncomeOnly = transactions
    .filter((t: any) => t.type === "income")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const transactionIncome = transactionIncomeOnly + ticketRevenueNet;
  const transactionsExpenseGross = transactions
    .filter((t: any) => t.type === "expense")
    .reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate || 0)), 0);
  const overheadExpenseGross = overheads
    .reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount || 0), Number(o.iva_rate || 0)), 0);
  const transactionExpense = transactionsExpenseGross + overheadExpenseGross;
  const transactionResult = transactionIncome - transactionExpense;
  // "Pago" = paid_amount já é bruto (com IVA) por convenção; somar direto.
  const paidExpenses = transactions
    .filter((t: any) => t.type === "expense")
    .reduce((s: number, t: any) => s + Number(t.paid_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/parceiro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar ao portal
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{event.name}</h1>
          <EventStatusBadge status={event.status} />
          <Badge variant="outline" className="gap-1 text-[10px]">
            <EventTypeIcon className="h-3 w-3" />
            {eventTypeLabels[eventType]}
          </Badge>
        </div>
        {event.location && <p className="text-sm text-muted-foreground mt-1">{event.location} · {formatDate(event.date)}</p>}
      </div>

      {/* Sub-event selector for multi-day — Master + cidades */}
      {eventType === "multi_day" && visibleSubEvents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cidades / Datas</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedSubEvent(id!); setSelectedSession(null); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  (selectedSubEvent || defaultMultiDayId) === id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Master (Total)
              </button>
              {visibleSubEvents.map((sub: any) => (
                <button
                  key={sub.id}
                  onClick={() => { setSelectedSubEvent(sub.id); setSelectedSession(null); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    (selectedSubEvent || defaultMultiDayId) === sub.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sub.name} ({formatDate(sub.date)})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons (top-right) */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setAdvancesOpen(true)} disabled={!activeEventId}>
          <TrendingDown className="mr-1.5 h-4 w-4" /> Extras Sócios
          {partnerAdvances.length > 0 && (
            <Badge variant="secondary" className="ml-2">{partnerAdvances.length}</Badge>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPaidByPartnerOpen(true)} disabled={!activeEventId}>
          <TrendingUp className="mr-1.5 h-4 w-4" /> Despesas Pagas pelo Sócio
          {partnerPaidExpenses.length > 0 && (
            <Badge variant="secondary" className="ml-2">{partnerPaidExpenses.length}</Badge>
          )}
        </Button>
        {hasPermission("view_report_dre") && (
          <Button size="sm" onClick={() => setDreOpen(true)} disabled={!activeEventId}>
            <FileText className="mr-1.5 h-4 w-4" /> DRE
          </Button>
        )}
      </div>

      {/* Em vista Master só mostramos os cards (sem tabs nem listas detalhadas) */}
      {isMasterView ? (
        <div className="space-y-4">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mb-2 text-center">Total do Evento</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receitas</p>
                  <p className="text-[11px] sm:text-xl font-bold font-mono text-emerald-500 truncate">{formatCurrency(transactionIncome)}</p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Despesas</p>
                  <p className="text-[11px] sm:text-xl font-bold font-mono text-amber-500 truncate">{formatCurrency(transactionExpense)}</p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                  <p className={`text-[11px] sm:text-xl font-bold font-mono truncate ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {formatCurrency(transactionResult)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {perCityBreakdown.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por Cidade</p>
              {perCityBreakdown.map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-xs font-semibold mb-2">{c.name}</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receitas</p>
                        <p className="text-[11px] sm:text-base font-bold font-mono text-emerald-500 truncate">{formatCurrency(c.income)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Despesas</p>
                        <p className="text-[11px] sm:text-base font-bold font-mono text-amber-500 truncate">{formatCurrency(c.expense)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                        <p className={`text-[11px] sm:text-base font-bold font-mono truncate ${c.result >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                          {formatCurrency(c.result)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
      <Tabs defaultValue={(() => {
        const want = defaultTabForActive(activeEventId!);
        // fallback se a aba escolhida não estiver acessível
        if (want === "bp" && hasPermission("view_bp")) return "bp";
        if (want === "transactions" && hasPermission("view_partner_transactions")) return "transactions";
        if (want === "tickets") return "ticketing";
        if (hasPermission("view_bp")) return "bp";
        return "ticketing";
      })()} className="space-y-4">
        <TabsList className="w-full">
          {hasPermission("view_bp") && (
            <TabsTrigger value="bp" className="gap-1.5 flex-1"><ClipboardList className="h-3.5 w-3.5" /> BP</TabsTrigger>
          )}
          <TabsTrigger value="ticketing" className="gap-1.5 flex-1"><Ticket className="h-3.5 w-3.5" /> Bilhetes</TabsTrigger>
          {hasPermission("view_partner_transactions") && (
            <TabsTrigger value="transactions" className="gap-1.5 flex-1"><TrendingDown className="h-3.5 w-3.5" /> Transações</TabsTrigger>
          )}
        </TabsList>

        {/* ═══════ BP DE CUSTOS (planeado, agrupado L1>L2>L3) ═══════ */}
        {hasPermission("view_bp") && (
        <TabsContent value="bp">
          {/* Cabeçalho aba BP: versão + botão Exportar PDF */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {bpVersionLabel ? (
                <>
                  <History className="h-3.5 w-3.5" />
                  <span className="font-medium">{bpVersionLabel}</span>
                  {activeBPVersion?.description && (
                    <span className="italic opacity-80">— {activeBPVersion.description}</span>
                  )}
                </>
              ) : (
                <span className="italic opacity-70">Sem versão ativa registada</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {bpGroupedHier.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportBPPdf}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar PDF
                </Button>
              )}
              {canEditBpHere && (
                <div className="inline-flex rounded-md border border-border/60 bg-background/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setBpViewMode("grouped")}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                      bpViewMode === "grouped"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                    Agrupada
                  </button>
                  <button
                    type="button"
                    onClick={() => setBpViewMode("grid")}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                      bpViewMode === "grid"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Editor em grelha — edição em massa"
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    Grelha
                  </button>
                </div>
              )}
            </div>
          </div>


          {canEditBpHere && bpViewMode === "grid" ? (
            <BPGridEditor
              eventId={activeEventId!}
              forecasts={bpGridForecasts}
              categories={allCategories as any}
              canEditBP={true}
              selectedVersionId={bpActiveVersionId ?? null}
            />
          ) : bpGroupedHier.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem previsões de custos aprovadas para este evento.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-bold">Total previsto (despesas, c/IVA)</span>
                  <span className="text-lg font-bold font-mono text-amber-500">{formatCurrency(bpTotalExpense)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-0 px-4 pt-4">
                  <CardTitle className="text-sm text-amber-500 flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Business Plan — Custos</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {bpGroupedHier.map((l1) => (
                    <div key={l1.name} className="mb-2">
                      <div className="bg-muted/40 px-4 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">{l1.code} · {l1.name}</span>
                        <span className="text-[11px] font-bold font-mono text-amber-500">{formatCurrency(l1.total)}</span>
                      </div>
                      {l1.l2Groups.map((l2) => (
                        <div key={l2.name}>
                          <div className="bg-muted/20 px-4 pl-8 py-1 flex items-center justify-between border-b border-border/40">
                            <span className="text-[10px] font-semibold text-muted-foreground">{l2.code} · {l2.name}</span>
                            <span className="text-[10px] font-semibold font-mono text-amber-500">{formatCurrency(l2.total)}</span>
                          </div>
                          {l2.l3Groups.map((l3) => (
                            <div key={l3.name}>
                              <div className="px-4 pl-12 py-1 flex items-center justify-between border-b border-border/20 bg-muted/5">
                                <span className="text-[10px] font-medium text-foreground/80">{l3.code} · {l3.name}</span>
                                <span className="text-[10px] font-medium font-mono text-amber-500">{formatCurrency(l3.total)}</span>
                              </div>
                              {l3.items.map((it) => {
                                const atts = bpAttachmentsByForecast[it.id] ?? [];
                                return (
                                  <div key={it.id} className="flex items-center justify-between px-4 pl-16 py-1.5 border-b border-border/15 gap-2">
                                    <span className="text-xs truncate flex-1">{it.description}</span>
                                    {atts.length > 0 && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-1 rounded p-1 text-primary hover:bg-primary/10 transition-colors"
                                            title={`${atts.length} anexo(s)`}
                                          >
                                            <Paperclip className="h-3.5 w-3.5" />
                                            <span className="text-[10px] font-semibold">{atts.length}</span>
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent side="left" align="end" className="w-72 p-2">
                                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            Anexos ({atts.length})
                                          </p>
                                          <div className="space-y-1 max-h-60 overflow-y-auto">
                                            {atts.map((a) => (
                                              <button
                                                key={a.document_id}
                                                type="button"
                                                onClick={() => openBpAttachment(a.kind, a.document_id)}
                                                className="flex items-center gap-2 w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                              >
                                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                <span className="truncate flex-1">{a.file_name}</span>
                                              </button>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                    <span className="text-xs font-mono font-semibold whitespace-nowrap text-amber-500">{formatCurrency(it.amount)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        )}



        {/* ═══════ BILHETES ═══════ */}
        <TabsContent value="ticketing">
          {ticketZones.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem bilheteira configurada para este evento.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Session filter tabs */}
              {sessions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedSession(null)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      !selectedSession ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Todas
                  </button>
                  {sessions.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSession(s.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedSession === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}{s.start_time ? ` (${s.start_time.slice(0, 5)})` : ""}
                    </button>
                  ))}
                </div>
              )}

              {/* Última importação/sincronização de vendas */}
              <div className="flex justify-end text-[10px] text-muted-foreground">
                {lastSaleAt
                  ? <span>Vendas atualizadas até {new Date(lastSaleAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</span>
                  : <span className="italic opacity-70">Sem vendas importadas</span>
                }
              </div>

              {/* Summary cards - responsive text */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Capacidade</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono">{totalCapacity.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vendidos</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono text-emerald-500">{totalSoldQty.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receita Real</p>
                    <p className="text-sm sm:text-xl font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ocupação</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono">{occupancyPct}%</p>
                    <Progress value={occupancyPct} className="h-1.5 mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Per-zone detail */}
              {filteredZones.length === 0 && selectedSession ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">Sem zonas configuradas para esta sessão.</p>
                </Card>
              ) : filteredZones.map((zone: any) => {
                const lots = zone.event_ticket_lots || [];
                const zoneSales = salesByZone[zone.id] || { qty: 0, revenue: 0 };
                const zoneCapacity = zone.total_capacity || 0;
                const zonePlannedRevenue = lots.reduce((s: number, l: any) => s + l.quantity * Number(l.price), 0);
                const zonePlannedQty = lots.reduce((s: number, l: any) => s + l.quantity, 0);
                const zoneOccupancy = zoneCapacity > 0 ? Math.round((zoneSales.qty / zoneCapacity) * 100) : 0;

                return (
                  <Card key={zone.id}>
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm font-semibold">{zone.name}</CardTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{zoneCapacity} lug.</span>
                          <Badge variant={zoneOccupancy >= 80 ? "default" : "secondary"} className="text-[10px]">{zoneOccupancy}%</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {lots.length > 0 && (
                        <div className="mb-3 overflow-x-auto">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Planeamento (Lotes)</p>
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[10px]">
                                <TableHead className="h-8 px-2">Lote</TableHead>
                                <TableHead className="h-8 px-2 text-right">Qtd</TableHead>
                                <TableHead className="h-8 px-2 text-right">Preço</TableHead>
                                <TableHead className="h-8 px-2 text-right hidden sm:table-cell">IVA</TableHead>
                                <TableHead className="h-8 px-2 text-right">Subtotal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lots.map((lot: any) => (
                                <TableRow key={lot.id}>
                                  <TableCell className="py-1.5 px-2 text-xs">{lot.name}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{lot.quantity}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{formatCurrency(Number(lot.price))}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs hidden sm:table-cell">{lot.iva_rate}%</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs font-semibold">{formatCurrency(Number(lot.price) * lot.quantity)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="text-xs bg-muted/30">
                                <TableCell className="py-1.5 px-2 font-semibold">Total</TableCell>
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{zonePlannedQty}</TableCell>
                                <TableCell className="py-1.5 px-2" />
                                <TableCell className="py-1.5 px-2 hidden sm:table-cell" />
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{formatCurrency(zonePlannedRevenue)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      )}

                      {/* Real sales */}
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Vendas Reais</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Vendidos</p>
                            <p className="text-sm sm:text-lg font-bold font-mono text-emerald-500">{zoneSales.qty.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Receita</p>
                            <p className="text-sm sm:text-lg font-bold font-mono text-emerald-500">{formatCurrency(zoneSales.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">vs. Plan</p>
                            <p className={`text-sm sm:text-lg font-bold font-mono ${zoneSales.revenue >= zonePlannedRevenue ? "text-emerald-500" : "text-amber-500"}`}>
                              {zonePlannedRevenue > 0 ? `${Math.round((zoneSales.revenue / zonePlannedRevenue) * 100)}%` : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Grand total */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Planeado</p>
                      <p className="text-xs font-mono">{totalLotQty.toLocaleString()} bilhetes</p>
                      <p className="text-sm sm:text-base font-bold font-mono">{formatCurrency(totalLotRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Vendido</p>
                      <p className="text-xs font-mono">{totalSoldQty.toLocaleString()} bilhetes</p>
                      <p className="text-sm sm:text-base font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diferença</p>
                      <p className={`text-sm sm:text-base font-bold font-mono ${totalSoldRevenue - totalLotRevenue >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(totalSoldRevenue - totalLotRevenue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Execução</p>
                      <p className="text-sm sm:text-base font-bold font-mono">
                        {totalLotRevenue > 0 ? `${Math.round((totalSoldRevenue / totalLotRevenue) * 100)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════ TRANSAÇÕES (com overheads embutidos) ═══════ */}
        {hasPermission("view_partner_transactions") && (
        <TabsContent value="transactions">
          {transactions.length === 0 && overheads.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem transações registadas.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Cards Receitas / Despesas / Resultado (vista cidade ou evento simples) */}
              <div className="grid gap-2 sm:gap-3 grid-cols-3">
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receitas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-emerald-500 truncate">{formatCurrency(transactionIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Despesas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-amber-500 truncate">{formatCurrency(transactionExpense)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                    <p className={`text-[11px] sm:text-xl font-bold font-mono truncate ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(transactionResult)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {(["income", "expense"] as const).map((kind) => {
                const groups = txGroupedHier[kind];
                if (groups.length === 0) return null;
                const colorClass = kind === "income" ? "text-emerald-500" : "text-amber-500";
                const sign = kind === "income" ? "+" : "-";
                const Icon = kind === "income" ? TrendingUp : TrendingDown;
                const title = kind === "income" ? "Receitas" : "Despesas";
                return (
                  <Card key={kind}>
                    <CardHeader className="pb-0 px-4 pt-4">
                      <CardTitle className={`text-sm ${colorClass} flex items-center gap-1.5`}><Icon className="h-4 w-4" /> {title}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                      {groups.map((l1) => (
                        <div key={l1.name} className="mb-2">
                          {/* L1 — Grupo */}
                          <div className="bg-muted/40 px-4 py-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">{l1.code} · {l1.name}</span>
                            <span className={`text-[11px] font-bold font-mono ${colorClass}`}>{formatCurrency(l1.total)}</span>
                          </div>
                          {l1.l2Groups.map((l2) => (
                            <div key={l2.name}>
                              {/* L2 — Sub-grupo (indentado) */}
                              <div className="bg-muted/20 px-4 pl-8 py-1 flex items-center justify-between border-b border-border/40">
                                <span className="text-[10px] font-semibold text-muted-foreground">{l2.code} · {l2.name}</span>
                                <span className={`text-[10px] font-semibold font-mono ${colorClass}`}>{formatCurrency(l2.total)}</span>
                              </div>
                              {l2.l3Groups.map((l3) => (
                                <div key={l3.name}>
                                  {/* L3 — Conta (mais indentada) */}
                                  <div className="px-4 pl-12 py-1 flex items-center justify-between border-b border-border/20 bg-muted/5">
                                    <span className="text-[10px] font-medium text-foreground/80">{l3.code} · {l3.name}</span>
                                    <span className={`text-[10px] font-medium font-mono ${colorClass}`}>{formatCurrency(l3.total)}</span>
                                  </div>
                                  {/* Itens — ainda mais indentados */}
                                  {l3.items.map((t) => (
                                    <div key={t.id} className="flex items-center justify-between px-4 pl-16 py-1.5 border-b border-border/15 gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs truncate">{t.description || "—"}</span>
                                        </div>
                                        {t.date && <span className="text-[10px] text-muted-foreground">{formatDate(t.date)}</span>}
                                        {hasPermission("view_partner_documents") && t.docs.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {t.docs.map((d: any) => (
                                              <button
                                                key={d.id}
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDoc(d.file_url); }}
                                                className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline"
                                              >
                                                <Paperclip className="h-2.5 w-2.5" />{d.name}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <span className={`text-xs font-mono font-semibold whitespace-nowrap ${colorClass}`}>
                                        {sign}{formatCurrency(t.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Result */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-bold">Resultado</span>
                  <span className={`text-lg font-bold font-mono ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {formatCurrency(transactionResult)}
                  </span>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>
      )}

      {/* DRE Dialog — para turnê, passa sempre o Master para consolidar todas as cidades + resumo */}
      {(() => {
        const dreEventId = eventType === "multi_day" ? id! : (parentEventId || activeEventId);
        return dreEventId ? (
          <PartnerDREDialog
            open={dreOpen}
            onOpenChange={setDreOpen}
            eventId={dreEventId}
            eventName={event.name}
          />
        ) : null;
      })()}


      {/* Extras Sócios Dialog */}
      <Dialog open={advancesOpen} onOpenChange={setAdvancesOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extras Sócios — Despesas pagas pela empresa</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Despesas pagas pela empresa em nome do sócio. São abatidas do payout no fecho do evento.
          </p>
          {partnerAdvances.length === 0 ? (
            <Card className="p-6 text-center mt-3">
              <p className="text-sm text-muted-foreground">Sem registos de Extras Sócios para este evento.</p>
            </Card>
          ) : (
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    {isMasterView && <TableHead>Cidade</TableHead>}
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(partnerAdvances as any[]).map((a) => {
                    const total = calcTotalWithIva(Number(a.transactions?.amount || 0), Number(a.transactions?.iva_rate || 0));
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{a.transactions?.date ? formatDate(a.transactions.date) : "—"}</TableCell>
                        {isMasterView && <TableCell className="text-xs">{eventNameById[a.event_id] || "—"}</TableCell>}
                        <TableCell className="text-xs">
                          {a.transactions?.description || "—"}
                          {a.notes && <span className="block text-muted-foreground">{a.notes}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-500">{formatCurrency(total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={isMasterView ? 3 : 2} className="font-semibold">Total a abater do payout</TableCell>
                    <TableCell className="text-right font-mono font-bold text-amber-500">{formatCurrency(totalAdvances)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Despesas Pagas pelo Sócio Dialog */}
      <Dialog open={paidByPartnerOpen} onOpenChange={setPaidByPartnerOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Despesas Pagas pelo Sócio</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Despesas do evento pagas diretamente pelo sócio. São somadas ao payout no fecho.
          </p>
          {partnerPaidExpenses.length === 0 ? (
            <Card className="p-6 text-center mt-3">
              <p className="text-sm text-muted-foreground">Sem despesas pagas pelo sócio para este evento.</p>
            </Card>
          ) : (
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    {isMasterView && <TableHead>Cidade</TableHead>}
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(partnerPaidExpenses as any[]).map((a) => {
                    const total = calcTotalWithIva(Number(a.transactions?.amount || 0), Number(a.transactions?.iva_rate || 0));
                    const dateVal = a.paid_date || a.transactions?.date;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{dateVal ? formatDate(dateVal) : "—"}</TableCell>
                        {isMasterView && <TableCell className="text-xs">{eventNameById[a.event_id] || "—"}</TableCell>}
                        <TableCell className="text-xs">
                          {a.transactions?.description || "—"}
                          {a.notes && <span className="block text-muted-foreground">{a.notes}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-500">{formatCurrency(total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={isMasterView ? 3 : 2} className="font-semibold">Total a somar ao payout</TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-500">{formatCurrency(totalPaidByPartner)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

