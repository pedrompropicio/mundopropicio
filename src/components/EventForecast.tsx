import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense, lazy } from "react";
import { roundCents, calcIvaAmount } from "@/lib/iva";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { moveToTrash } from "@/lib/trash";
import { deleteTransactionCascade } from "@/lib/delete-transaction-cascade";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, TrendingUp, TrendingDown, BarChart3, Trash2, CheckCircle2, Clock, Link2, Check, X, Ticket, Music, Copy, Layers, History, Upload, ChevronDown, ChevronRight, Pencil, Search, Users, UserPlus, Filter, FileText, ArrowDownRight, ArrowUpRight, AlertTriangle, FileArchive, Paperclip, Sparkles, CalendarPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ForecastEditModal } from "@/components/ForecastEditModal";
import BPNotesAttachmentsModal from "@/components/BPNotesAttachmentsModal";
import BPGridEditor from "@/components/BPGridEditor";
// Lazy: a Planilha (Handsontable) só carrega quando o utilizador escolhe a vista.
const BPPlanilha = lazy(() => import("@/pages/admin/BPPlanilha"));
import { Table2, LayoutList, FileSpreadsheet } from "lucide-react";

import { StickyNote, UserCog } from "lucide-react";
import { BPVersionCard } from "@/components/bp-versions/BPVersionCard";
import { BPScenarioSelector } from "@/components/bp-versions/BPScenarioSelector";
import { useEventScenario } from "@/contexts/EventScenarioContext";
import { CurrencyBadge } from "@/components/CurrencyBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction, type CachePLLine } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes, sortByHierarchicalCode } from "@/lib/utils";
import { scoreDescriptionMatch, findCategoryOrphanTransactions, findMatchingTransactionsForForecast } from "@/lib/bp-tx-matching";
import {
  ORDERING_FILTER_ALL,
  ORDERING_FILTER_HOUSE,
  ORDERING_HOUSE_LABEL,
  buildInheritedOrdererMap,
  effectiveTransactionOrderer,
  matchesOrderingPartnerFilter,
} from "@/lib/ordering-partner";
import { OrderingPartnerBadge } from "@/components/bp/OrderingPartnerBadge";
import { CopyPLModal } from "@/components/CopyPLModal";
import { attachLinksFromXlsx } from "@/lib/import-pl-xlsx";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { useSyncCacheForecasts } from "@/hooks/useSyncCacheForecasts";
import { AdoptForecastsModal } from "@/components/AdoptForecastsModal";
import { OrphanTransactionsModal } from "@/components/OrphanTransactionsModal";
import { exportEventBPToPDF } from "@/lib/export-event-bp-pdf";
import HelpTooltip from "@/components/HelpTooltip";

import BPImportModeDialog, { type BPImportMode } from "@/components/BPImportModeDialog";
import PromoteToMasterModal, { type PromoteCandidate } from "@/components/PromoteToMasterModal";
import OrphanAttachmentsResolver from "@/components/OrphanAttachmentsResolver";
import { GenerateHistoricalModal, type XlsxRowForGeneration } from "@/components/GenerateHistoricalModal";
import { ScheduleInstallmentsModal, type Installment } from "@/components/ScheduleInstallmentsModal";
import { MarkAsFechadoDialog } from "@/components/bp-versions/MarkAsFechadoDialog";
// SponsorsImportModal removido — substituído pelo Pipeline de Patrocínios
import { FormalidadeHistoryPopover } from "@/components/bp-versions/FormalidadeHistoryPopover";
import { FormalidadeBadge } from "@/components/bp-versions/FormalidadeBadge";
import { BulkFormalidadePopover } from "@/components/bp-versions/BulkFormalidadePopover";
import { CoalaImportWizard } from "@/components/CoalaImportWizard";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";

/**
 * Returns the subset of forecast IDs that are eligible to be auto-promoted to
 * formalidade "fechado" — only rows currently in `estimado` or `negociacao`.
 * Per project rule we never silently flip rows already in more advanced states
 * (fechado / pago_parcial / pago_total).
 */
function pickFormalidadePromotableIds(items: any[]): string[] {
  return items
    .filter((f) => {
      const formal = f?.formalidade ?? "estimado";
      return formal === "estimado" || formal === "negociacao";
    })
    .map((f) => f.id);
}

function TransactionAttachmentButton({ transactionId, onClick }: { transactionId: string; onClick: () => void }) {
  const { data: docs = [] } = useQuery({
    queryKey: ["transaction_documents_summary", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("id, file_url")
        .eq("transaction_id", transactionId);
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const isExternalLink = (url: string) => /^ref:\/\/https?:\/\//i.test(url);
  const isPendingRef = (url: string) => url.startsWith("ref://") && !isExternalLink(url);
  const pendingRefs = docs.filter((d: any) => isPendingRef(d.file_url));
  const validDocs = docs.filter((d: any) => !isPendingRef(d.file_url));
  const count = validDocs.length;
  const hasPending = pendingRefs.length > 0 && count === 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      title="Gerir anexos desta transação"
    >
      <Paperclip className="h-3 w-3" />
      Anexos
      {count > 0 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-success/20 px-1 text-[10px] font-semibold text-success">
          {count > 9 ? "9+" : count}
        </span>
      )}
      {hasPending && (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-[10px] font-bold text-warning">!</span>
      )}
    </button>
  );
}

interface InlineForm {
  type: string;
  description: string;
  amount: string;
  iva_rate: string;
  category_id: string;
  notes: string;
  specification: string;
  is_overhead: boolean;
}

const emptyInline: InlineForm = {
  type: "expense",
  description: "",
  amount: "",
  iva_rate: "23",
  category_id: "",
  notes: "",
  specification: "",
  is_overhead: false,
};

interface Props {
  eventId: string;
  eventDate: string;
  eventName?: string;
  childEventIds?: string[];
  expenseOnly?: boolean;
  parentEventId?: string;
  eventStatus?: string;
  /**
   * When true, all editing/approval/deletion controls are hidden regardless
   * of the user's role. Used by the BP shortcut inside Transactions, where
   * the modal is meant for consultation only (admins included).
   */
  forceReadOnly?: boolean;
}

export function EventForecast({ eventId, eventDate, eventName, childEventIds, expenseOnly, parentEventId, eventStatus, forceReadOnly }: Props) {
  // Taxas de IVA do país da cidade do evento (PT por defeito).
  const { rates: ivaRates } = useEventIvaCountry(eventId);
  const navigate = useNavigate();
  const [addingType, setAddingType] = useState<"income" | "expense" | null>(null);
  const [inlineForm, setInlineForm] = useState<InlineForm>(emptyInline);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingFechado, setPendingFechado] = useState<{ ids: string[]; trigger: string } | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [editApprovedForecast, setEditApprovedForecast] = useState<any>(null);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const [bpSearch, setBpSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState<string>("all"); // "all" | "company" | partner_id
  const [txLinkFilter, setTxLinkFilter] = useState<string>("all"); // "all" | "with_tx" | "without_tx"
  // Filtra a vista do BP por estado de formalidade comercial. "all" mostra tudo;
  // os outros valores correspondem 1:1 ao enum `bp_formalidade`.
  const [formalidadeFilter, setFormalidadeFilter] = useState<string>("all");
  // Ordenador da despesa: "all" | "house" (MP/comum, sem ordenador) | event_partners.id
  const [orderingFilter, setOrderingFilter] = useState<string>(ORDERING_FILTER_ALL);
  // Tipo: "all" | "income" | "expense" — controla se mostramos só Receitas, só Despesas ou Ambos
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [includeSubsInBP, setIncludeSubsInBP] = useState<boolean>(false); // master view: hide sub-event lines by default
  const [includeOverheadInComparison, setIncludeOverheadInComparison] = useState<boolean>(false); // Previsão vs Real: incluir linhas is_overhead
  const [adoptTarget, setAdoptTarget] = useState<{ id: string; description: string; category_id: string | null; type: string } | null>(null);
  const [showAdoptCreate, setShowAdoptCreate] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linksFileInputRef = useRef<HTMLInputElement>(null);
  const [attachingLinks, setAttachingLinks] = useState(false);
  
  const [showImportMode, setShowImportMode] = useState(false);
  const [pendingImportMode, setPendingImportMode] = useState<BPImportMode | null>(null);
  const [pendingImportInstructions, setPendingImportInstructions] = useState<string>("");
  const [comparisonDocumentsTransaction, setComparisonDocumentsTransaction] = useState<any | null>(null);
  const [promoteCandidates, setPromoteCandidates] = useState<PromoteCandidate[]>([]);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showOrphanResolver, setShowOrphanResolver] = useState(false);
  // (removido) showSponsorsImport — botão "Importar Patrocínios" foi para o Pipeline
  // Cenário ativo na vista (null = versão Ativa). Sincronizado entre BP/Bilheteira/Cachê
  // através do EventScenarioContext (provider em EventDetail).
  const { selectedVersionId, setSelectedVersionId, isScenarioMode } = useEventScenario();
  // Phase A.1: toggle entre vista Agrupada (atual), Grelha e Planilha (Handsontable).
  const [forecastsViewMode, setForecastsViewMode] = useState<"grouped" | "grid" | "sheet">("grouped");
  const isMobile = useIsMobile();
  // Planilha é desktop-only; se o ecrã encolher, volta para Agrupada.
  useEffect(() => {
    if (isMobile && forecastsViewMode === "sheet") {
      setForecastsViewMode("grouped");
    }
  }, [isMobile, forecastsViewMode]);



  const queryClient = useQueryClient();
  const { isAdmin: rawIsAdmin, isManager: rawIsManager, user, hasPermission } = useAuth();
  // forceReadOnly disables all admin/manager UI affordances so the same
  // component can render as a pure consultation view (used by BPViewerModal
  // inside Transactions). It does not change DB permissions — it only hides
  // edit/approve/delete actions in the UI.
  const isAdmin = forceReadOnly ? false : rawIsAdmin;
  const isManager = forceReadOnly ? false : rawIsManager;
  const isEventLocked = eventStatus === "completed";
  const canApprove = !forceReadOnly && (rawIsAdmin || rawIsManager) && !isEventLocked;
  const canEditBP = !forceReadOnly && (rawIsAdmin || rawIsManager) && !isEventLocked;
  const canDeleteBP = !forceReadOnly && rawIsAdmin; // Admin can delete BP lines regardless of event status
  const canEditApprovedBP = canEditBP; // Admin/Manager can always edit approved BP lines
  const isEditor = !forceReadOnly && !rawIsAdmin && !rawIsManager && hasPermission("manage_events");
  const canEditBPPartial = isEditor && !isEventLocked; // Editor can edit category + description only

  useEffect(() => {
    if ((addingType || editingId) && descRef.current) {
      descRef.current.focus();
    }
  }, [addingType, editingId]);

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return sortByHierarchicalCode(data ?? [], (category) => category.code);
    },
  });

  // Pending orphan attachment links waiting for manual resolution.
  const { data: pendingOrphansCount = 0 } = useQuery({
    queryKey: ["bp_orphan_attachments_count", eventId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bp_orphan_attachments")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!eventId,
  });

  // Detect Coala-template events to surface the dedicated importer wizard.
  const { data: eventMeta } = useQuery({
    queryKey: ["event_import_template", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("import_template")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });
  const isCoalaEvent = eventMeta?.import_template === "coala";
  const [showCoalaWizard, setShowCoalaWizard] = useState(false);

  const cacheCategoryId = useMemo(() => {
    // Procura a conta "Cachês" (despesa) por nome — robusto a renumerações do plano de contas.
    // Fallback: código histórico "2.1.01" para retro-compatibilidade.
    const expenses = (categories as any[]).filter((c) => c.type === "expense");
    const byName = expenses.find((c) => {
      const n = String(c.name ?? "").trim().toLowerCase();
      return n === "cachês" || n === "caches" || n === "cachê" || n === "cache";
    });
    const fallback = expenses.find((c) => c.code === "2.1.01");
    return byName?.id ?? fallback?.id ?? null;
  }, [categories]);

  const forecastEventIds = useMemo(() => {
    const ids = [eventId];
    // Only include sub-event forecasts when the user explicitly toggles "Master + Subs".
    // Default behaviour shows ONLY the master's own lines, preventing the visual mix
    // that made sub-event expenses look like they were duplicated in the Master BP.
    if (includeSubsInBP && childEventIds && childEventIds.length > 0) {
      ids.push(...childEventIds);
    }
    return Array.from(new Set(ids));
  }, [eventId, childEventIds, includeSubsInBP]);

  const { data: forecastsRaw = [], isLoading } = useQuery({
    queryKey: ["event_forecasts", eventId, forecastEventIds.join(","), includeSubsInBP, selectedVersionId ?? "active"],
    queryFn: async () => {
      let query = supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .in("event_id", forecastEventIds);
      if (selectedVersionId) {
        query = query.eq("version_id", selectedVersionId);
      } else {
        query = query.is("version_id", null);
      }
      const { data, error } = await query.order("type").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Overhead via Master: quando este evento é um Split, busca os overheads do Master e
  // adiciona uma fatia virtual (÷N splits) para esta cidade. Read-only, badge "via Master".
  const { data: masterOverheadSlice = [] } = useQuery({
    queryKey: ["bp_overhead_via_master", parentEventId, eventId],
    queryFn: async () => {
      if (!parentEventId) return [] as any[];
      // Conta splits do Master para calcular ÷N
      const { data: siblings, error: sErr } = await supabase
        .from("events")
        .select("id")
        .eq("parent_event_id", parentEventId);
      if (sErr) throw sErr;
      const n = (siblings ?? []).length || 1;
      const { data: oh, error: ohErr } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", parentEventId)
        .eq("is_overhead", true).is("version_id", null);
      if (ohErr) throw ohErr;
      return (oh ?? []).map((o: any) => ({
        ...o,
        id: `${o.id}::split::${eventId}`,
        event_id: eventId,
        amount: Number(o.amount) / n,
        formula_value: Number(o.amount) / n,
        _overhead_via_master: true,
        _master_event_id: parentEventId,
        _readonly: true,
      }));
    },
    enabled: !!parentEventId,
  });

  const forecasts = useMemo(
    () => [...(forecastsRaw as any[]), ...(masterOverheadSlice as any[])],
    [forecastsRaw, masterOverheadSlice],
  );

  // Fetch event partners (sócios) — for child events, fetch from parent
  const partnersSourceId = parentEventId || eventId;
  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event_partners_for_bp", partnersSourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("id, percentage, suppliers:supplier_id(name)")
        .eq("event_id", partnersSourceId);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        percentage: p.percentage,
        name: (p.suppliers as any)?.name ?? "Sócio",
      }));
    },
  });

  // Fetch forecast-partner assignments
  const { data: forecastPartners = [] } = useQuery({
    queryKey: ["forecast_partners", eventId],
    queryFn: async () => {
      const forecastIds = forecasts.map((f) => f.id);
      if (forecastIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecast_partners")
        .select("forecast_id, partner_id")
        .in("forecast_id", forecastIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: forecasts.length > 0,
  });

  // Fetch adopted sub-event forecasts (linked via master_forecast_id)
  const { data: adoptedForecasts = [] } = useQuery({
    queryKey: ["adopted_forecasts", eventId, childEventIds],
    queryFn: async () => {
      if (!childEventIds || childEventIds.length === 0) return [] as any[];
      const masterForecastIds = forecasts.map((f) => f.id);
      if (masterForecastIds.length === 0) return [] as any[];
      // master_forecast_id is a new column not yet in types, use filter
      const { data, error } = await (supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name)") as any)
        .in("master_forecast_id", masterForecastIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!childEventIds && childEventIds.length > 0 && forecasts.length > 0,
  });

  // Group adopted forecasts by master_forecast_id
  const adoptedByMaster = useMemo(() => {
    const map: Record<string, any[]> = {};
    adoptedForecasts.forEach((f: any) => {
      const mid = (f as any).master_forecast_id;
      if (mid) {
        if (!map[mid]) map[mid] = [];
        map[mid].push(f);
      }
    });
    return map;
  }, [adoptedForecasts]);

  const allRelevantEventIds = useMemo(() => {
    const ids = [eventId];
    if (childEventIds && childEventIds.length > 0) {
      ids.push(...childEventIds);
    }
    return ids;
  }, [eventId, childEventIds]);

  const { data: transactions = [] } = useQuery({
    queryKey: ["event_transactions_actual", eventId, childEventIds],
    queryFn: async () => {
      // Fetch transactions for the event and child events
      const { data: directTx, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name, type)")
        .in("event_id", allRelevantEventIds);
      if (error) throw error;

      // For sub-events, also fetch the Master transactions so projected/read-only
      // BP lines inherited from the Master can reflect the real liquidation state
      // (e.g. paid by partner on the Master). Matching remains scoped later so
      // child-native BP lines do not accidentally bind to Master transactions.
      if (parentEventId) {
        const { data: masterTx, error: masterError } = await supabase
          .from("transactions")
          .select("*, account_categories(code, name, type)")
          .eq("event_id", parentEventId);
        if (masterError) throw masterError;

        const existingIds = new Set((directTx ?? []).map((t: any) => t.id));
        const merged = [...(directTx ?? [])];
        for (const mt of (masterTx ?? [])) {
          if (!existingIds.has(mt.id)) merged.push(mt);
        }
        return merged;
      }

      // Also fetch multi-event parent transactions (event_id IS NULL)
      // that have child splits in our relevant events
      const childTxIds = (directTx ?? [])
        .filter((t: any) => t.parent_transaction_id)
        .map((t: any) => t.parent_transaction_id);
      
      if (childTxIds.length === 0) return directTx ?? [];

      const uniqueParentIds = [...new Set(childTxIds)];
      const { data: parentTx, error: parentError } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name, type)")
        .in("id", uniqueParentIds)
        .is("event_id", null);
      if (parentError) throw parentError;

      // Merge, avoiding duplicates
      const existingIds = new Set((directTx ?? []).map((t: any) => t.id));
      const merged = [...(directTx ?? [])];
      for (const pt of (parentTx ?? [])) {
        if (!existingIds.has(pt.id)) {
          merged.push(pt);
        }
      }
      return merged;
    },
  });

  // Count of native (non-link) transaction_documents per transaction_id, used to
  // render the 📎 badge on each BP row that has a linked transaction.
  const transactionIdsForDocs = useMemo(
    () => (transactions ?? []).map((t: any) => t.id).filter(Boolean) as string[],
    [transactions],
  );
  const { data: nativeDocCountByTx = {} } = useQuery({
    queryKey: ["bp_native_doc_counts", eventId, transactionIdsForDocs.sort().join(",")],
    queryFn: async () => {
      if (transactionIdsForDocs.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id, file_url")
        .in("transaction_id", transactionIdsForDocs);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const d of data ?? []) {
        const url = String((d as any).file_url ?? "");
        // External "ref://" links are tracked separately via attachment_refs.
        if (url.startsWith("ref://")) continue;
        const tid = (d as any).transaction_id as string;
        counts[tid] = (counts[tid] ?? 0) + 1;
      }
      return counts;
    },
    enabled: transactionIdsForDocs.length > 0,
  });

  // Fetch ticket zones and lots for auto-calculated ticket revenue
  const ticketEventIds = [eventId, ...(childEventIds || [])];
  // Include parentEventId for cache config lookup on sub-events
  const cacheEventIds = useMemo(() => {
    const ids = [...ticketEventIds];
    if (parentEventId && !ids.includes(parentEventId)) {
      ids.push(parentEventId);
    }
    return ids;
  }, [ticketEventIds, parentEventId]);
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["event_ticket_zones", eventId, childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("id").in("event_id", ticketEventIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["event_ticket_lots_for_pl", eventId],
    queryFn: async () => {
      const zoneIds = ticketZones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds);
      if (error) throw error;
      return data;
    },
    enabled: ticketZones.length > 0,
  });

  // Fetch ticket sales for actual revenue
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["event_ticket_sales_for_pl", eventId, childEventIds],
    queryFn: async () => {
      const lotIds = ticketLots.map((l) => l.id);
      if (lotIds.length === 0) return [];
      const { data, error } = await supabase.from("ticket_sales").select("*").in("lot_id", lotIds);
      if (error) throw error;
      return data;
    },
    enabled: ticketLots.length > 0,
  });

  // Fetch cache configs for this event and its child events (for consolidated BP)
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["event_cache_configs", cacheEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs")
        .select("*")
        .in("event_id", cacheEventIds)
        .order("created_at");
      if (error) throw error;
      return data as unknown as CacheConfig[];
    },
  });

  const cacheConfigIds = cacheConfigs.map((c) => c.id);
  const { data: cacheDeductions = [] } = useQuery({
    queryKey: ["event_cache_deductions", cacheConfigIds.join(",")],
    queryFn: async () => {
      if (cacheConfigIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions")
        .select("*")
        .in("cache_config_id", cacheConfigIds);
      if (error) throw error;
      return data as unknown as CacheDeduction[];
    },
    enabled: cacheConfigIds.length > 0,
  });

  // Fetch parent event's expense forecasts for proration display on sub-events.
  // Excludes is_overhead=true: overheads have their own dedicated slicing via
  // masterOverheadSlice (_overhead_via_master). Including them here would
  // duplicate the line in the split BP (one as _prorated, one as via Master).
  const { data: parentForecasts = [] } = useQuery({
    queryKey: ["parent_event_forecasts", parentEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", parentEventId!)
        .eq("type", "expense")
        .eq("is_overhead", false)
        .is("cache_config_id", null)
        .is("version_id", null)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!parentEventId,
  });

  const parentForecastIds = useMemo(
    () => parentForecasts.map((forecast: any) => forecast.id),
    [parentForecasts]
  );

  const { data: parentForecastPartners = [] } = useQuery({
    queryKey: ["parent_forecast_partners_for_bp", parentEventId, parentForecastIds.join(",")],
    queryFn: async () => {
      if (parentForecastIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecast_partners")
        .select("forecast_id, partner_id")
        .in("forecast_id", parentForecastIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!parentEventId && parentForecastIds.length > 0,
  });

  // Build a map: forecastId -> partner_ids[]
  const forecastPartnerMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    [...forecastPartners, ...parentForecastPartners].forEach((fp: any) => {
      if (!map[fp.forecast_id]) map[fp.forecast_id] = [];
      map[fp.forecast_id].push(fp.partner_id);
    });
    return map;
  }, [forecastPartners, parentForecastPartners]);

  // Fetch sibling sub-events for proration + tour cache sync
  const { data: siblingEvents = [] } = useQuery({
    queryKey: ["sibling_events", parentEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id")
        .eq("parent_event_id", parentEventId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!parentEventId,
  });

  const siblingCount = siblingEvents.length || 1;

  // Posição deste sub-evento dentro dos irmãos (ordenados por data crescente).
  // O último irmão absorve o cêntimo residual do rateio para garantir Σ sub = Master.
  const siblingIndex = useMemo(() => {
    if (!parentEventId || siblingEvents.length === 0) return 0;
    const idx = siblingEvents.findIndex((s: any) => s.id === eventId);
    return idx < 0 ? 0 : idx;
  }, [siblingEvents, parentEventId, eventId]);
  const isLastSibling = siblingCount > 0 && siblingIndex === siblingCount - 1;

  // Prorated parent expenses (amount / number of sub-events).
  // Distribuição com compensação: cada irmão fica com round(base/N, 2), mas o
  // último absorve o resíduo de cêntimo para fechar exatamente o total Master
  // (Σ sub = Master). Mantém IVA linha-a-linha (CIVA Art.º 18).
  const proratedParentExpenses = useMemo(() => {
    if (!parentEventId || parentForecasts.length === 0) return [];
    return parentForecasts.map((f: any) => {
      const original = Number(f.amount) || 0;
      const baseShare = roundCents(original / siblingCount);
      // Último irmão recebe o que falta para fechar o total (pode ser ±0,01€).
      const share = isLastSibling
        ? roundCents(original - baseShare * (siblingCount - 1))
        : baseShare;
      return {
        ...f,
        amount: share,
        _prorated: true,
        _master_event_id: parentEventId,
        _originalAmount: original,
        _siblingCount: siblingCount,
        _siblingIndex: siblingIndex,
        _isLastSibling: isLastSibling,
      };
    });
  }, [parentForecasts, siblingCount, parentEventId, isLastSibling, siblingIndex]);

  // Ticket revenue: price includes IVA ("por dentro"), extract net value for BP
  const ticketRevenueGross = ticketLots.reduce((s, l) => s + l.quantity * Number(l.price), 0);
  const ticketRevenueNet = ticketLots.reduce((s, l) => {
    const rate = Number((l as any).iva_rate ?? 6);
    return s + l.quantity * (Number(l.price) / (1 + rate / 100));
  }, 0);
  const ticketRevenueIva = ticketRevenueGross - ticketRevenueNet;
  const ticketRevenue = ticketRevenueNet; // BP uses net values

  const tourSyncEventId = useMemo(() => {
    if (childEventIds && childEventIds.length > 0) return eventId;
    if (parentEventId && siblingEvents.length > 0) return parentEventId;
    return null;
  }, [eventId, childEventIds, parentEventId, siblingEvents.length]);

  const tourSyncChildEventIds = useMemo(() => {
    if (childEventIds && childEventIds.length > 0) return childEventIds;
    if (parentEventId) return siblingEvents.map((event: any) => event.id);
    return [] as string[];
  }, [childEventIds, parentEventId, siblingEvents]);

  const tourCacheConfigs = useMemo(() => {
    if (!tourSyncEventId) return [] as CacheConfig[];
    return cacheConfigs.filter((config) => config.event_id === tourSyncEventId);
  }, [cacheConfigs, tourSyncEventId]);

  const tourCacheConfigIds = useMemo(
    () => new Set(tourCacheConfigs.map((config) => config.id)),
    [tourCacheConfigs]
  );

  const tourCacheDeductions = useMemo(() => {
    if (tourCacheConfigIds.size === 0) return [] as CacheDeduction[];
    return cacheDeductions.filter((deduction) => tourCacheConfigIds.has(deduction.cache_config_id));
  }, [cacheDeductions, tourCacheConfigIds]);

  const syncSourceForecasts = useMemo(() => {
    const source = tourSyncEventId === eventId ? forecasts : parentForecasts;
    return source.map((forecast: any) => ({
      id: forecast.id,
      type: forecast.type,
      category_id: forecast.category_id,
      amount: Number(forecast.amount),
      iva_rate: Number(forecast.iva_rate ?? 0),
      cache_config_id: forecast.cache_config_id ?? null,
    }));
  }, [tourSyncEventId, eventId, forecasts, parentForecasts]);

  useSyncCacheForecasts({
    eventId: tourSyncEventId ?? eventId,
    childEventIds: tourSyncChildEventIds.length > 0 ? tourSyncChildEventIds : undefined,
    cacheConfigs: tourCacheConfigs.map((config) => ({
      id: config.id,
      event_id: config.event_id,
      artist_name: config.artist_name,
      cache_type: config.cache_type,
      fixed_amount: Number(config.fixed_amount),
      percentage: Number(config.percentage),
      fixed_deduction_percentage: Number(config.fixed_deduction_percentage),
      cache_revenue_basis: config.cache_revenue_basis,
      cache_deduction_basis: (config as any).cache_deduction_basis,
      minimum_guaranteed: Number(config.minimum_guaranteed),
      is_finalized: !!config.is_finalized,
    })),
    deductions: tourCacheDeductions.map((deduction) => ({
      cache_config_id: deduction.cache_config_id,
      category_id: deduction.category_id,
    })),
    forecasts: syncSourceForecasts,
    ticketRevenueNet,
    ticketRevenueGross,
    cacheCategoryId,
    enabled: canEditBP && !!tourSyncEventId && tourSyncChildEventIds.length > 0 && tourCacheConfigs.length > 0,
  });

  // Cache forecasts are synced as real rows on sub-events and must never be prorated from the parent
  const allProratedParentExpenses = useMemo(
    () => [...proratedParentExpenses],
    [proratedParentExpenses]
  );

  // Actual ticket sales: unit_price also includes IVA, extract net
  const ticketActualRevenueGross = ticketSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
  const ticketActualRevenueNet = ticketSales.reduce((s: number, sl: any) => {
    // Find the lot to get its IVA rate
    const lot = ticketLots.find((l) => l.id === sl.lot_id);
    const rate = Number((lot as any)?.iva_rate ?? 6);
    return s + Number(sl.quantity) * (Number(sl.unit_price) / (1 + rate / 100));
  }, 0);
  const ticketActualRevenue = ticketActualRevenueNet;

  // Calculate cache lines using ALL configs (own + inherited from parent)
  // Each sub-event calculates with its own ticket revenue, not prorated
  const cacheLines = useMemo(() => {
    return calculateCacheLinesForPL(
      cacheConfigs,
      cacheDeductions,
      ticketRevenueNet,
      forecasts.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
      ticketRevenueGross
    );
  }, [cacheConfigs, cacheDeductions, ticketRevenueNet, ticketRevenueGross, forecasts]);

  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: InlineForm; id: string | null }) => {
      const isCompletedEvent = eventStatus === "completed";
      // Editor partial edit: only description + category
      if (id && canEditBPPartial && !canEditBP) {
        const partialPayload = {
          description: form.description,
          category_id: form.category_id || null,
        };
        const { error } = await supabase.from("event_forecasts").update(partialPayload).eq("id", id);
        if (error) throw error;
        return;
      }
      const payload: any = {
        event_id: eventId,
        type: form.type,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        iva_rate: form.iva_rate !== "" ? parseInt(form.iva_rate) : 23,
        category_id: form.category_id || null,
        notes: form.notes || null,
        specification: form.type === "expense" ? (form.specification || null) : null,
        // Overhead allocations: not part of company result; partner-side only
        is_overhead: form.type === "expense" ? !!form.is_overhead : false,
        exclude_from_result: form.type === "expense" ? !!form.is_overhead : false,
      };
      // Em modo cenário, novas linhas pertencem ao working_draft (não à Ativa)
      if (selectedVersionId) {
        payload.version_id = selectedVersionId;
      }
      // Auto-approve forecasts on completed (historical) events (apenas na Ativa)
      if (!id && isCompletedEvent && !selectedVersionId) {
        payload.status = "approved";
        payload.approved_at = new Date().toISOString();
        payload.approved_by = user?.email || "system";
      }
      if (id) {
        const { error } = await supabase.from("event_forecasts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_forecasts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({ title: vars.id ? "Previsão atualizada!" : "Previsão adicionada!" });
      if (!vars.id && addingType) {
        // Keep adding mode open for rapid entry, reset form
        setInlineForm({ ...emptyInline, type: addingType });
        setTimeout(() => descRef.current?.focus(), 50);
      } else {
        setAddingType(null);
        setEditingId(null);
        setInlineForm(emptyInline);
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, cascadeTransactionIds }: { id: string; cascadeTransactionIds?: string[] }) => {
      // Delete linked transactions first if cascading — uses centralized cascade
      if (cascadeTransactionIds && cascadeTransactionIds.length > 0) {
        for (const txId of cascadeTransactionIds) {
          await deleteTransactionCascade({
            transactionId: txId,
            user,
            auditReason: "Eliminada via BP",
          });
        }
      }
      // Fetch full data before deleting
      const { data: forecastData } = await supabase
        .from("event_forecasts")
        .select("*")
        .eq("id", id)
        .is("version_id", null)
        .single();
      if (forecastData) {
        await moveToTrash({
          entity_type: "forecast",
          entity_id: id,
          entity_data: forecastData,
          deleted_by: user?.email || "sistema",
        });
      }
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Previsão removida" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (forecast: any) => {
      const { error: updateError } = await supabase
        .from("event_forecasts")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user?.email || "admin",
        })
        .eq("id", forecast.id);
      if (updateError) throw updateError;

      // Update event status to "active" on first approval
      await supabase
        .from("events")
        .update({ status: "active" })
        .eq("id", eventId)
        .in("status", ["planning", "confirmed"]);
    },
    onSuccess: (_, forecast) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_detail", eventId] });
      toast({ title: "Previsão aprovada!" });
      // Aprovar BP cascateia para TX → sugerir Fechado se aplicável.
      const promotable = pickFormalidadePromotableIds([forecast]);
      if (promotable.length > 0) {
        setPendingFechado({ ids: promotable, trigger: "após aprovar a linha do BP" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (forecastItems: any[]) => {
      for (const forecast of forecastItems) {
        const { error: updateError } = await supabase
          .from("event_forecasts")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user?.email || "admin",
          })
          .eq("id", forecast.id);
        if (updateError) throw updateError;
      }

      // Update event status to "active" on approval (only for planning/confirmed events, not completed)
      await supabase
        .from("events")
        .update({ status: "active" })
        .eq("id", eventId)
        .in("status", ["planning", "confirmed"]);
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_detail", eventId] });
      setSelectedIds(new Set());
      toast({ title: `${items.length} previsão(ões) aprovada(s) e transações criadas!` });
      const promotable = pickFormalidadePromotableIds(items);
      if (promotable.length > 0) {
        setPendingFechado({ ids: promotable, trigger: "após aprovar em lote" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  // Fetch sub-event names for distribute feature (only on master)
  const { data: subEventNames = [] } = useQuery({
    queryKey: ["sub_event_names_for_distribute", childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, city_id, cities:city_id(name)")
        .in("id", childEventIds!)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!childEventIds && childEventIds.length > 0,
  });

  const subEventNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subEventNames.forEach((e: any) => { map[e.id] = e.name; });
    return map;
  }, [subEventNames]);

  const [distributeTarget, setDistributeTarget] = useState<any>(null);

  const distributeToSplitsMutation = useMutation({
    mutationFn: async (forecast: any) => {
      if (!childEventIds || childEventIds.length === 0) throw new Error("Sem sub-eventos");
      const splitCount = childEventIds.length;
      const amount = Number(forecast.amount);
      const splitAmount = Math.round((amount / splitCount) * 100) / 100;
      const totalDistributed = splitAmount * (splitCount - 1);
      const lastAmount = Math.round((amount - totalDistributed) * 100) / 100;

      const inserts = childEventIds.map((eid, idx) => ({
        event_id: eid,
        type: forecast.type as "expense" | "income",
        description: forecast.description,
        specification: forecast.specification || null,
        amount: idx === splitCount - 1 ? lastAmount : splitAmount,
        iva_rate: Number(forecast.iva_rate),
        category_id: forecast.category_id || null,
        status: "draft" as const,
      }));

      const { error: insertErr } = await supabase.from("event_forecasts").insert(inserts);
      if (insertErr) throw insertErr;

      const { error: deleteErr } = await supabase.from("event_forecasts").delete().eq("id", forecast.id);
      if (deleteErr) throw deleteErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      setDistributeTarget(null);
      toast({ title: "Despesa distribuída para os sub-eventos" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao distribuir", description: err.message, variant: "destructive" });
    },
  });

  const handleBulkApprove = () => {
    const items = forecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft");
    if (items.length === 0) return;
    bulkApproveMutation.mutate(items);
  };

  // Bulk create "A Pagar" transactions from selected approved lines (admin only).
  // Regra: linha do BP aprovada → transação nasce já aprovada (BP é a aprovação).
  const bulkCreateTxMutation = useMutation({
    mutationFn: async (forecastItems: any[]) => {
      let created = 0;
      let autoApproved = 0;
      let propagatedAttachments = 0;
      for (const f of forecastItems) {
        const isBPApproved = f.status === "approved";
        const txStatus = isBPApproved ? "approved" : "pending";

        const { data: insertedTx, error } = await supabase.from("transactions").insert({
          event_id: eventId,
          type: f.type,
          description: f.description,
          specification: f.specification || null,
          amount: Number(f.amount),
          iva_rate: Number(f.iva_rate),
          category_id: f.category_id || null,
          date: eventDate,
          due_date: eventDate,
          status: txStatus,
        }).select("id").single();
        if (error) throw error;

        // Audit: log creation from BP (and auto-approval if applicable)
        if (insertedTx?.id) {
          const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
          await supabase.from("transaction_audit_log").insert({
            transaction_id: insertedTx.id,
            changed_by: callerName,
            field_name: "Criação",
            old_value: null,
            new_value: `Gerado do BP — ${f.description} — ${Number(f.amount).toFixed(2)} €`,
          });
          if (isBPApproved) {
            await supabase.from("transaction_audit_log").insert({
              transaction_id: insertedTx.id,
              changed_by: callerName,
              field_name: "status",
              old_value: "pending",
              new_value: "approved",
              observation: "Aprovação automática — linha do BP já aprovada",
            } as any);
            autoApproved++;
          }

          // Propagate BP attachment links (Drive/Dropbox/etc.) from the forecast
          // to the newly-created transaction as ref:// documents.
          const refUrls: string[] = Array.isArray(f.attachment_refs)
            ? (f.attachment_refs as any[])
                .map((r) => (r && typeof r.url === "string" ? r.url.trim() : ""))
                .filter((u) => /^https?:\/\//i.test(u))
            : [];

          if (refUrls.length > 0) {
            const docs = refUrls.map((link) => {
              let fileName = link.slice(0, 80);
              try {
                const u = new URL(link);
                fileName = decodeURIComponent(
                  u.pathname.split("/").filter(Boolean).pop() || u.hostname,
                ).slice(0, 120);
              } catch { /* keep fallback */ }
              return {
                transaction_id: insertedTx.id,
                name: fileName,
                file_url: `ref://${link}`,
                doc_type: "outro",
                uploaded_by: user?.email ?? "system",
                is_accounting: true,
              };
            });
            await supabase.from("transaction_documents").insert(docs as any);
            propagatedAttachments += refUrls.length;
          }

          // Back-link the forecast to the new transaction so future BP edits
          // continue to propagate automatically.
          if (!f.transaction_id) {
            await supabase
              .from("event_forecasts")
              .update({ transaction_id: insertedTx.id } as any)
              .eq("id", f.id);
          }
        }
        created++;
      }
      return { created, autoApproved, propagatedAttachments };
    },
    onSuccess: ({ created, autoApproved, propagatedAttachments }, forecastItems) => {
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedIds(new Set());
      const baseMsg = autoApproved === created
        ? `${created} transação(ões) criada(s) já aprovada(s) (BP aprovado).`
        : autoApproved > 0
          ? `${created} transação(ões) criada(s) — ${autoApproved} já aprovada(s), ${created - autoApproved} pendente(s).`
          : `${created} transação(ões) "A Pagar" criada(s) (pendentes de aprovação)!`;
      const desc = propagatedAttachments > 0
        ? `${propagatedAttachments} anexo(s) do BP propagado(s) para as transações.`
        : undefined;
      toast({ title: baseMsg, description: desc });
      // Sugerir mudança de formalidade para "Fechado" nas linhas elegíveis.
      const promotable = pickFormalidadePromotableIds(forecastItems);
      if (promotable.length > 0) {
        setPendingFechado({
          ids: promotable,
          trigger: forecastItems.length === 1 ? "após gerar a transação" : "após gerar as transações",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transações", description: err.message, variant: "destructive" });
    },
  });

  // Schedule N installment transactions from a single approved BP line.
  // Each installment becomes a transaction with its own date and amount.
  const [scheduleTarget, setScheduleTarget] = useState<any | null>(null);
  const scheduleInstallmentsMutation = useMutation({
    mutationFn: async ({ forecast, installments }: { forecast: any; installments: Installment[] }) => {
      const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      const isBPApproved = forecast.status === "approved";
      const txStatus = isBPApproved ? "approved" : "pending";
      const preparedInstallments = installments.map((inst, i) => ({
        amount: roundCents(Number(inst.amount) || 0),
        date: inst.date,
        description: inst.description || `${forecast.description} (${i + 1}/${installments.length})`,
      }));

      if (forecast.transaction_id) {
        throw new Error("Esta linha do BP já tem transações/parcelas programadas.");
      }

      const installmentDescriptions = [...new Set(preparedInstallments.map((inst) => inst.description))];
      const installmentDates = [...new Set(preparedInstallments.map((inst) => inst.date))];
      let existingQuery = supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, due_date")
        .eq("event_id", eventId)
        .eq("type", forecast.type)
        .in("description", installmentDescriptions)
        .in("due_date", installmentDates);

      existingQuery = forecast.category_id
        ? existingQuery.eq("category_id", forecast.category_id)
        : existingQuery.is("category_id", null);

      const { data: existingInstallments, error: existingError } = await existingQuery;
      if (existingError) throw existingError;

      const expectedKeys = new Set(
        preparedInstallments.map((inst) => `${inst.description}|${inst.date}|${inst.amount.toFixed(2)}|${Number(forecast.iva_rate).toFixed(2)}`),
      );
      const alreadyExists = (existingInstallments ?? []).some((tx: any) =>
        expectedKeys.has(`${tx.description}|${tx.due_date}|${Number(tx.amount).toFixed(2)}|${Number(tx.iva_rate).toFixed(2)}`),
      );
      if (alreadyExists) {
        throw new Error("Estas parcelas já existem para esta linha do BP. Remova/edite as existentes antes de reprogramar.");
      }

      const ids: string[] = [];
      for (let i = 0; i < preparedInstallments.length; i++) {
        const inst = preparedInstallments[i];
        const { data: insertedTx, error } = await supabase.from("transactions").insert({
          event_id: eventId,
          type: forecast.type,
          description: inst.description,
          specification: forecast.specification || null,
          amount: inst.amount,
          iva_rate: Number(forecast.iva_rate),
          category_id: forecast.category_id || null,
          date: inst.date,
          due_date: inst.date,
          status: txStatus,
        } as any).select("id").single();
        if (error) {
          if ((error as any).code === "23505") {
            throw new Error("Estas parcelas já existem para esta linha do BP. A criação duplicada foi bloqueada.");
          }
          throw error;
        }
        if (insertedTx?.id) {
          ids.push(insertedTx.id);
          await supabase.from("transaction_audit_log").insert({
            transaction_id: insertedTx.id,
            changed_by: callerName,
            field_name: "Criação",
            old_value: null,
              new_value: `Programação de parcelas — ${i + 1}/${preparedInstallments.length} de "${forecast.description}" — ${Number(inst.amount).toFixed(2)} €`,
          });
          if (isBPApproved) {
            await supabase.from("transaction_audit_log").insert({
              transaction_id: insertedTx.id,
              changed_by: callerName,
              field_name: "status",
              old_value: "pending",
              new_value: "approved",
              observation: "Aprovação automática — linha do BP já aprovada",
            } as any);
          }
        }
      }
      // Back-link first transaction to the forecast (matches single-tx convention).
      if (!forecast.transaction_id && ids[0]) {
        await supabase
          .from("event_forecasts")
          .update({ transaction_id: ids[0] } as any)
          .eq("id", forecast.id);
      }
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      toast({ title: `${count} transação(ões) programada(s) com sucesso.` });
      setScheduleTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao programar parcelas", description: err.message, variant: "destructive" });
    },
  });
  // have one. Rule: 1 auto-generated TX per BP line — additional TXs for the
  // same category must be created from the Transactions modal.
  const isEligibleForBulkTx = useCallback(
    (f: any) => {
      const isMasterDerivedOnSplit = !!parentEventId && (
        !!f._prorated ||
        !!f._overhead_via_master ||
        !!f._readonly ||
        !!f.master_forecast_id ||
        (!!f._master_event_id && f._master_event_id !== eventId)
      );

      const normalize = (value: string | null | undefined) =>
        String(value ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();

      const localSignature = [normalize(f.description), normalize(f.specification)].filter(Boolean).join(" | ");
      const isMasterControlledLocalLine = !!parentEventId && parentForecasts.some((parentForecast: any) => {
        if (parentForecast.type !== f.type) return false;
        if ((parentForecast.category_id ?? null) !== (f.category_id ?? null)) return false;

        const parentSignature = [normalize(parentForecast.description), normalize(parentForecast.specification)].filter(Boolean).join(" | ");

        if (localSignature && parentSignature) return localSignature === parentSignature;
        return normalize(parentForecast.description) === normalize(f.description);
      });

      return (
        f.status === "approved" &&
        !isMasterDerivedOnSplit &&
        !isMasterControlledLocalLine &&
        !f.transaction_id &&
        findMatchingTransactionsForForecast(f, transactions, forecasts).length === 0
      );
    },
    [parentEventId, eventId, parentForecasts, transactions, forecasts],
  );

  const handleBulkCreateTx = () => {
    const items = forecasts.filter((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f));
    const skipped = forecasts.filter(
      (f) => selectedIds.has(f.id) && f.status === "approved" && !isEligibleForBulkTx(f),
    ).length;
    if (items.length === 0) {
      toast({
        title: "Nenhuma linha elegível",
        description: skipped > 0
          ? `${skipped} linha(s) já têm transação gerada — crie novas pelo modal de Transações.`
          : "Selecione linhas aprovadas sem transação.",
        variant: "destructive",
      });
      return;
    }
    bulkCreateTxMutation.mutate(items);
    if (skipped > 0) {
      toast({
        title: `${skipped} linha(s) ignorada(s)`,
        description: "Já têm transação gerada — use o modal de Transações para criar adicionais.",
      });
    }
  };

  const [historicalModalOpen, setHistoricalModalOpen] = useState(false);

  const generateHistoricalMutation = useMutation({
    mutationFn: async (xlsxRows: XlsxRowForGeneration[] | null) => {
      const eligibleIds = forecasts.filter((f) => isEligibleForBulkTx(f)).map((f) => f.id);
      const { data, error } = await supabase.functions.invoke("generate-historical-transactions", {
        body: { event_id: eventId, xlsxRows: xlsxRows ?? [], eligible_forecast_ids: eligibleIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      const parts: string[] = [];
      if (data.createdPaid > 0) parts.push(`${data.createdPaid} liquidada(s)`);
      if (data.createdApproved > 0) parts.push(`${data.createdApproved} aprovada(s)`);
      if (data.xlsxProvided > 0) parts.push(`${data.matched}/${data.total} match`);
      if (data.errors?.length > 0) parts.push(`${data.errors.length} erro(s)`);
      toast({
        title: `${data.created} transação(ões) gerada(s)`,
        description: parts.join(" · ") || undefined,
      });
      setHistoricalModalOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao gerar transações", description: err.message, variant: "destructive" });
    },
  });

  const handleGenerateHistorical = () => {
    if (eligibleForHistoricalGen.length === 0) {
      toast({ title: "Nenhuma previsão elegível (sem transação e sem match por categoria)", variant: "destructive" });
      return;
    }
    setHistoricalModalOpen(true);
  };

  /**
   * Importing the BP from Eventos now redirects the user to the full
   * Implantação flow (`/admin/implantacao/:id`) which is far richer:
   *   - sheet mapping per sub-event/date
   *   - app/raw/comparison views
   *   - automatic apportionment & rollback history
   *   - new attachments step (column links + ZIP matching)
   *
   * We create (or reuse) an `event_implementations` row for the current
   * event, upload the XLSX and navigate to the detail page so the user can
   * pick up exactly where they left off.
   */
  const handleImportXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const instructions = pendingImportInstructions;
    setPendingImportMode(null);
    setPendingImportInstructions("");
    setImportingXlsx(true);
    try {
      // For sub-events route the implementation to the Master so the user can
      // distribute the file across all siblings in one go.
      const implEventId = parentEventId ?? eventId;

      // Reuse an existing in-progress/pending implementation for this event
      // when one already exists — avoids cluttering the list with duplicates.
      const { data: existing } = await supabase
        .from("event_implementations")
        .select("id, status")
        .eq("event_id", implEventId)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1);

      // Upload the new file regardless — each import gets its own copy so the
      // user can re-run with a fresh ficheiro if needed.
      const { error: uploadErr, path: filePath } = await uploadToCompanyBucket(
        "implementation-files",
        `${Date.now()}_${file.name}`,
        file,
      );
      if (uploadErr) throw uploadErr;

      let implementationId: string;
      if (existing && existing.length > 0) {
        implementationId = existing[0].id;
        // Replace the previous file (if any) with the new one
        const { data: prev } = await supabase
          .from("event_implementations")
          .select("reference_file_url")
          .eq("id", implementationId)
          .single();
        if (prev?.reference_file_url) {
          await supabase.storage
            .from("implementation-files")
            .remove([prev.reference_file_url]);
        }
        await supabase
          .from("event_implementations")
          .update({
            reference_file_url: filePath,
            reference_file_name: file.name,
            import_instructions: instructions || null,
            status: "in_progress",
          })
          .eq("id", implementationId);
      } else {
        const { data: created, error: insertErr } = await supabase
          .from("event_implementations")
          .insert({
            event_id: implEventId,
            status: "in_progress",
            reference_file_url: filePath,
            reference_file_name: file.name,
            import_instructions: instructions || null,
          })
          .select("id")
          .single();
        if (insertErr || !created) throw insertErr ?? new Error("Falha a criar implantação");
        implementationId = created.id;
      }

      toast({
        title: "A abrir o fluxo completo de importação…",
        description: "Mapeamento de abas, anexos e rateio disponíveis no próximo ecrã.",
      });
      navigate(`/admin/implantacao/${implementationId}`);
    } catch (err: any) {
      toast({ title: "Erro a iniciar importação", description: err.message, variant: "destructive" });
    } finally {
      setImportingXlsx(false);
    }
  };




  const handleAttachLinksXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAttachingLinks(true);
    try {
      const buffer = await file.arrayBuffer();
      // For Master events, scan all sub-events too; for Sub events, fall back to Master BP
      const targetEventIds = childEventIds && childEventIds.length > 0
        ? [eventId, ...childEventIds]
        : [eventId];
      const result = await attachLinksFromXlsx(buffer, targetEventIds, user?.email || "system", parentEventId);

      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary"] });
      queryClient.invalidateQueries({ queryKey: ["bp_orphan_attachments_count", eventId] });

      const summary = [
        `${result.attached} link(s) anexado(s)`,
        result.matchedInMaster > 0 ? `${result.matchedInMaster} via Master` : null,
        result.skipped > 0 ? `${result.skipped} já existia(m)` : null,
        result.rowsWithoutMatch > 0 ? `${result.rowsWithoutMatch} órfão(s) — abre resolução manual` : null,
        result.rowsWithoutTx > 0 ? `${result.rowsWithoutTx} BP sem transação gerada` : null,
      ].filter(Boolean).join(" · ");

      toast({
        title: result.attached > 0 ? "Links anexados às transações" : "Nenhum link novo a anexar",
        description: summary || (result.errors[0] ?? undefined),
        variant: result.errors.length > 0 && result.attached === 0 ? "destructive" : undefined,
      });

      // Auto-open resolver when there are orphans
      if (result.orphans && result.orphans.length > 0) {
        setShowOrphanResolver(true);
      }
    } catch (err: any) {
      toast({ title: "Erro ao anexar links", description: err.message, variant: "destructive" });
    } finally {
      setAttachingLinks(false);
    }
  };

  // Mesma regra do bulk: 1 TX auto por linha BP — exclui linhas que já têm
  // transação direta OU match por categoria/similaridade.
  const eligibleForHistoricalGen = forecasts.filter((f) => isEligibleForBulkTx(f));
  const approvedWithoutTxCount = eligibleForHistoricalGen.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDrafts = (type: "income" | "expense") => {
    const drafts = forecasts.filter((f) => f.type === type && f.status === "draft");
    const allSelected = drafts.every((f) => selectedIds.has(f.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        drafts.forEach((f) => next.delete(f.id));
      } else {
        drafts.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const toggleSelectAllApproved = (type: "income" | "expense") => {
    // Só selecciona linhas elegíveis (sem TX e sem match real) — esconde
    // visualmente as não-elegíveis e evita selecioná-las pelo "select all".
    const approved = forecasts.filter(
      (f) => f.type === type && f.status === "approved" && !f.cache_config_id && isEligibleForBulkTx(f),
    );
    const allSelected = approved.length > 0 && approved.every((f) => selectedIds.has(f.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        approved.forEach((f) => next.delete(f.id));
      } else {
        approved.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const handleInlineSave = () => {
    if (!inlineForm.description || !inlineForm.amount) {
      toast({ title: "Preencha a descrição e valor", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ form: inlineForm, id: editingId });
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInlineSave();
    } else if (e.key === "Escape") {
      setAddingType(null);
      setEditingId(null);
      setInlineForm(emptyInline);
    }
  };

  const startEdit = (f: any) => {
    setInlineForm({
      type: f.type,
      description: f.description,
      amount: String(f.amount),
      iva_rate: String(f.iva_rate),
      category_id: f.category_id || "",
      notes: f.notes || "",
      specification: f.specification || "",
      is_overhead: !!f.is_overhead,
    });
    setEditingId(f.id);
    setAddingType(null);
  };

  const startAdding = (type: "income" | "expense") => {
    setAddingType(type);
    setEditingId(null);
    setInlineForm({ ...emptyInline, type });
  };

  const cancelInline = () => {
    setAddingType(null);
    setEditingId(null);
    setInlineForm(emptyInline);
  };

  const bpSearchLower = bpSearch.toLowerCase().trim();
  const matchesBpSearch = (f: any) => {
    if (!bpSearchLower) return true;
    const catInfo = categories.find((c: any) => c.id === f.category_id);
    return (
      f.description?.toLowerCase().includes(bpSearchLower) ||
      f.specification?.toLowerCase().includes(bpSearchLower) ||
      catInfo?.name?.toLowerCase().includes(bpSearchLower) ||
      catInfo?.code?.toLowerCase().includes(bpSearchLower)
    );
  };

  const matchesPartnerFilter = (f: any) => {
    if (partnerFilter === "all") return true;
    const partners = forecastPartnerMap[f.id] ?? [];
    if (partnerFilter === "company") return partners.length === 0;
    return partners.includes(partnerFilter);
  };

  const hasTxForForecast = useCallback(
    (forecast: any) => findMatchingTransactionsForForecast(forecast, transactions, [...forecasts, ...adoptedForecasts]).length > 0,
    [transactions, forecasts, adoptedForecasts],
  );

  const matchesTxLinkFilter = (f: any) => {
    if (txLinkFilter === "all") return true;
    // Linhas de rateio do Master vistas no Sub (overhead via Master / read-only) não
    // pertencem a este sub-evento. Quando o filtro está em "Com" ou "Sem transação",
    // estas linhas são totalmente ocultadas — só aparecem dentro do próprio Master.
    if (f._overhead_via_master || f._readonly) return false;
    const hasTx = hasTxForForecast(f);
    if (txLinkFilter === "with_tx") return hasTx;
    if (txLinkFilter === "without_tx") return !hasTx;
    return true;
  };

  // Filtra por estado de formalidade. Se a linha não tiver valor (legado/snapshot),
  // assume "estimado" — coerente com o default do schema.
  const matchesFormalidadeFilter = (f: any) => {
    if (formalidadeFilter === "all") return true;
    const formal = f?.formalidade ?? "estimado";
    return formal === formalidadeFilter;
  };

  // Ordenador da despesa — filtro aplica-se SÓ a despesas (receitas não têm ordenador).
  const matchesOrderingFilter = (f: any) => {
    if (orderingFilter === ORDERING_FILTER_ALL) return true;
    if (f?.type !== "expense") return true;
    return matchesOrderingPartnerFilter(f?.ordering_partner_id ?? null, orderingFilter);
  };

  // Herança: TX de despesa sem ordenador próprio herda o da linha BP que a reclama.
  const inheritedOrdererMap = useMemo(
    () => buildInheritedOrdererMap([...forecasts, ...adoptedForecasts], transactions),
    [forecasts, adoptedForecasts, transactions],
  );

  const incomeForecasts = forecasts.filter((f) => f.type === "income").filter(matchesBpSearch).filter(matchesPartnerFilter).filter(matchesTxLinkFilter).filter(matchesFormalidadeFilter);
  const expenseForecasts = forecasts.filter((f) => f.type === "expense").filter(matchesBpSearch).filter(matchesPartnerFilter).filter(matchesTxLinkFilter).filter(matchesFormalidadeFilter).filter(matchesOrderingFilter);
  // Cache forecasts are now real forecast rows (synced via useSyncCacheForecasts)
  // No more virtual cache lines needed
  const filteredCacheLines: CachePLLine[] = [];
  const filteredCacheAmount = 0;
  const filteredProratedParentExpenses = useMemo(() => {
    return allProratedParentExpenses.filter((forecast: any) => {
      if (txLinkFilter !== "all") {
        const adoptedChildrenForThisSplit = adoptedForecasts.filter(
          (adopted: any) => adopted.master_forecast_id === forecast.id && adopted.event_id === eventId,
        );

        const candidateForecasts = adoptedChildrenForThisSplit.length > 0
          ? adoptedChildrenForThisSplit
          : [{
              ...forecast,
              id: `${forecast.id}::prorated::${eventId}`,
              event_id: eventId,
              transaction_id: null,
            }];

        const hasTx = candidateForecasts.some((candidate: any) => hasTxForForecast(candidate));
        if (txLinkFilter === "with_tx" && !hasTx) return false;
        if (txLinkFilter === "without_tx" && hasTx) return false;
      }

      // Formalidade — coerente com matchesFormalidadeFilter aplicado às linhas normais.
      if (formalidadeFilter !== "all") {
        const formal = forecast?.formalidade ?? "estimado";
        if (formal !== formalidadeFilter) return false;
      }

      // Ordenador da despesa — mesma regra das linhas locais.
      if (!matchesOrderingPartnerFilter(forecast?.ordering_partner_id ?? null, orderingFilter)) return false;

      if (partnerFilter === "all") return true;
      const partners = forecastPartnerMap[forecast.id] ?? [];
      if (partnerFilter === "company") return partners.length === 0;
      return partners.includes(partnerFilter);
    });
  }, [allProratedParentExpenses, forecastPartnerMap, partnerFilter, txLinkFilter, formalidadeFilter, orderingFilter, adoptedForecasts, eventId, hasTxForForecast]);

  // Build hierarchy lookup for grouping
  const catLookup = useMemo(() => buildCategoryLookup(categories), [categories]);

  // Group forecasts by L2 parent category
  const groupForecasts = (items: any[]) => {
    const groups: { groupName: string; groupCode: string; items: any[] }[] = [];
    const groupMap: Record<string, { groupName: string; groupCode: string; items: any[] }> = {};

    items.forEach((item) => {
      const info = catLookup[item.category_id];
      const groupName = info?.groupName ?? "Sem categoria";
      const groupCode = info?.groupCode ?? "Z";
      if (!groupMap[groupName]) {
        groupMap[groupName] = { groupName, groupCode, items: [] };
        groups.push(groupMap[groupName]);
      }
      groupMap[groupName].items.push(item);
    });

    // Sort items within each group by category code.
    // Buckets sintéticos ("Sem linha específica") ficam sempre no fim da sua categoria.
    groups.forEach((g) => {
      g.items.sort((a, b) => {
        const codeA = catLookup[a.category_id]?.code ?? "Z.Z";
        const codeB = catLookup[b.category_id]?.code ?? "Z.Z";
        const byCode = compareHierarchicalCodes(codeA, codeB);
        if (byCode !== 0) return byCode;
        return (a._orphanBucket ? 1 : 0) - (b._orphanBucket ? 1 : 0);
      });
    });

    return groups.sort((a, b) => compareHierarchicalCodes(a.groupCode || "Z", b.groupCode || "Z"));
  };

  // Regra de ouro: nenhuma transação com categoria pode ficar invisível na visão
  // agrupada. Para cada categoria com transações não reclamadas por nenhuma linha
  // BP (sem back-link e sem ganhar o token-match, ou categoria sem BP), criamos uma
  // linha sintética "Sem linha específica" — só realizado, não editável.
  const buildOrphanBuckets = (type: "income" | "expense") => {
    const txs = transactions as any[];
    if (!txs?.length) return [];
    const catIds = new Set<string>();
    for (const t of txs) {
      if (t.type !== type || !t.category_id) continue;
      if (!(t.event_id === eventId || t.event_id === null)) continue;
      catIds.add(t.category_id);
    }
    const out: any[] = [];
    for (const categoryId of catIds) {
      const orphans = findCategoryOrphanTransactions({
        categoryId,
        type,
        eventId,
        transactions: txs,
        allForecasts: forecasts as any[],
      });
      if (orphans.length === 0) continue;
      const info = catLookup[categoryId];
      out.push({
        id: `orphan-bucket-${type}-${categoryId}`,
        _orphanBucket: true,
        _orphanTx: orphans,
        category_id: categoryId,
        type,
        amount: 0,
        iva_rate: 0,
        status: "n/a",
        description: "Sem linha específica",
        specification: null,
        event_id: eventId,
        account_categories: info ? { code: info.code, name: info.name } : null,
      });
    }
    return out;
  };

  const incomeGroups = useMemo(
    () => groupForecasts([...incomeForecasts, ...buildOrphanBuckets("income")]),
    [incomeForecasts, catLookup, transactions, forecasts, eventId],
  );
  const expenseGroups = useMemo(() => {
    // Merge own expenses with prorated parent expenses into a single list
    const mergedExpenses = [...expenseForecasts, ...filteredProratedParentExpenses.map((f: any) => ({ ...f, _prorated: true }))];
    const groups = groupForecasts([...mergedExpenses, ...buildOrphanBuckets("expense")]);
    return groups;
  }, [expenseForecasts, filteredProratedParentExpenses, catLookup, transactions, forecasts, eventId]);

  // IVA somado SEMPRE linha-a-linha com arredondamento ao cêntimo (CIVA Art.º 18)
  const proratedExpenseBase = filteredProratedParentExpenses.reduce((s: number, f: any) => s + Number(f.amount), 0);
  const proratedExpenseIva = filteredProratedParentExpenses.reduce((s: number, f: any) => s + calcIvaAmount(Number(f.amount), Number(f.iva_rate)), 0);

  // Comparison view (Previsão vs Real) — regras estritas:
  // 1) Previsto: apenas linhas BP `approved` (rascunhos/rejeitadas não contam).
  // 2) Real: apenas TX `approved` ou `paid`; exclui transitórias e marcadas exclude_from_result.
  // 3) Overhead Master→Splits:
  //    - Toggle OFF (default): overhead fica fora (Vista Empresa). exclude_from_result filtra.
  //    - Toggle ON (Vista Sócio/com overhead): inclui linhas `is_overhead=true` do próprio evento
  //      e a fatia virtual `_overhead_via_master` no split. Como overhead não gera TX, a coluna
  //      Real desses lançamentos fica €0 — útil para auditar planeado vs cumprido do overhead.
  // 4) Perímetro Real: ignora TX de sub-eventos quando se vê o Master sem o toggle Master+Subs.
  // 5) **Simetria por categoria**: o Real só soma TX cuja categoria existe no BP approved
  //    do próprio evento sendo visto (Master compara só contas do BP Master; Sub só do BP local).
  //    Sem isto, despesas locais de subs entrariam no Real do Master mesmo sem terem sido
  //    orçadas nele, criando variações enormes em contas que o Master nunca planeou.
  const comparisonForecasts = useMemo(() => {
    return (forecasts as any[]).filter((f) => {
      // Overhead handling: depende do toggle. _overhead_via_master é a fatia virtual no split.
      const isOverheadLine = !!f.is_overhead || !!f._overhead_via_master;
      if (isOverheadLine && !includeOverheadInComparison) return false;
      if (f.status !== "approved") return false;
      // exclude_from_result normalmente filtra overhead; saltamos esse filtro quando incluímos overhead
      if (f.exclude_from_result && !isOverheadLine) return false;
      if (f.is_transitory) return false;
      // Quando vê-se só o Master (toggle OFF), exclui forecasts de filhos por segurança.
      // `parentEventId` chega undefined no evento Master, por isso usamos `== null`.
      if (!includeSubsInBP && parentEventId == null && f.event_id !== eventId) return false;
      // Filtro de ordenador (só despesas) — previsto e realizado ficam coerentes.
      if (f.type === "expense" && !matchesOrderingPartnerFilter(f.ordering_partner_id ?? null, orderingFilter)) return false;
      return true;
    });
  }, [forecasts, includeSubsInBP, parentEventId, eventId, includeOverheadInComparison, orderingFilter]);

  // Conjunto de category_id que existem no BP do evento sendo visto (após filtros acima).
  // Usado para restringir o Real às mesmas contas previstas.
  const bpCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of comparisonForecasts) {
      if (f.category_id) set.add(f.category_id);
    }
    return set;
  }, [comparisonForecasts]);

  const comparisonTransactions = useMemo(() => {
    return (transactions as any[]).filter((t) => {
      if (!(t.status === "approved" || t.status === "paid")) return false;
      if (t.is_transitory) return false;
      if (t.exclude_from_result) return false;
      // Master sem toggle: mantém TX do próprio Master e também os contentores
      // multi-evento (event_id null), mas exclui TX lançadas diretamente nos splits.
      // A simetria por categoria abaixo impede que categorias locais dos splits
      // vazem para o Real do Master quando não existem no BP aprovado do Master.
      if (!includeSubsInBP && parentEventId == null && t.event_id && t.event_id !== eventId) return false;
      // Simetria por categoria: só TX cuja categoria foi orçada no BP deste evento.
      // TX sem categoria ficam fora (não há linha BP para comparar).
      if (!t.category_id || !bpCategoryIds.has(t.category_id)) return false;
      // Ordenador efectivo (próprio ou herdado da linha BP) — só despesas.
      if (
        t.type === "expense" &&
        !matchesOrderingPartnerFilter(effectiveTransactionOrderer(t, inheritedOrdererMap), orderingFilter)
      ) return false;
      return true;
    });
  }, [transactions, includeSubsInBP, parentEventId, eventId, bpCategoryIds, orderingFilter, inheritedOrdererMap]);
  const comparisonData = buildComparison(comparisonForecasts, comparisonTransactions, categories);

  // Alinha os cards do BP ao mesmo perímetro estrito da vista "Previsão vs Real",
  // evitando que a visão Master mostre nos cards linhas/tx fora do escopo comparável.
  const totalForecastIncomeBase = comparisonForecasts
    .filter((f) => f.type === "income")
    .reduce((s, f) => s + Number(f.amount), 0);
  const totalForecastIncomeIva = comparisonForecasts
    .filter((f) => f.type === "income")
    .reduce((s, f) => s + calcIvaAmount(Number(f.amount), Number(f.iva_rate)), 0);
  const totalForecastIncomeStrict = totalForecastIncomeBase + totalForecastIncomeIva;
  const totalForecastExpenseBase = comparisonForecasts
    .filter((f) => f.type === "expense")
    .reduce((s, f) => s + Number(f.amount), 0);
  const totalForecastExpenseIva = comparisonForecasts
    .filter((f) => f.type === "expense")
    .reduce((s, f) => s + calcIvaAmount(Number(f.amount), Number(f.iva_rate)), 0);
  const totalForecastExpense = totalForecastExpenseBase;
  const totalForecastIncome = totalForecastIncomeStrict > 0 ? totalForecastIncomeStrict : ticketRevenue;
  const forecastProfit = totalForecastIncome - totalForecastExpense;

  const totalActualIncomeStrict = comparisonTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  // O card de receita real deve refletir a bilheteira vendida + outras receitas reais.
  // Antes, quando existia qualquer receita em transações, a bilheteira real era ignorada
  // e o valor podia ficar artificialmente igual ao previsto.
  const totalActualIncome = totalActualIncomeStrict + ticketActualRevenue;
  const totalActualExpense = comparisonTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const actualProfit = totalActualIncome - totalActualExpense;

  const draftCount = forecasts.filter((f) => f.status === "draft").length;
  const approvedCount = forecasts.filter((f) => f.status === "approved").length;

  const incomeCategories = categories.filter((c) => c.type === "income" && !categories.some((ch) => ch.parent_id === c.id));
  const expenseCategories = categories.filter((c) => c.type === "expense" && !categories.some((ch) => ch.parent_id === c.id));

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50";

  const renderInlineRow = (type: "income" | "expense") => {
    const cats = type === "income" ? incomeCategories : expenseCategories;
    const isExpenseType = type === "expense";
    return (
      <tr className="bg-primary/5 animate-fade-in" onKeyDown={handleInlineKeyDown}>
        <td className="py-1.5 pr-2">
          <input
            ref={descRef}
            value={inlineForm.description}
            onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })}
            className={inputClass}
            placeholder="Descrição…"
            autoFocus
          />
        </td>
        {isExpenseType && (
          <td className="py-1.5 pr-2">
            <input
              value={inlineForm.specification}
              onChange={(e) => setInlineForm({ ...inlineForm, specification: e.target.value })}
              className={inputClass}
              placeholder="Especificação…"
            />
          </td>
        )}
        <td className="hidden py-1.5 pr-2 sm:table-cell">
          <SearchableSelect
            options={cats.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
            value={inlineForm.category_id}
            onValueChange={(v) => setInlineForm({ ...inlineForm, category_id: v })}
            placeholder="Categoria…"
            searchPlaceholder="Pesquisar conta…"
            className={inputClass}
          />
        </td>
        <td className="py-1.5 pr-2">
          <select
            value={inlineForm.iva_rate}
            onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })}
            className={`${inputClass} w-20`}
          >
            {ivaRates.map((r) => (<option key={r} value={String(r)}>{r}%</option>))}
          </select>
        </td>
        <td className="py-1.5 pr-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={inlineForm.amount}
            onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })}
            className={`${inputClass} w-28 text-right font-mono`}
            placeholder="0,00"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); } }}
          />
        </td>
        <td className="py-1.5 pr-2 text-right font-mono text-xs text-muted-foreground">
          {formatCurrency((parseFloat(inlineForm.amount) || 0) * (parseInt(inlineForm.iva_rate) || 0) / 100)}
        </td>
        <td className="py-1.5 pr-2 text-right font-mono text-xs font-semibold">
          {formatCurrency((parseFloat(inlineForm.amount) || 0) * (1 + (parseInt(inlineForm.iva_rate) || 0) / 100))}
        </td>
        <td className="py-1.5 text-right">
          <div className="flex justify-end items-center gap-1">
            {isExpenseType && canEditBP && (
              <button
                type="button"
                onClick={() => setInlineForm({ ...inlineForm, is_overhead: !inlineForm.is_overhead })}
                className={`rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  inlineForm.is_overhead
                    ? "bg-warning/20 text-warning hover:bg-warning/30"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                }`}
                title={inlineForm.is_overhead ? "Rateio de Overhead — não impacta resultado da empresa" : "Marcar como Rateio de Overhead (admin/manager)"}
              >
                Overhead
              </button>
            )}
            <button
              onClick={handleInlineSave}
              disabled={saveMutation.isPending}
              className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
              title="Guardar (Enter)"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={cancelInline}
              className="rounded p-1.5 hover:bg-secondary transition-colors"
              title="Cancelar (Esc)"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const isMasterEvent = Boolean(childEventIds && childEventIds.length > 0);
  const isSplitEvent = Boolean(parentEventId);
  const canManageVersions = isAdmin || isManager;

  return (
    <div className="space-y-6">
      <BPVersionCard
        eventId={eventId}
        eventName={eventName}
        isMaster={isMasterEvent}
        isSplit={isSplitEvent}
        canManage={canManageVersions}
      />
      <BPScenarioSelector
        eventId={eventId}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
      />
      {isScenarioMode && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">A editar um cenário sandbox</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              As alterações ficam isoladas neste cenário e <strong>não afetam o BP em produção</strong>.
              Para aplicar, promove o cenário a Ativa no card de versões em cima.
              Geração de transações, aprovações e adoção Master↔Split estão desativadas em modo cenário.
            </p>
          </div>
        </div>
      )}
      {expenseOnly && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <TrendingDown className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Despesas Partilhadas (Rateio)</p>
            <p className="text-xs text-muted-foreground">As despesas aqui criadas serão rateadas igualmente entre todos os eventos Split nos relatórios.</p>
          </div>
        </div>
      )}
      {/* Summary cards */}
      <div className={`grid gap-4 ${expenseOnly ? "sm:grid-cols-2" : parentEventId ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {!expenseOnly && typeFilter !== "expense" && <SummaryCard label="Receitas" helpText="Previsão = receitas BP no perímetro comparável; se não houver linhas de receita, usa a receita prevista de bilheteira sem IVA. Real = transações de receita aprovadas/pagas no mesmo perímetro + bilheteira vendida sem IVA. Este card trabalha sem IVA." forecast={totalForecastIncome} actual={totalActualIncome} icon={<TrendingUp className="h-4 w-4 text-success" />} />}
        {typeFilter !== "income" && <SummaryCard label="Despesas" helpText="Previsão = soma das despesas do BP no perímetro comparável, sempre sem IVA. Real = soma das transações de despesa aprovadas/pagas no mesmo perímetro, também sem IVA. Este card trabalha sem IVA." forecast={totalForecastExpense} actual={totalActualExpense} icon={<TrendingDown className="h-4 w-4 text-warning" />} />}
        {!expenseOnly && !parentEventId && typeFilter === "all" && <SummaryCard label="Resultado" helpText="Resultado = Receitas − Despesas. Como Receitas e Despesas neste resumo são calculadas sem IVA, o Resultado também é exibido sem IVA. A variação compara o real com a previsão; para despesas, gastar menos é melhor, por isso a cor positiva é invertida." forecast={forecastProfit} actual={actualProfit} icon={<BarChart3 className="h-4 w-4 text-primary" />} isProfit />}
        <div className="glass rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Estado do BP
            <HelpTooltip text="Pendentes = linhas do BP em rascunho. Aprovadas = linhas do BP aprovadas para este evento dentro da vista atual. Este card mostra contagem de linhas, sem cálculo de IVA." size={14} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Pendentes</span>
              <p className="font-mono font-bold text-sm text-warning">{draftCount}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Aprovadas</span>
              <p className="font-mono font-bold text-sm text-success">{approvedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="forecasts" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="forecasts">Previsões</TabsTrigger>
              <TabsTrigger value="comparison">Previsão vs Real</TabsTrigger>
            </TabsList>
            {/* BP Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={bpSearch}
                onChange={(e) => setBpSearch(e.target.value)}
                placeholder="Pesquisar no BP…"
                className="w-40 rounded-lg border border-border bg-background pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
              />
              {bpSearch && (
                <button onClick={() => setBpSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Partner filter */}
            {eventPartners.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={partnerFilter}
                  onChange={(e) => setPartnerFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Todos</option>
                  <option value="company">Empresa (Mundo Propício)</option>
                  {eventPartners.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.percentage}%)</option>
                  ))}
                </select>
              </div>
            )}
            {/* Ordenador da despesa (só eventos com sócios) */}
            {eventPartners.length > 0 && (
              <div className="flex items-center gap-1.5" title="Ordenador da despesa — quem ordenou o gasto. Aplica-se só a despesas.">
                <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={orderingFilter}
                  onChange={(e) => setOrderingFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value={ORDERING_FILTER_ALL}>Ordenador: todos</option>
                  <option value={ORDERING_FILTER_HOUSE}>{ORDERING_HOUSE_LABEL} (sem ordenador)</option>
                  {eventPartners.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Transaction link filter */}
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={txLinkFilter}
                onChange={(e) => setTxLinkFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">Todas</option>
                <option value="with_tx">Com transação</option>
                <option value="without_tx">Sem transação</option>
              </select>
            </div>
            {/* Formalidade filter — vista por estado de maturidade comercial.
                Os ícones (🔴🟠🔵🟢) ecoam o sistema de cores da BPRow para reconhecimento rápido. */}
            <div className="flex items-center gap-1.5" title="Filtrar por estado de formalidade comercial">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={formalidadeFilter}
                onChange={(e) => setFormalidadeFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">Todas formalidades</option>
                <option value="estimado">🔴 Estimado</option>
                <option value="negociacao">🟠 Em negociação</option>
                <option value="fechado">🔵 Fechado</option>
                <option value="pago_parcial">🟢 Pago parcial</option>
                <option value="pago_total">🟢 Pago total</option>
              </select>
            </div>
            {/* Tipo: Receitas / Despesas / Ambos.
                Esconde a secção respetiva e o card de Resumo correspondente. */}
            {!expenseOnly && (
              <div className="flex items-center gap-1.5" title="Filtrar por tipo (Receitas / Despesas / Ambos)">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as "all" | "income" | "expense")}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Receitas + Despesas</option>
                  <option value="income">Só Receitas</option>
                  <option value="expense">Só Despesas</option>
                </select>
              </div>
            )}
            {/* Master ↔ Master+Subs toggle (only on master with children) */}
            {childEventIds && childEventIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={includeSubsInBP ? "all" : "master"}
                  onChange={(e) => setIncludeSubsInBP(e.target.value === "all")}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  title="Alternar entre BP só do Master (rateios) ou consolidado Master + sub-eventos"
                >
                  <option value="master">Só Master</option>
                  <option value="all">Master + Subs</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Open the BP × Transactions report pre-filtered to this event,
                so users can audit per-line execution without leaving context. */}
            {/* Navigate internally and pass origin via state so the report
                shows a "Voltar" button back to this BP page. */}
            <button
              type="button"
              onClick={() =>
                navigate(`/relatorios/bp-transacoes?eventId=${eventId}`, {
                  state: { from: window.location.pathname + window.location.search, fromLabel: "BP do Evento" },
                })
              }
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              title="Abrir o relatório BP × Transações já filtrado por este evento"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              BP × Transações
            </button>
            {isAdmin && approvedWithoutTxCount > 0 && (eventStatus === "completed" || eventStatus === "active") && (
              <button
                onClick={handleGenerateHistorical}
                disabled={generateHistoricalMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <History className="h-3.5 w-3.5" />
                {generateHistoricalMutation.isPending ? "A gerar…" : `Gerar Transações (${approvedWithoutTxCount})`}
              </button>
            )}
            {canEditBP && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={handleImportXlsx}
                />
                <input
                  ref={linksFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={handleAttachLinksXlsx}
                />
                <button
                  onClick={() => setShowImportMode(true)}
                  disabled={importingXlsx || attachingLinks}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importingXlsx ? "A importar…" : attachingLinks ? "A anexar…" : "Importar XLSX"}
                </button>
                {isCoalaEvent && (
                  <button
                    onClick={() => setShowCoalaWizard(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                    title="Importador genérico Coala — qualquer versão (V13, V14…)"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Importar Coala
                  </button>
                )}
                {/* Bulk attachments are now handled inside the Implantação modal,
                    after the BP has been imported (motor unificado de matching). */}
                {pendingOrphansCount > 0 && (
                  <button
                    onClick={() => setShowOrphanResolver(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
                    title="Anexos do XLSX que ainda não foram vinculados a uma linha do BP. Para retentar com o motor atualizado, usa Importar XLSX → Só links/anexos."
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Anexos pendentes ({pendingOrphansCount})
                  </button>
                )}
                <button
                  onClick={() => setShowCopyModal(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar BP
                </button>
              </>
            )}
          </div>
        </div>


        <TabsContent value="forecasts">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">A carregar…</p>
          ) : (
            <div className="space-y-4">
              {/* Toggle Agrupada ↔ Grelha (Fase A.1 — apenas edição em massa) */}
              <div className="flex items-center justify-end">
                <div className="inline-flex rounded-md border border-border/60 bg-background/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setForecastsViewMode("grouped")}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                      forecastsViewMode === "grouped"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                    Agrupada
                  </button>
                  <button
                    type="button"
                    onClick={() => setForecastsViewMode("grid")}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                      forecastsViewMode === "grid"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Editor em grelha — edição em massa (Fase A.1)"
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    Grelha
                  </button>
                  {!isMobile && (
                    <button
                      type="button"
                      onClick={() => setForecastsViewMode("sheet")}
                      className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                        forecastsViewMode === "sheet"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title="Planilha estilo Excel"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Planilha
                    </button>
                  )}
                </div>
              </div>

              {forecastsViewMode === "grid" ? (
                <BPGridEditor
                  eventId={eventId}
                  forecasts={forecasts}
                  categories={categories as any}
                  canEditBP={canEditBP}
                  selectedVersionId={selectedVersionId}
                />
              ) : forecastsViewMode === "sheet" ? (
                <Suspense fallback={<p className="py-8 text-center text-muted-foreground">A carregar Planilha…</p>}>
                  <BPPlanilha eventId={eventId} canEdit={canEditBP} />
                </Suspense>
              ) : (
                <div className="space-y-6">

              {/* Income section */}
              {!expenseOnly && typeFilter !== "expense" && <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receitas Previstas</h3>
                    {canApprove && incomeForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-2 py-1">
                        <Checkbox
                          checked={incomeForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("income")}
                          className="h-3.5 w-3.5 border-warning data-[state=checked]:bg-warning data-[state=checked]:border-warning"
                        />
                        <span className="text-xs text-warning font-medium">Rascunhos p/ aprovar</span>
                      </div>
                    )}
                    {isAdmin && incomeForecasts.some((f) => isEligibleForBulkTx(f)) && (
                      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2 py-1">
                        <Checkbox
                          checked={(() => { const e = incomeForecasts.filter((f) => isEligibleForBulkTx(f)); return e.length > 0 && e.every((f) => selectedIds.has(f.id)); })()}
                          onCheckedChange={() => toggleSelectAllApproved("income")}
                          className="h-3.5 w-3.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <span className="text-xs text-primary font-medium">Aprovadas p/ gerar TX</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && incomeForecasts.some((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f)) && (
                      <button
                        onClick={handleBulkCreateTx}
                        disabled={bulkCreateTxMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/15 hover:bg-primary/25 transition-colors disabled:opacity-50"
                        title="Cria 1 transação por linha aprovada sem TX. Adicionais devem ser criadas pelo modal de Transações."
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {bulkCreateTxMutation.isPending ? "A criar…" : `Gerar Transações (${incomeForecasts.filter((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f)).length})`}
                      </button>
                    )}
                    {canApprove && incomeForecasts.some((f) => selectedIds.has(f.id) && f.status === "draft") && (
                      <button
                        onClick={handleBulkApprove}
                        disabled={bulkApproveMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/15 hover:bg-success/25 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovar ({incomeForecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft").length})
                      </button>
                    )}
                    {canEditBP && (
                      <BulkFormalidadePopover
                        forecastIds={incomeForecasts.filter((f) => selectedIds.has(f.id)).map((f) => f.id)}
                        eventId={eventId}
                      />
                    )}
                    {canEditBP && (
                      <button
                        onClick={() => startAdding("income")}
                        disabled={addingType === "income"}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                     <thead>
                      <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Descrição</th>
                        <th className="hidden pb-2 text-left font-medium sm:table-cell">Categoria</th>
                        <th className="pb-2 text-right font-medium">IVA %</th>
                        <th className="pb-2 text-right font-medium">Valor s/ IVA</th>
                        <th className="pb-2 text-right font-medium">IVA (€)</th>
                        <th className="pb-2 text-right font-medium">Total (€)</th>
                        <th className="pb-2 text-right font-medium w-28">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {incomeGroups.map((group) => {
                        const groupBase = group.items.reduce((s, f) => s + Number(f.amount), 0);
                        const groupIva = group.items.reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);
                        const showGroupHeader = incomeGroups.length > 1 || group.groupName !== (group.items[0]?.account_categories?.name);
                        return (
                          <React.Fragment key={group.groupName}>
                            {showGroupHeader && (
                              <tr className="bg-secondary/10 border-t border-border/30">
                                <td colSpan={3} className="py-2 pl-2 text-xs font-semibold text-foreground"><span className="text-muted-foreground mr-1">{group.groupCode}</span>{group.groupName}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">{formatCurrency(groupBase)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(groupIva)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">{formatCurrency(groupBase + groupIva)}</td>
                                <td />
                              </tr>
                            )}
                            {group.items.map((f) => (
                              f._orphanBucket ? (
                                <OrphanBucketRow key={f.id} item={f} isExpense={false} indented={showGroupHeader} isAdmin={canApprove} queryClient={queryClient} eventId={eventId} />
                              ) : f.is_overhead ? (
                                <ForecastRow key={`overhead-inc-${f.id}`} item={f} colorClass="text-warning/80" isExpense={false} onEdit={() => {}} onDelete={() => {}} onApprove={() => {}} isAdmin={false} isApproving={false} readOnly indented={showGroupHeader} eventTransactions={transactions} allForecasts={forecasts} />
                              ) : editingId === f.id ? (
                                <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                                  <td className="py-1.5 pr-2">
                                    <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                                  </td>
                                   <td className="hidden py-1.5 pr-2 sm:table-cell">
                                    <SearchableSelect
                                      options={incomeCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
                                      value={inlineForm.category_id}
                                      onValueChange={(v) => setInlineForm({ ...inlineForm, category_id: v })}
                                      placeholder="Categoria…"
                                      searchPlaceholder="Pesquisar conta…"
                                      className={inputClass}
                                    />
                                  </td>
                                   <td className="py-1.5 pr-2">
                                    <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`} disabled={canEditBPPartial && !canEditBP}>
                                      {ivaRates.map((r) => (<option key={r} value={String(r)}>{r}%</option>))}
                                    </select>
                                  </td>
                                   <td className="py-1.5 pr-2">
                                    <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} disabled={canEditBPPartial && !canEditBP} />
                                  </td>
                                  <td className="py-1.5 pr-2 text-right font-mono text-xs text-muted-foreground">
                                    {formatCurrency((parseFloat(inlineForm.amount) || 0) * (parseInt(inlineForm.iva_rate) || 0) / 100)}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right font-mono text-xs font-semibold">
                                    {formatCurrency((parseFloat(inlineForm.amount) || 0) * (1 + (parseInt(inlineForm.iva_rate) || 0) / 100))}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button onClick={handleInlineSave} disabled={saveMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                      <button onClick={cancelInline} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                <ForecastRow key={f.id} item={f} colorClass="text-success" onEdit={(canEditBP || canEditBPPartial) ? startEdit : undefined} onDelete={(canEditBP || canDeleteBP) ? (id, cascadeTransactionIds) => deleteMutation.mutate({ id, cascadeTransactionIds }) : undefined} onApprove={(item) => approveMutation.mutate(item)} isAdmin={canApprove} isApproving={approveMutation.isPending} isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} isEligibleForGen={isEligibleForBulkTx(f)} indented={showGroupHeader} onEditApproved={canApprove ? setEditApprovedForecast : undefined} canEditApproved={canEditApprovedBP} eventTransactions={transactions} assignedPartnerIds={forecastPartnerMap[f.id] ?? []} eventPartners={eventPartners} canManagePartners={canEditBP} queryClient={queryClient} eventId={eventId} canDeleteAlways={canDeleteBP} allForecasts={forecasts} onDistributeToSplits={childEventIds && childEventIds.length > 0 && canEditBP ? setDistributeTarget : undefined} onScheduleInstallments={canApprove ? setScheduleTarget : undefined} />
                              )
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {addingType === "income" && renderInlineRow("income")}
                      {ticketRevenue > 0 && (
                        <tr className="bg-success/5 border-t border-border/30">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <Ticket className="h-3.5 w-3.5 text-success shrink-0" />
                              <div>
                                <p className="font-medium text-success/80">Venda de Bilhetes</p>
                                <p className="text-xs text-muted-foreground">Calculado automaticamente da Bilheteira</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell text-xs">R01 - Venda de Bilhetes</td>
                          <td className="py-2.5 text-right text-muted-foreground text-xs">6%</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-success">{formatCurrency(ticketRevenueNet)}</td>
                          <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(ticketRevenueIva)}</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-success">{formatCurrency(ticketRevenueGross)}</td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                    {(incomeForecasts.length > 0 || addingType === "income" || ticketRevenue > 0) && (
                      <tfoot>
                        <tr className="border-t border-border/50">
                          <td colSpan={3} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
                          <td className="py-2.5 text-right font-mono font-bold text-success">{formatCurrency(totalForecastIncomeBase)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-success/70">{formatCurrency(totalForecastIncomeIva)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-success">{formatCurrency(totalForecastIncome)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {incomeForecasts.length === 0 && addingType !== "income" && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem receitas previstas</p>
                  )}
                </div>
              </div>}

              {/* Expense section */}
              {typeFilter !== "income" && <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Despesas Previstas</h3>
                    {canApprove && expenseForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-2 py-1">
                        <Checkbox
                          checked={expenseForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("expense")}
                          className="h-3.5 w-3.5 border-warning data-[state=checked]:bg-warning data-[state=checked]:border-warning"
                        />
                        <span className="text-xs text-warning font-medium">Rascunhos p/ aprovar</span>
                      </div>
                    )}
                    {isAdmin && expenseForecasts.some((f) => !f.cache_config_id && isEligibleForBulkTx(f)) && (
                      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2 py-1">
                        <Checkbox
                          checked={(() => { const e = expenseForecasts.filter((f) => !f.cache_config_id && isEligibleForBulkTx(f)); return e.length > 0 && e.every((f) => selectedIds.has(f.id)); })()}
                          onCheckedChange={() => toggleSelectAllApproved("expense")}
                          className="h-3.5 w-3.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <span className="text-xs text-primary font-medium">Aprovadas p/ gerar TX</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && expenseForecasts.some((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f)) && (
                      <button
                        onClick={handleBulkCreateTx}
                        disabled={bulkCreateTxMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/15 hover:bg-primary/25 transition-colors disabled:opacity-50"
                        title="Cria 1 transação por linha aprovada sem TX. Adicionais devem ser criadas pelo modal de Transações."
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {bulkCreateTxMutation.isPending ? "A criar…" : `Gerar Transações (${expenseForecasts.filter((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f)).length})`}
                      </button>
                    )}
                    {canApprove && expenseForecasts.some((f) => selectedIds.has(f.id) && f.status === "draft") && (
                      <button
                        onClick={handleBulkApprove}
                        disabled={bulkApproveMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/15 hover:bg-success/25 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovar ({expenseForecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft").length})
                      </button>
                    )}
                    {canEditBP && (
                      <BulkFormalidadePopover
                        forecastIds={expenseForecasts.filter((f) => selectedIds.has(f.id)).map((f) => f.id)}
                        eventId={eventId}
                      />
                    )}
                    {canEditBP && (
                      <button
                        onClick={() => startAdding("expense")}
                        disabled={addingType === "expense"}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 transition-colors disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </button>
                    )}
                    {canEditBP && childEventIds && childEventIds.length > 0 && (
                      <button
                        onClick={() => setShowAdoptCreate(true)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Consolidar
                      </button>
                    )}
                    {isAdmin && childEventIds && childEventIds.length > 0 && (
                      <button
                        onClick={() => setShowOrphans(true)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 transition-colors"
                        title="Listar todas as transações órfãs dos sub-eventos (todas as categorias)"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Órfãs
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setExportingPDF(true);
                        try {
                          await exportEventBPToPDF({ eventId, includeChildren: true });
                          toast({ title: "PDF do BP gerado" });
                        } catch (err: any) {
                          toast({ title: "Erro ao gerar PDF", description: err?.message ?? String(err), variant: "destructive" });
                        } finally {
                          setExportingPDF(false);
                        }
                      }}
                      disabled={exportingPDF}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      title="Exportar relatório de conferência do Business Plan em PDF"
                    >
                      <FileText className="h-3.5 w-3.5" /> {exportingPDF ? "A gerar…" : "PDF"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Descrição</th>
                        <th className="pb-2 text-left font-medium">Especificação</th>
                        <th className="hidden pb-2 text-left font-medium sm:table-cell">Categoria</th>
                        <th className="pb-2 text-right font-medium">IVA %</th>
                        <th className="pb-2 text-right font-medium">Valor s/ IVA</th>
                        <th className="pb-2 text-right font-medium">IVA (€)</th>
                        <th className="pb-2 text-right font-medium">Total (€)</th>
                        <th className="pb-2 text-right font-medium w-28">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {expenseGroups.map((group) => {
                        const groupBase = group.items.reduce((s, f) => s + Number(f.amount), 0);
                        const groupIva = group.items.reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);
                        const showGroupHeader = expenseGroups.length > 1 || group.groupName !== (group.items[0]?.account_categories?.name);
                        return (
                          <React.Fragment key={group.groupName}>
                            {showGroupHeader && (
                              <tr className="bg-secondary/10 border-t border-border/30">
                                <td colSpan={4} className="py-2 pl-2 text-xs font-semibold text-foreground">
                                  <span className="text-muted-foreground mr-1">{group.groupCode}</span>{group.groupName}
                                </td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">
                                  {formatCurrency(groupBase)}
                                </td>
                                <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(groupIva)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">
                                  {formatCurrency(groupBase + groupIva)}
                                </td>
                                <td />
                              </tr>
                            )}
                            {group.items.map((f) => (
                              f._orphanBucket ? (
                                <OrphanBucketRow key={f.id} item={f} isExpense indented={showGroupHeader} isAdmin={canApprove} queryClient={queryClient} eventId={eventId} />
                              ) : f._overhead_via_master ? (
                                <ForecastRow key={`oh-master-${f.id}`} item={f} colorClass="text-warning/70" isExpense onEdit={() => {}} onDelete={() => {}} onApprove={() => {}} isAdmin={false} isApproving={false} readOnly indented={showGroupHeader} eventTransactions={transactions} allForecasts={forecasts} />
                              ) : f.is_overhead ? (
                                <ForecastRow key={`overhead-${f.id}`} item={f} colorClass="text-warning/80" isExpense onEdit={() => {}} onDelete={() => {}} onApprove={() => {}} isAdmin={false} isApproving={false} readOnly indented={showGroupHeader} eventTransactions={transactions} allForecasts={forecasts} />
                              ) : f._prorated ? (
                                <ForecastRow key={`prorated-${f.id}`} item={f} colorClass="text-warning/60" isExpense onEdit={() => {}} onDelete={() => {}} onApprove={() => {}} isAdmin={false} isApproving={false} readOnly indented={showGroupHeader} eventTransactions={transactions} allForecasts={forecasts} />
                              ) : editingId === f.id ? (
                                <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                                  <td className="py-1.5 pr-2">
                                    <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input value={inlineForm.specification} onChange={(e) => setInlineForm({ ...inlineForm, specification: e.target.value })} className={inputClass} placeholder="Especificação…" disabled={canEditBPPartial && !canEditBP} />
                                  </td>
                                   <td className="hidden py-1.5 pr-2 sm:table-cell">
                                     <SearchableSelect
                                       options={expenseCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
                                       value={inlineForm.category_id}
                                       onValueChange={(v) => setInlineForm({ ...inlineForm, category_id: v })}
                                       placeholder="Categoria…"
                                       searchPlaceholder="Pesquisar conta…"
                                       className={inputClass}
                                     />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`} disabled={canEditBPPartial && !canEditBP}>
                                      {ivaRates.map((r) => (<option key={r} value={String(r)}>{r}%</option>))}
                                    </select>
                                  </td>
                                   <td className="py-1.5 pr-2">
                                    <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} disabled={canEditBPPartial && !canEditBP} />
                                  </td>
                                  <td className="py-1.5 pr-2 text-right font-mono text-xs text-muted-foreground">
                                    {formatCurrency((parseFloat(inlineForm.amount) || 0) * (parseInt(inlineForm.iva_rate) || 0) / 100)}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right font-mono text-xs font-semibold">
                                    {formatCurrency((parseFloat(inlineForm.amount) || 0) * (1 + (parseInt(inlineForm.iva_rate) || 0) / 100))}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button onClick={handleInlineSave} disabled={saveMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                      <button onClick={cancelInline} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                                    </div>
                                  </td>
                                </tr>
                              ) : f.cache_config_id ? (
                                <ForecastRow key={f.id} item={f} colorClass="text-warning" isExpense onEdit={undefined} onDelete={undefined} onApprove={(item) => approveMutation.mutate(item)} isAdmin={canApprove} isApproving={approveMutation.isPending} readOnly indented={showGroupHeader} eventTransactions={transactions} assignedPartnerIds={forecastPartnerMap[f.id] ?? []} eventPartners={eventPartners} canManagePartners={canEditBP} queryClient={queryClient} eventId={eventId} />
                              ) : (
                                <React.Fragment key={f.id}>
                                  <ForecastRow item={f} colorClass="text-warning" isExpense onEdit={(canEditBP || canEditBPPartial) ? startEdit : undefined} onDelete={(canEditBP || canDeleteBP) ? (id, cascadeTransactionIds) => deleteMutation.mutate({ id, cascadeTransactionIds }) : undefined} onApprove={(item) => approveMutation.mutate(item)} isAdmin={canApprove} isApproving={approveMutation.isPending} isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} isEligibleForGen={isEligibleForBulkTx(f)} indented={showGroupHeader} onEditApproved={canApprove ? setEditApprovedForecast : undefined} canEditApproved={canEditApprovedBP} eventTransactions={transactions} assignedPartnerIds={forecastPartnerMap[f.id] ?? []} eventPartners={eventPartners} canManagePartners={canEditBP} queryClient={queryClient} eventId={eventId} canDeleteAlways={canDeleteBP} allForecasts={forecasts} onDistributeToSplits={childEventIds && childEventIds.length > 0 && canEditBP ? setDistributeTarget : undefined} onAdoptFromSplits={childEventIds && childEventIds.length > 0 && canEditBP ? (item) => setAdoptTarget({ id: item.id, description: item.description, category_id: item.category_id, type: item.type }) : undefined} adoptedChildren={adoptedByMaster[f.id] ?? []} onScheduleInstallments={canApprove ? setScheduleTarget : undefined} />
                                  {/* Adopted sub-event children */}
                                  {(adoptedByMaster[f.id] ?? []).map((af: any) => (
                                    <tr key={`adopted-${af.id}`} className="bg-primary/5 opacity-70 hover:opacity-100 transition-all">
                                      <td className="py-2 pl-8 pr-3">
                                        <div className="flex items-center gap-2">
                                          <Layers className="h-3 w-3 text-primary/60 shrink-0" />
                                          <div>
                                            <p className="text-xs font-medium">
                                              {af.account_categories?.code && <span className="text-muted-foreground mr-1">{af.account_categories.code}</span>}
                                              {af.description}
                                            </p>
                                            <p className="text-[10px] text-primary/60">{subEventNameMap[af.event_id] || "Sub-evento"}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2 pr-3 text-muted-foreground text-xs">{af.specification || "—"}</td>
                                      <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell text-xs">{af.account_categories ? `${af.account_categories.code} ${af.account_categories.name}` : "—"}</td>
                                      <td className="py-2 text-right text-muted-foreground text-xs">{af.iva_rate}%</td>
                                      <td className="py-2 text-right font-mono text-xs text-warning/60">{formatCurrency(Number(af.amount))}</td>
                                      <td className="py-2 text-right font-mono text-[10px] text-muted-foreground">{formatCurrency(Number(af.amount) * Number(af.iva_rate) / 100)}</td>
                                      <td className="py-2 text-right font-mono text-xs text-warning/60">{formatCurrency(Number(af.amount) * (1 + Number(af.iva_rate) / 100))}</td>
                                      <td className="py-2 text-right">
                                        {canEditBP && (
                                          <button
                                            onClick={async () => {
                                              await (supabase.from("event_forecasts").update({ master_forecast_id: null } as any) as any).eq("id", af.id);
                                              queryClient.invalidateQueries({ queryKey: ["adopted_forecasts"] });
                                              queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
                                              toast({ title: "Linha desvinculada do Master" });
                                            }}
                                            className="rounded p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                            title="Desvincular do Master"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              )
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {addingType === "expense" && renderInlineRow("expense")}
                    </tbody>
                    {(expenseForecasts.length > 0 || addingType === "expense" || filteredProratedParentExpenses.length > 0) && (
                      <tfoot>
                        <tr className="border-t border-border/50">
                          <td colSpan={4} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning">{formatCurrency(totalForecastExpenseBase)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning/70">{formatCurrency(totalForecastExpenseIva)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning">{formatCurrency(totalForecastExpenseBase + totalForecastExpenseIva)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {expenseForecasts.length === 0 && addingType !== "expense" && filteredProratedParentExpenses.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem despesas previstas</p>
                  )}
                </div>
              </div>}

              {/* BP summary row */}
              {(incomeForecasts.length > 0 || expenseForecasts.length > 0) && (
                <div className="glass rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">Resultado Previsto</span>
                  <span className={`font-mono text-lg font-bold ${forecastProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(forecastProfit)}
                  </span>
                </div>
              )}
            </div>
              )}
            </div>
          )}
        </TabsContent>


        <TabsContent value="comparison">
          <div className="mb-3 flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">Overhead</span>
            <select
              value={includeOverheadInComparison ? "with" : "without"}
              onChange={(e) => setIncludeOverheadInComparison(e.target.value === "with")}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              title="Incluir/excluir linhas marcadas como Overhead na comparação Previsto vs Real"
            >
              <option value="without">Sem overhead (Vista Empresa)</option>
              <option value="with">Com overhead (Vista Sócio)</option>
            </select>
          </div>
          <ComparisonTable data={comparisonData} onOpenTransactionDocuments={setComparisonDocumentsTransaction} />
        </TabsContent>
      </Tabs>

      {editApprovedForecast && (
        <ForecastEditModal
          forecast={editApprovedForecast}
          categories={categories}
          onClose={() => setEditApprovedForecast(null)}
        />
      )}

      {showCopyModal && (
        <CopyPLModal
          targetEventId={eventId}
          targetEventName={eventName || "este evento"}
          existingForecastCount={forecasts.length}
          onClose={() => setShowCopyModal(false)}
        />
      )}

      {/* Distribute to splits confirmation dialog */}
      {distributeTarget && childEventIds && childEventIds.length > 0 && (
        <AlertDialog open={!!distributeTarget} onOpenChange={(open) => { if (!open) setDistributeTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reverter para sub-eventos</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Distribuir <strong>"{distributeTarget.description}"</strong> ({formatCurrency(Number(distributeTarget.amount))} s/ IVA) igualmente por {childEventIds.length} sub-evento(s):
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {subEventNames.map((se: any) => {
                      const perSplit = Number(distributeTarget.amount) / childEventIds.length;
                      const cityName = (se.cities as any)?.name;
                      return (
                        <div key={se.id} className="rounded border border-border bg-muted/30 px-3 py-1.5 text-xs flex justify-between">
                          <span className="truncate">{se.name}{cityName ? ` (${cityName})` : ""}</span>
                          <span className="font-mono font-semibold shrink-0 ml-2">{formatCurrency(Math.round(perSplit * 100) / 100)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">A linha será removida do Master e criada como rascunho em cada sub-evento.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => distributeToSplitsMutation.mutate(distributeTarget)}
                disabled={distributeToSplitsMutation.isPending}
              >
                {distributeToSplitsMutation.isPending ? "A distribuir…" : "Distribuir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Adopt forecasts modals */}
      {adoptTarget && childEventIds && (
        <AdoptForecastsModal
          open={!!adoptTarget}
          onOpenChange={(open) => { if (!open) setAdoptTarget(null); }}
          masterEventId={eventId}
          childEventIds={childEventIds}
          masterForecast={adoptTarget}
          mode="adopt"
          categories={categories}
        />
      )}
      {showAdoptCreate && childEventIds && (
        <AdoptForecastsModal
          open={showAdoptCreate}
          onOpenChange={setShowAdoptCreate}
          masterEventId={eventId}
          childEventIds={childEventIds}
          mode="create"
          categories={categories}
        />
      )}
      {showOrphans && childEventIds && (
        <OrphanTransactionsModal
          open={showOrphans}
          onOpenChange={setShowOrphans}
          masterEventId={eventId}
          childEventIds={childEventIds}
        />
      )}
      <BPImportModeDialog
        open={showImportMode}
        onOpenChange={setShowImportMode}
        onConfirm={(mode, instructions) => {
          setPendingImportMode(mode);
          setPendingImportInstructions(instructions);
          // iOS Safari requires the file input .click() to happen inside the
          // same synchronous user-gesture callback. Calling it via setTimeout
          // breaks the gesture and the picker silently fails to open. We
          // trigger the click synchronously and then close the dialog.
          if (mode === "links") {
            linksFileInputRef.current?.click();
          } else {
            fileInputRef.current?.click();
          }
          setShowImportMode(false);
        }}
      />
      {/* Sheet mapping modal removed — full import flow now lives at /admin/implantacao/:id */}

      <OrphanAttachmentsResolver
        open={showOrphanResolver}
        onOpenChange={setShowOrphanResolver}
        eventId={eventId}
        childEventIds={childEventIds}
        parentEventId={parentEventId}
      />

      <CoalaImportWizard
        open={showCoalaWizard}
        onOpenChange={setShowCoalaWizard}
        eventId={eventId}
        eventName={eventName}
      />

      <GenerateHistoricalModal
        open={historicalModalOpen}
        onOpenChange={setHistoricalModalOpen}
        approvedCount={eligibleForHistoricalGen.length}
        isGenerating={generateHistoricalMutation.isPending}
        onConfirm={(xlsxRows) => generateHistoricalMutation.mutate(xlsxRows)}
      />

      <ScheduleInstallmentsModal
        open={!!scheduleTarget}
        onOpenChange={(o) => { if (!o) setScheduleTarget(null); }}
        forecast={scheduleTarget}
        isSubmitting={scheduleInstallmentsMutation.isPending}
        onConfirm={(installments) => {
          if (!scheduleTarget) return;
          scheduleInstallmentsMutation.mutate({ forecast: scheduleTarget, installments });
        }}
      />

      <MarkAsFechadoDialog
        open={!!pendingFechado}
        onOpenChange={(o) => { if (!o) setPendingFechado(null); }}
        eligibleForecastIds={pendingFechado?.ids ?? []}
        eventId={eventId}
        triggerLabel={pendingFechado?.trigger}
      />

      <PromoteToMasterModal
        open={showPromoteModal}
        onOpenChange={setShowPromoteModal}
        candidates={promoteCandidates}
        onConfirm={async (selected) => {
          if (selected.length === 0) return;
          let promoted = 0;
          const errors: string[] = [];
          for (const cand of selected) {
            const { error: insertErr } = await supabase
              .from("event_forecasts")
              .insert({
                event_id: eventId,
                type: "expense" as const,
                description: cand.description,
                amount: cand.amount,
                iva_rate: cand.ivaRate,
                category_id: cand.categoryId,
                status: "draft",
              } as any);
            if (insertErr) {
              errors.push(`${cand.description}: ${insertErr.message}`);
              continue;
            }
            const { error: delErr } = await supabase
              .from("event_forecasts")
              .delete()
              .in("id", cand.forecastIds);
            if (delErr) {
              errors.push(`${cand.description} (cleanup): ${delErr.message}`);
              continue;
            }
            promoted++;
          }
          queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
          toast({
            title: `${promoted} linha(s) promovida(s) ao Master`,
            description: errors.length > 0 ? errors[0] : undefined,
            variant: errors.length > 0 && promoted === 0 ? "destructive" : undefined,
          });
        }}
      />
      {comparisonDocumentsTransaction && (
        <TransactionDocumentsModal
          transactionId={comparisonDocumentsTransaction.id}
          transactionDescription={comparisonDocumentsTransaction.description}
          onClose={() => setComparisonDocumentsTransaction(null)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ForecastRow({ item, colorClass, isExpense, onEdit, onDelete, onApprove, isAdmin, isApproving, isSelected, onToggleSelect, isEligibleForGen = true, indented, readOnly, onEditApproved, canEditApproved, eventTransactions, assignedPartnerIds = [], eventPartners = [], canManagePartners, queryClient, eventId, canDeleteAlways, allForecasts = [], onDistributeToSplits, onAdoptFromSplits, adoptedChildren = [], onScheduleInstallments }: {
  item: any; colorClass: string; isExpense?: boolean;
  onEdit?: (item: any) => void; onDelete?: (id: string, cascadeTransactionIds?: string[]) => void;
  onApprove: (item: any) => void; isAdmin: boolean; isApproving: boolean;
  isSelected?: boolean; onToggleSelect?: (id: string) => void;
  /** When false on an approved row, hide the bulk-select checkbox (line already has TX or matches one). */
  isEligibleForGen?: boolean;
  indented?: boolean; readOnly?: boolean; onEditApproved?: (item: any) => void;
  canEditApproved?: boolean; eventTransactions?: any[];
  assignedPartnerIds?: string[]; eventPartners?: { id: string; name: string; percentage: number }[];
  canManagePartners?: boolean; queryClient?: any; eventId?: string;
  canDeleteAlways?: boolean; allForecasts?: any[];
  onDistributeToSplits?: (item: any) => void;
  onAdoptFromSplits?: (item: any) => void;
  adoptedChildren?: any[];
  onScheduleInstallments?: (item: any) => void;
}) {
  const { isAdmin: isAdminAuth, isManager: isManagerAuth } = useAuth();
  const canSeeOverhead = isAdminAuth || isManagerAuth;
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showPartnerPopover, setShowPartnerPopover] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<any>(null);
  const [documentsTransaction, setDocumentsTransaction] = useState<any>(null);
  const [auditTransactionId, setAuditTransactionId] = useState<string | null>(null);
  const isDraft = item.status === "draft";
  const isApproved = item.status === "approved";
  const [showNotesAttachments, setShowNotesAttachments] = useState(false);

  // Count of native uploads for this BP line (event_forecast_attachments).
  const { data: uploadCount = 0 } = useQuery({
    queryKey: ["event_forecast_attachments_counts", item.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("event_forecast_attachments" as any)
        .select("id", { count: "exact", head: true })
        .eq("forecast_id", item.id);
      return count ?? 0;
    },
    enabled: !item._readonly && !item._prorated && !item._overhead_via_master,
    staleTime: 60_000,
  });

  const refLinkCount = Array.isArray(item.attachment_refs)
    ? (item.attachment_refs as any[]).filter((r) => r && typeof r.url === "string").length
    : 0;
  const hasNotes = !!(item.notes && String(item.notes).trim().length > 0);
  const totalAttachments = uploadCount + refLinkCount;

  const togglePartner = async (partnerId: string) => {
    if (!queryClient || !eventId) return;
    const isAssigned = assignedPartnerIds.includes(partnerId);
    if (isAssigned) {
      await supabase
        .from("event_forecast_partners")
        .delete()
        .eq("forecast_id", item.id)
        .eq("partner_id", partnerId);
    } else {
      await supabase
        .from("event_forecast_partners")
        .insert({ forecast_id: item.id, partner_id: partnerId });
    }
    queryClient.invalidateQueries({ queryKey: ["forecast_partners", eventId] });
  };

  // Find transactions matching this forecast line.
  // Strategy: union of (a) direct transaction_id back-link and
  // (b) category + description match. This is critical for installment
  // schedules where ONE BP line generates N transactions but only the
  // first is back-linked via event_forecasts.transaction_id — the
  // remaining N-1 must still appear here so balance, paid checks and
  // cascade delete work correctly.
  const matchingTransactions = useMemo(() => {
    if (!eventTransactions) return [];

    // Scope transactions to the same event as the forecast (or null for master splits)
    // This prevents sub-event transactions from appearing under master forecasts
    const allowedEventIds = new Set([item.event_id, null, item._master_event_id].filter(Boolean));
    const scopedTransactions = eventTransactions.filter(
      (t: any) => allowedEventIds.has(t.event_id)
    );

    // (a) Direct back-link (always include, even if event scope would have excluded it)
    const directTx = item.transaction_id
      ? eventTransactions.filter((t: any) => t.id === item.transaction_id)
      : [];

    // (b) Category + description match
    if (!item.category_id) return directTx;
    const sameCat = scopedTransactions.filter(
      (t: any) => t.category_id === item.category_id && t.type === item.type
    );
    
    // If only one forecast uses this category, show all transactions for it
    // Otherwise, try to match by description
    const forecastsWithSameCat = allForecasts?.filter(
      (f: any) => f.category_id === item.category_id && f.type === item.type && f.event_id === item.event_id
    ) ?? [];
    
    // Helper to merge directTx with another list, de-duplicated by id
    const mergeWithDirect = (list: any[]) => {
      if (directTx.length === 0) return list;
      const ids = new Set(list.map((t: any) => t.id));
      return [...list, ...directTx.filter((t: any) => !ids.has(t.id))];
    };

    if (forecastsWithSameCat.length <= 1) return mergeWithDirect(sameCat);

    // Multiple forecasts share this category — assign each transaction to the
    // forecast with the BEST description match, so a transaction is never shown
    // under more than one BP line.
    // Score normalizado (NFD sem acentos, lowercase, sem caracteres especiais)
    // — SSoT em src/lib/bp-tx-matching.ts. Empates ou score 0 deixam a TX órfã,
    // que aparece no bucket "Sem linha específica" da categoria.
    const scoreMatch = scoreDescriptionMatch;

    const matched = sameCat.filter((t: any) => {
      const myScore = scoreMatch(item.description, t.description);
      if (myScore <= 0) return false;
      // Must beat every other forecast that shares this category
      const bestOther = forecastsWithSameCat.reduce((max: number, f: any) => {
        if (f.id === item.id) return max;
        const s = scoreMatch(f.description, t.description);
        return s > max ? s : max;
      }, 0);
      return myScore > bestOther;
    });

    return mergeWithDirect(matched);
  }, [eventTransactions, item.category_id, item.type, item.transaction_id, item.description, item.event_id, item.id, allForecasts]);

  const hasMatchingTx = matchingTransactions.length > 0;

  // For admin delete: check if any transactions are paid
  const paidTransactions = useMemo(() => matchingTransactions.filter((t: any) => {
    const txTotal = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const txPaid = Number(t.paid_amount ?? 0);
    return t.status === "paid" || txPaid >= txTotal - 0.01;
  }), [matchingTransactions]);
  const unpaidTransactions = useMemo(() => matchingTransactions.filter((t: any) => {
    const txTotal = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const txPaid = Number(t.paid_amount ?? 0);
    return t.status !== "paid" && txPaid < txTotal - 0.01;
  }), [matchingTransactions]);
  const hasPaidTx = paidTransactions.length > 0;

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["forecast_audit_log", item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_audit_log" as any)
        .select("*")
        .eq("forecast_id", item.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: showAuditLog,
  });

  const colCount = isExpense ? 8 : 7;

  // ── Sync attachments from BP line → linked transactions
  // Copies external links (attachment_refs) from this BP row into transaction_documents
  // for every matching transaction. Used when transactions were generated before
  // attachments existed on the BP, or via flows that didn't propagate them.
  const linkCount = Array.isArray(item.attachment_refs)
    ? (item.attachment_refs as any[]).filter((r) => r && typeof r.url === "string").length
    : 0;
  const canSyncAttachments = linkCount > 0 && hasMatchingTx;
  const [syncingAttachments, setSyncingAttachments] = useState(false);

  const handleSyncAttachments = async () => {
    if (!canSyncAttachments || syncingAttachments) return;
    setSyncingAttachments(true);
    try {
      const refUrls = (item.attachment_refs as any[])
        .map((r) => (r && typeof r.url === "string" ? r.url.trim() : ""))
        .filter((u) => /^https?:\/\//i.test(u));
      if (refUrls.length === 0) {
        toast({ title: "Sem links válidos", description: "Esta linha não tem URLs http(s) anexadas.", variant: "destructive" });
        return;
      }
      const txIds = matchingTransactions.map((t: any) => t.id);
      // Pre-load existing ref:// docs to avoid duplicates per transaction
      const { data: existing } = await supabase
        .from("transaction_documents")
        .select("transaction_id, file_url")
        .in("transaction_id", txIds);
      const existingByTx = new Map<string, Set<string>>();
      for (const d of existing ?? []) {
        const tid = (d as any).transaction_id as string;
        const url = String((d as any).file_url ?? "");
        if (!existingByTx.has(tid)) existingByTx.set(tid, new Set());
        existingByTx.get(tid)!.add(url);
      }
      const rows: any[] = [];
      for (const tid of txIds) {
        const seen = existingByTx.get(tid) ?? new Set<string>();
        for (const url of refUrls) {
          const refUrl = `ref://${url}`;
          if (seen.has(refUrl)) continue;
          rows.push({
            transaction_id: tid,
            file_url: refUrl,
            file_name: "Link externo",
            file_size: 0,
            mime_type: "text/uri-list",
          });
        }
      }
      if (rows.length === 0) {
        toast({ title: "Já sincronizado", description: "Todos os links já estão nas transações vinculadas." });
        return;
      }
      const { error } = await supabase.from("transaction_documents").insert(rows as any);
      if (error) throw error;

      // Back-link the BP line to its first transaction so future syncs / cascades work.
      if (!item.transaction_id && matchingTransactions.length > 0) {
        await supabase
          .from("event_forecasts")
          .update({ transaction_id: matchingTransactions[0].id } as any)
          .eq("id", item.id);
      }

      toast({
        title: "Anexos sincronizados",
        description: `${rows.length} link(s) propagado(s) para ${txIds.length} transação(ões).`,
      });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual"] });
      queryClient.invalidateQueries({ queryKey: ["bp_native_doc_counts"] });
      queryClient.invalidateQueries({ queryKey: ["transaction_documents"] });
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSyncingAttachments(false);
    }
  };

  return (
    <>
      <tr className={readOnly ? "bg-primary/5 opacity-70" : isApproved ? "group opacity-60 hover:opacity-100 hover:bg-muted/30 transition-all" : "group hover:bg-muted/30 transition-colors"}>
        <td className={`py-2.5 pr-3 ${indented ? "pl-4" : ""}`}>
           <div className="flex items-center gap-2">
            {readOnly ? (
              <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : isDraft && isAdmin && onToggleSelect ? (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(item.id)}
                  className="h-3.5 w-3.5 shrink-0 border-warning data-[state=checked]:bg-warning data-[state=checked]:border-warning"
                />
                <span className="inline-flex items-center rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Rascunho</span>
              </div>
            ) : isApproved && isAdmin && onToggleSelect && isEligibleForGen ? (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(item.id)}
                  className="h-3.5 w-3.5 shrink-0 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="inline-flex items-center rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Aprovada</span>
              </div>
            ) : isApproved ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-warning shrink-0" />
            )}
            <div>
              <p className="font-medium">
                {item.account_categories?.code && <span className="text-xs text-muted-foreground mr-1.5">{item.account_categories.code}</span>}
                {item.description}
                {!item._readonly && !item._prorated && !item._overhead_via_master && (
                  <span className="ml-2 align-middle">
                    <FormalidadeBadge
                      forecastId={item.id}
                      eventId={item.event_id ?? eventId ?? ""}
                      current={item.formalidade}
                      readOnly={readOnly}
                    />
                  </span>
                )}
                {item.is_overhead && canSeeOverhead && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider align-middle"
                    title="Rateio de Overhead — não impacta resultado da empresa, mas entra no acerto com sócios. Visível apenas para admin/manager."
                  >
                    Overhead
                  </span>
                )}
                {item._overhead_via_master && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider align-middle"
                    title="Fatia proporcional (÷N splits) de um Rateio de Overhead lançado no evento Master. Read-only — edite no Master."
                  >
                    via Master
                  </span>
                )}
                {/* "Sem TX" badge — flags approved BP lines that still have no
                    linked transaction (neither direct transaction_id nor a
                    description-matched one in this event). Helps users find
                    pending executions at a glance. */}
                {isApproved && !item.transaction_id && !hasMatchingTx && !item._overhead_via_master && !item._prorated && !item._readonly && (
                  <span
                    className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider align-middle"
                    title="Linha aprovada sem transação real associada — ainda por executar."
                  >
                    <AlertTriangle className="h-2.5 w-2.5" /> Sem TX
                  </span>
                )}
                {!item._readonly && !item._prorated && !item._overhead_via_master && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowNotesAttachments(true); }}
                    className="ml-2 inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 align-middle text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                    title={
                      `Observações e anexos${hasNotes ? " · com observação" : ""}` +
                      (totalAttachments > 0 ? ` · ${uploadCount} documento(s) + ${refLinkCount} link(s)` : "")
                    }
                  >
                    {hasNotes && <StickyNote className="h-2.5 w-2.5 text-warning" />}
                    <Paperclip className="h-2.5 w-2.5" />
                    {totalAttachments > 0 && (
                      <span className="font-semibold text-foreground">{totalAttachments}</span>
                    )}
                  </button>
                )}
              </p>
              {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
              {hasMatchingTx && (
                <button onClick={() => setShowPayments(!showPayments)} className="text-xs flex items-center gap-1 mt-0.5 hover:underline cursor-pointer">
                  <FileText className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-primary/70 font-medium">{matchingTransactions.length} transação(ões)</span>
                  {paidTransactions.length > 0 && <span className="text-success text-[10px]">({paidTransactions.length} paga{paidTransactions.length > 1 ? "s" : ""})</span>}
                </button>
              )}
              {!hasMatchingTx && isApproved && item.transaction_id && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Link2 className="h-3 w-3" /> Transação criada
                </p>
              )}
              {canSyncAttachments && (
                <div className="mt-0.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSyncAttachments(); }}
                    disabled={syncingAttachments}
                    className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 text-warning hover:bg-warning/25 px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50"
                    title={`Copiar ${linkCount} link(s) do BP para ${matchingTransactions.length} transação(ões) vinculada(s)`}
                  >
                    <ArrowDownRight className="h-2.5 w-2.5" />
                    {syncingAttachments ? "A sincronizar…" : "Sincronizar anexos"}
                  </button>
                </div>
              )}
              {/* Partner badges */}
              {assignedPartnerIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {assignedPartnerIds.map((pid) => {
                    const partner = eventPartners.find((p) => p.id === pid);
                    return partner ? (
                      <span key={pid} className="inline-flex items-center gap-0.5 rounded-full bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 text-[10px] font-medium">
                        <Users className="h-2.5 w-2.5" />{partner.name}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        </td>
        {isExpense && (
          <td className="py-2.5 pr-3 text-muted-foreground text-xs">
            {item.specification || "—"}
          </td>
        )}
        <td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell text-xs">
          {item.account_categories ? `${item.account_categories.code} ${item.account_categories.name}` : "—"}
        </td>
        <td className="py-2.5 text-right text-muted-foreground text-xs">{item.iva_rate}%</td>
        <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
          <span className="inline-flex items-center justify-end gap-1.5">
            {formatCurrency(Number(item.amount))}
            <CurrencyBadge currency={item.currency} originalAmount={item.original_amount} fxRate={item.fx_rate} />
          </span>
        </td>
        <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">
          {formatCurrency(Number(item.amount) * Number(item.iva_rate) / 100)}
        </td>
        <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
          {formatCurrency(Number(item.amount) * (1 + Number(item.iva_rate) / 100))}
        </td>
        <td className="py-2.5 text-right">
          {readOnly ? (
            <div className="flex justify-end items-center gap-1">
              {hasMatchingTx && (
                <button
                  onClick={() => setShowPayments(!showPayments)}
                  className={`rounded p-1 hover:bg-primary/20 ${showPayments ? "bg-primary/10" : ""}`}
                  title={`Ver transações (${matchingTransactions.length})`}
                >
                  <svg className="h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                </button>
              )}
              <span className="text-[10px] text-primary/60 italic">rateio</span>
            </div>
          ) : (
            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {hasMatchingTx && (
                <button
                  onClick={() => setShowPayments(!showPayments)}
                  className={`rounded p-1 hover:bg-primary/20 ${showPayments ? "bg-primary/10" : ""}`}
                  title={`Ver transações (${matchingTransactions.length})`}
                >
                  <svg className="h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                </button>
              )}
              {/* Partner assign button */}
              {canManagePartners && eventPartners.length > 0 && (
                <Popover open={showPartnerPopover} onOpenChange={setShowPartnerPopover}>
                  <PopoverTrigger asChild>
                    <button
                      className={`rounded p-1 hover:bg-indigo-500/20 ${assignedPartnerIds.length > 0 ? "text-indigo-400" : "text-muted-foreground"}`}
                      title="Atribuir sócios"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end" onInteractOutside={() => setShowPartnerPopover(false)} onPointerDownOutside={() => setShowPartnerPopover(false)}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Sócios Responsáveis</p>
                    <div className="space-y-1">
                      {eventPartners.map((p) => {
                        const isAssigned = assignedPartnerIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { togglePartner(p.id); setShowPartnerPopover(false); }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                          >
                            <Checkbox checked={isAssigned} className="h-3.5 w-3.5 pointer-events-none" />
                            <span className="truncate">{p.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{p.percentage}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {onDistributeToSplits && !item.cache_config_id && (
                hasMatchingTx ? (
                  <button
                    onClick={() => {
                      toast({
                        title: "Não é possível reverter",
                        description: "Esta linha possui transações associadas. Remova ou desvincule as transações antes de reverter para os sub-eventos.",
                        variant: "destructive",
                      });
                    }}
                    className="rounded p-1 hover:bg-destructive/20"
                    title="Reverter para sub-eventos (bloqueado — transações associadas)"
                  >
                    <ArrowDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ) : (
                  <button
                    onClick={() => onDistributeToSplits(item)}
                    className="rounded p-1 hover:bg-blue-500/20"
                    title="Reverter para sub-eventos"
                  >
                    <ArrowDownRight className="h-3.5 w-3.5 text-blue-400" />
                  </button>
                )
              )}
              {onAdoptFromSplits && !item.cache_config_id && (
                <button
                  onClick={() => onAdoptFromSplits(item)}
                  className="rounded p-1 hover:bg-primary/20"
                  title="Adotar linhas dos sub-eventos"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
              {isApproved && isAdmin && isEligibleForGen && !item.transaction_id && !hasMatchingTx && onScheduleInstallments && (
                <button
                  onClick={() => onScheduleInstallments(item)}
                  className="rounded p-1 hover:bg-primary/20"
                  title={isExpense ? "Programar pagamentos (parcelas)" : "Programar recebimentos (parcelas)"}
                >
                  <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
              {isApproved && isAdmin && onEditApproved && (
                <button
                  onClick={() => onEditApproved(item)}
                  className="rounded p-1 hover:bg-primary/20"
                  title="Alterar valor (aprovado)"
                >
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
              {!readOnly && <FormalidadeHistoryPopover forecastId={item.id} />}
              {isApproved && !readOnly && (
                <button
                  onClick={() => setShowAuditLog(!showAuditLog)}
                  className="rounded p-1 hover:bg-secondary"
                  title="Histórico de alterações"
                >
                  {showAuditLog ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              )}
              {isDraft && isAdmin && (
                <button
                  onClick={() => onApprove(item)}
                  disabled={isApproving}
                  className="rounded px-2 py-1 text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
                  title="Aprovar e criar transação"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
              )}
              {isDraft && onEdit && onDelete && (
                <>
                  <button onClick={() => onEdit(item)} className="rounded p-1 hover:bg-secondary" title="Editar">
                    <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <DeleteForecastDialog
                    item={item}
                    onDelete={onDelete}
                    hasPaidTx={hasPaidTx}
                    unpaidTransactions={unpaidTransactions}
                    paidTransactions={paidTransactions}
                    title="Remover linha do BP"
                  />
                </>
              )}
              {isApproved && canEditApproved && onEdit && onDelete && (
                <>
                  <button onClick={() => onEdit(item)} className="rounded p-1 hover:bg-secondary" title="Editar (aprovado)">
                    <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <DeleteForecastDialog
                    item={item}
                    onDelete={onDelete}
                    hasPaidTx={hasPaidTx}
                    unpaidTransactions={unpaidTransactions}
                    paidTransactions={paidTransactions}
                    title="Remover linha aprovada"
                  />
                </>
              )}
              {/* Admin-only: delete even when event is locked and line has no edit/onDelete from normal flow */}
              {canDeleteAlways && !isDraft && !canEditApproved && onDelete && (
                <DeleteForecastDialog
                  item={item}
                  onDelete={onDelete}
                  hasPaidTx={hasPaidTx}
                  unpaidTransactions={unpaidTransactions}
                  paidTransactions={paidTransactions}
                  title="Remover linha do BP"
                />
              )}
            </div>
          )}
        </td>
      </tr>
      {showPayments && matchingTransactions.length > 0 && (
        <tr>
          <td colSpan={colCount} className="py-0">
            <div className="bg-primary/5 border-l-2 border-primary/30 ml-6 my-1 rounded-r-lg px-3 py-2 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-primary/80 flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  Transações ({matchingTransactions.length})
                </p>
              </div>
              <div className="space-y-1.5">
                {matchingTransactions.map((tx: any) => {
                  const txTotal = Number(tx.amount) * (1 + Number(tx.iva_rate) / 100);
                  const txPaid = Number(tx.paid_amount ?? 0);
                  const txBalance = Math.max(0, txTotal - txPaid);
                  const isPaid = tx.status === "paid" || txBalance < 0.01;
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const isOverdue = !isPaid && tx.due_date && tx.due_date.slice(0, 10) < todayStr;
                  return (
                    <div
                      key={tx.id}
                      className="rounded-lg border border-border/30 bg-background/50 px-3 py-2 hover:bg-primary/5 hover:border-primary/30 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setViewingTransaction(tx)}
                        className="block w-full text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{tx.description}</p>
                            {tx.specification && <p className="text-[10px] text-muted-foreground truncate">{tx.specification}</p>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isPaid ? "bg-success/15 text-success" :
                              isOverdue ? "bg-destructive/15 text-destructive" :
                              "bg-blue-500/15 text-blue-400"
                            }`}>
                              {isPaid ? "Pago" : isOverdue ? "Atrasado" : "A Pagar"}
                            </span>
                            <span className="font-mono text-xs font-semibold">{formatCurrency(txTotal)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground">
                          {tx.due_date && <span>Vcto: {format(new Date(tx.due_date + "T12:00:00"), "dd/MM/yyyy")}</span>}
                          <span>Pago: {formatCurrency(txPaid)}</span>
                          {txBalance > 0.01 && <span className="text-warning">Aberto: {formatCurrency(txBalance)}</span>}
                          {tx.payment_date && <span>Pago em: {format(new Date(tx.payment_date + "T12:00:00"), "dd/MM/yyyy")}</span>}
                        </div>
                      </button>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <TransactionAttachmentButton transactionId={tx.id} onClick={() => setDocumentsTransaction(tx)} />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setAuditTransactionId(tx.id); }}
                          className="rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="Histórico de alterações"
                        >
                          <History className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                <span className="text-muted-foreground font-medium">Total transações</span>
                <span className="font-mono font-bold">{formatCurrency(matchingTransactions.reduce((s: number, tx: any) => s + Number(tx.amount) * (1 + Number(tx.iva_rate) / 100), 0))}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {showAuditLog && (
        <tr>
          <td colSpan={colCount} className="py-0">
            <div className="bg-muted/20 border-l-2 border-primary/30 ml-6 my-1 rounded-r-lg px-3 py-2 space-y-1.5 animate-fade-in">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sem alterações registadas</p>
              ) : (
                auditLogs.map((log: any) => (
                  <div key={log.id} className="text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <History className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{log.field_name}:</span>
                      <span className="text-muted-foreground">{log.old_value}</span>
                      <span>→</span>
                      <span className="font-medium">{log.new_value}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}</span>
                    </div>
                    {log.observation && (
                      <p className="text-muted-foreground italic pl-5">"{log.observation}"</p>
                    )}
                    <p className="text-muted-foreground text-[10px] pl-5">por {log.changed_by}</p>
                  </div>
                ))
              )}
            </div>
          </td>
        </tr>
      )}
      {viewingTransaction && (
        <TransactionEditModal
          transaction={viewingTransaction}
          onClose={() => {
            setViewingTransaction(null);
            if (queryClient && eventId) {
              queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
              queryClient.invalidateQueries({ queryKey: ["event-transactions", eventId] });
            }
          }}
          isAdmin={isAdmin}
        />
      )}
      {documentsTransaction && (
        <TransactionDocumentsModal
          transactionId={documentsTransaction.id}
          transactionDescription={documentsTransaction.description}
          onClose={() => setDocumentsTransaction(null)}
        />
      )}
      {auditTransactionId && (
        <TransactionAuditModal
          transactionId={auditTransactionId}
          onClose={() => setAuditTransactionId(null)}
        />
      )}
      {showNotesAttachments && (
        <BPNotesAttachmentsModal
          open={showNotesAttachments}
          onOpenChange={setShowNotesAttachments}
          forecast={item}
        />
      )}
    </>
  );
}

function SummaryCard({ label, helpText, forecast, actual, icon, isProfit }: {
  label: string; helpText?: string; forecast: number; actual: number; icon: React.ReactNode; isProfit?: boolean;
}) {
  const variance = actual - forecast;
  const variancePct = forecast !== 0 ? (variance / Math.abs(forecast)) * 100 : 0;
  const isPositive = isProfit ? variance >= 0 : (label === "Despesas" ? variance <= 0 : variance >= 0);

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}{helpText ? <HelpTooltip text={helpText} size={14} /> : null}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Previsão</span>
          <p className="font-mono font-bold text-sm">{formatCurrency(forecast)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Real</span>
          <p className="font-mono font-bold text-sm">{formatCurrency(actual)}</p>
        </div>
      </div>
      {forecast > 0 && (
        <div className={`text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
          {variance >= 0 ? "+" : ""}{formatCurrency(variance)} ({variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%)
        </div>
      )}
    </div>
  );
}

/**
 * Linha sintética por categoria: agrupa as transações que nenhuma linha do BP
 * reclama (sem back-link e sem ganhar o match de descrição, ou categoria sem BP).
 * Só tem realizado — não é editável, aprovável nem entra no previsto.
 */
function OrphanBucketRow({ item, isExpense, indented, isAdmin, queryClient, eventId }: {
  item: any;
  isExpense?: boolean;
  indented?: boolean;
  isAdmin?: boolean;
  queryClient?: any;
  eventId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<any>(null);
  const [documentsTransaction, setDocumentsTransaction] = useState<any>(null);
  const txs: any[] = item._orphanTx ?? [];
  const colCount = isExpense ? 8 : 7;
  const realized = txs.reduce((s, t) => s + Number(t.amount) * (1 + Number(t.iva_rate ?? 0) / 100), 0);

  return (
    <>
      <tr className="bg-muted/20 hover:bg-muted/30 transition-colors">
        <td colSpan={colCount - 1} className={`py-2 pr-3 ${indented ? "pl-6" : "pl-2"}`}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
            title="Transações desta categoria sem linha específica do BP"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <div>
              <p className="text-xs font-medium italic text-muted-foreground">
                {item.account_categories?.code && <span className="mr-1">{item.account_categories.code}</span>}
                Sem linha específica
                <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium not-italic text-muted-foreground">
                  {txs.length} transação(ões)
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Sem previsto · Realizado <span className="font-mono">{formatCurrency(realized)}</span>
              </p>
            </div>
          </button>
        </td>
        <td className="py-2 text-right pr-2">
          <span className="text-[10px] text-muted-foreground">—</span>
        </td>
      </tr>
      {open && txs.length > 0 && (
        <tr>
          <td colSpan={colCount} className="py-0">
            <div className="my-1 ml-6 space-y-1.5 rounded-r-lg border-l-2 border-muted-foreground/30 bg-muted/20 px-3 py-2 animate-fade-in">
              {txs.map((tx: any) => {
                const txTotal = Number(tx.amount) * (1 + Number(tx.iva_rate ?? 0) / 100);
                const txPaid = Number(tx.paid_amount ?? 0);
                const isPaid = tx.status === "paid" || txTotal - txPaid < 0.01;
                return (
                  <div key={tx.id} className="rounded-lg border border-border/30 bg-background/50 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5">
                    <button type="button" onClick={() => setViewingTransaction(tx)} className="block w-full cursor-pointer text-left">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{tx.description}</p>
                          {tx.specification && <p className="truncate text-[10px] text-muted-foreground">{tx.specification}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isPaid ? "bg-success/15 text-success" : "bg-blue-500/15 text-blue-400"}`}>
                            {isPaid ? "Pago" : "A Pagar"}
                          </span>
                          <span className="font-mono text-xs font-semibold">{formatCurrency(txTotal)}</span>
                        </div>
                      </div>
                    </button>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <TransactionAttachmentButton transactionId={tx.id} onClick={() => setDocumentsTransaction(tx)} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-border/30 pt-1 text-xs">
                <span className="font-medium text-muted-foreground">Total transações</span>
                <span className="font-mono font-bold">{formatCurrency(realized)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {viewingTransaction && (
        <TransactionEditModal
          transaction={viewingTransaction}
          onClose={() => {
            setViewingTransaction(null);
            if (queryClient && eventId) {
              queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
              queryClient.invalidateQueries({ queryKey: ["event-transactions", eventId] });
            }
          }}
          isAdmin={isAdmin}
        />
      )}
      {documentsTransaction && (
        <TransactionDocumentsModal
          transactionId={documentsTransaction.id}
          transactionDescription={documentsTransaction.description}
          onClose={() => setDocumentsTransaction(null)}
        />
      )}
    </>
  );
}

/* ── Comparison ── */

// Pure helper: returns transactions that match a single BP line.
// SSoT em src/lib/bp-tx-matching.ts (normalização sem acentos + winner-takes-all).
// Re-exportado aqui por retrocompatibilidade com imports existentes.
export { findMatchingTransactionsForForecast };

interface ComparisonRow {
  categoryCode: string;
  categoryName: string;
  groupName: string;
  groupCode: string;
  type: string;
  forecast: number;
  actual: number;
  variance: number;
  transactions: any[];
}

function buildComparison(forecasts: any[], transactions: any[], categories: any[]): ComparisonRow[] {
  const lookup = buildCategoryLookup(categories);
  const map: Record<string, ComparisonRow> = {};
  const getKey = (type: string, catId: string | null) => `${type}_${catId || "none"}`;
  const getCatInfo = (catId: string | null) => {
    if (!catId) return { code: "—", name: "Sem categoria", groupName: "Sem categoria", groupCode: "Z" };
    const info = lookup[catId];
    return info ? { code: info.code, name: info.name, groupName: info.groupName, groupCode: info.groupCode } : { code: "—", name: "Desconhecida", groupName: "Sem categoria", groupCode: "Z" };
  };

  forecasts.forEach((f) => {
    const key = getKey(f.type, f.category_id);
    const cat = getCatInfo(f.category_id);
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, groupName: cat.groupName, groupCode: cat.groupCode, type: f.type, forecast: 0, actual: 0, variance: 0, transactions: [] };
    map[key].forecast += Number(f.amount);
  });
  transactions.forEach((t) => {
    const key = getKey(t.type, t.category_id);
    const cat = getCatInfo(t.category_id);
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, groupName: cat.groupName, groupCode: cat.groupCode, type: t.type, forecast: 0, actual: 0, variance: 0, transactions: [] };
    map[key].actual += Number(t.amount);
    map[key].transactions.push(t);
  });

  return Object.values(map)
    .map((r) => ({
      ...r,
      variance: r.actual - r.forecast,
      transactions: r.transactions.slice().sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? ""))),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return compareHierarchicalCodes(a.groupCode, b.groupCode) || compareHierarchicalCodes(a.categoryCode, b.categoryCode);
    });
}

function ComparisonTable({ data, onOpenTransactionDocuments }: { data: ComparisonRow[]; onOpenTransactionDocuments?: (tx: any) => void }) {
  const incomeRows = data.filter((r) => r.type === "income");
  const expenseRows = data.filter((r) => r.type === "expense");
  const totalFI = incomeRows.reduce((s, r) => s + r.forecast, 0);
  const totalAI = incomeRows.reduce((s, r) => s + r.actual, 0);
  const totalFE = expenseRows.reduce((s, r) => s + r.forecast, 0);
  const totalAE = expenseRows.reduce((s, r) => s + r.actual, 0);

  // Group rows by L2 parent
  const groupRows = (rows: ComparisonRow[]) => {
    const groups: { groupName: string; rows: ComparisonRow[]; totalF: number; totalA: number; txCount: number }[] = [];
    const gMap: Record<string, typeof groups[0]> = {};
    rows.forEach((r) => {
      if (!gMap[r.groupName]) {
        gMap[r.groupName] = { groupName: r.groupName, rows: [], totalF: 0, totalA: 0, txCount: 0 };
        groups.push(gMap[r.groupName]);
      }
      gMap[r.groupName].rows.push(r);
      gMap[r.groupName].totalF += r.forecast;
      gMap[r.groupName].totalA += r.actual;
      gMap[r.groupName].txCount += r.transactions.length;
    });
    return groups;
  };

  const incomeGroups = groupRows(incomeRows);
  const expenseGroups = groupRows(expenseRows);

  // Expansion state: groups (L2) and rows (L3) — independent toggles
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (data.length === 0) return <p className="py-8 text-center text-muted-foreground">Adicione previsões e transações para ver a comparação.</p>;

  const renderGroupedRows = (groups: ReturnType<typeof groupRows>, isIncome?: boolean) => {
    return groups.map((group) => {
      const showHeader = groups.length > 1 || (group.rows.length > 1 || group.rows[0]?.categoryName !== group.groupName);
      const groupOpen = expandedGroups.has(group.groupName);
      return (
        <React.Fragment key={group.groupName}>
          {showHeader && (
            <tr className="bg-secondary/10 border-t border-border/30 cursor-pointer hover:bg-secondary/20" onClick={() => toggleGroup(group.groupName)}>
              <td className="py-1.5 pl-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1">
                  {groupOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {group.groupName}
                  {group.txCount > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground">({group.txCount} tx)</span>
                  )}
                </span>
              </td>
              <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(group.totalF)}</td>
              <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(group.totalA)}</td>
              <td className={`py-1.5 text-right font-mono text-xs font-semibold ${isIncome ? (group.totalA - group.totalF >= 0 ? "text-success" : "text-destructive") : (group.totalA - group.totalF <= 0 ? "text-success" : "text-destructive")}`}>
                {formatCurrency(group.totalA - group.totalF)}
              </td>
              <td />
            </tr>
          )}
          {(!showHeader || groupOpen) && group.rows.map((r) => {
            const rowKey = `${r.type}-${r.categoryCode}`;
            const rowOpen = expandedRows.has(rowKey);
            const canExpand = r.transactions.length > 0;
            return (
              <React.Fragment key={rowKey}>
                <ComparisonRowItem
                  row={r}
                  isIncome={isIncome}
                  indented={showHeader}
                  expanded={rowOpen}
                  canExpand={canExpand}
                  onToggle={() => canExpand && toggleRow(rowKey)}
                />
                {rowOpen && r.transactions.map((tx) => {
                  const ivaRate = Number(tx.iva_rate ?? 0);
                  const base = Number(tx.amount);
                  const gross = base * (1 + ivaRate / 100);
                  const isPaid = tx.status === "paid";
                  const dateStr = tx.date ? format(new Date(tx.date + "T00:00:00"), "dd/MM/yyyy") : "—";
                  return (
                    <tr key={tx.id} className="border-b border-border/10 bg-muted/20 text-xs">
                      <td className={`py-1.5 ${showHeader ? "pl-12" : "pl-8"}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-muted-foreground tabular-nums">{dateStr}</span>
                          <span className="truncate">{tx.description}</span>
                          {isPaid ? (
                            <span className="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-semibold uppercase">Pago</span>
                          ) : (
                            <span className="rounded-full bg-warning/15 text-warning px-1.5 py-0.5 text-[9px] font-semibold uppercase">{tx.status === "approved" ? "A pagar" : tx.status}</span>
                          )}
                          <TransactionAttachmentButton transactionId={tx.id} onClick={() => onOpenTransactionDocuments?.(tx)} />
                        </span>
                      </td>
                      <td />
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{formatCurrency(base)}</td>
                      <td className="py-1.5 text-right font-mono text-[10px] text-muted-foreground" colSpan={2}>
                        {ivaRate > 0 ? `c/IVA ${formatCurrency(gross)}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="glass rounded-xl p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 text-left font-medium">Categoria</th>
            <th className="pb-2 text-right font-medium">Previsão</th>
            <th className="pb-2 text-right font-medium">Real</th>
            <th className="pb-2 text-right font-medium">Variação</th>
            <th className="pb-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {incomeRows.length > 0 && (
            <>
              <tr><td colSpan={5} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-success">Receitas</td></tr>
              {renderGroupedRows(incomeGroups, true)}
              <tr className="border-t border-border/50 font-bold">
                <td className="py-2 text-xs text-muted-foreground">Subtotal Receitas</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalFI)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalAI)}</td>
                <td className={`py-2 text-right font-mono ${totalAI - totalFI >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totalAI - totalFI)}</td>
                <td className="py-2 text-right text-xs">{totalFI > 0 ? `${(((totalAI - totalFI) / totalFI) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            </>
          )}
          {expenseRows.length > 0 && (
            <>
              <tr><td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-warning">Despesas</td></tr>
              {renderGroupedRows(expenseGroups, false)}
              <tr className="border-t border-border/50 font-bold">
                <td className="py-2 text-xs text-muted-foreground">Subtotal Despesas</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalFE)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(totalAE)}</td>
                <td className={`py-2 text-right font-mono ${totalAE - totalFE <= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totalAE - totalFE)}</td>
                <td className="py-2 text-right text-xs">{totalFE > 0 ? `${(((totalAE - totalFE) / totalFE) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            </>
          )}
          <tr className="border-t-2 border-primary/30 font-bold">
            <td className="py-3 text-sm">Resultado Líquido</td>
            <td className="py-3 text-right font-mono">{formatCurrency(totalFI - totalFE)}</td>
            <td className="py-3 text-right font-mono">{formatCurrency(totalAI - totalAE)}</td>
            <td className={`py-3 text-right font-mono ${(totalAI - totalAE) - (totalFI - totalFE) >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency((totalAI - totalAE) - (totalFI - totalFE))}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonRowItem({ row, isIncome, indented, expanded, canExpand, onToggle }: { row: ComparisonRow; isIncome?: boolean; indented?: boolean; expanded?: boolean; canExpand?: boolean; onToggle?: () => void }) {
  const variancePct = row.forecast > 0 ? (row.variance / row.forecast) * 100 : 0;
  const isPositive = isIncome ? row.variance >= 0 : row.variance <= 0;
  return (
    <tr className={`border-b border-border/20 ${canExpand ? "cursor-pointer hover:bg-muted/30" : ""}`} onClick={canExpand ? onToggle : undefined}>
      <td className={`py-2 pr-3 ${indented ? "pl-4" : ""}`}>
        <span className="inline-flex items-center gap-1">
          {canExpand ? (expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />) : <span className="inline-block w-3" />}
          <span className="text-xs text-muted-foreground mr-1.5">{row.categoryCode}</span>
          {row.categoryName}
          {row.transactions.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-1">({row.transactions.length} tx)</span>
          )}
        </span>
      </td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.forecast)}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.actual)}</td>
      <td className={`py-2 text-right font-mono ${isPositive ? "text-success" : "text-destructive"}`}>{row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}</td>
      <td className={`py-2 text-right text-xs ${isPositive ? "text-success" : "text-destructive"}`}>{row.forecast > 0 ? `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%` : "—"}</td>
    </tr>
  );
}

/* ── Delete Forecast Dialog with transaction check ── */
function DeleteForecastDialog({ item, onDelete, hasPaidTx, unpaidTransactions, paidTransactions, title }: {
  item: any;
  onDelete: (id: string, cascadeTransactionIds?: string[]) => void;
  hasPaidTx: boolean;
  unpaidTransactions: any[];
  paidTransactions: any[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const hasUnpaidTx = unpaidTransactions.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button className="rounded p-1 hover:bg-destructive/20" title="Remover">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {hasPaidTx ? (
                <>
                  <p>Não é possível remover "{item.description}" porque existem transações <strong>liquidadas</strong> associadas:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {paidTransactions.map((tx: any) => (
                      <div key={tx.id} className="rounded border border-border bg-muted/30 px-3 py-1.5 text-xs flex justify-between">
                        <span className="truncate">{tx.description}</span>
                        <span className="font-mono font-semibold shrink-0 ml-2">{formatCurrency(Number(tx.amount) * (1 + Number(tx.iva_rate) / 100))}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : hasUnpaidTx ? (
                <>
                  <p>"{item.description}" possui {unpaidTransactions.length} transação(ões) <strong>não liquidada(s)</strong> que serão removidas em conjunto:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {unpaidTransactions.map((tx: any) => (
                      <div key={tx.id} className="rounded border border-border bg-muted/30 px-3 py-1.5 text-xs flex justify-between">
                        <span className="truncate">{tx.description}</span>
                        <span className="font-mono font-semibold shrink-0 ml-2">{formatCurrency(Number(tx.amount) * (1 + Number(tx.iva_rate) / 100))}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Tanto a linha do BP como as transações serão movidas para a Lixeira.</p>
                </>
              ) : (
                <p>Tem a certeza que deseja remover "{item.description}"? Esta ação pode ser revertida através da Lixeira.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {!hasPaidTx && (
            <AlertDialogAction
              onClick={() => onDelete(item.id, hasUnpaidTx ? unpaidTransactions.map((t: any) => t.id) : undefined)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hasUnpaidTx ? "Remover tudo" : "Remover"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
