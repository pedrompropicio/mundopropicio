import React, { useState, useRef, useEffect, useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, TrendingUp, TrendingDown, BarChart3, Trash2, CheckCircle2, Clock, Link2, Check, X, Ticket, Music, Copy, Layers, History, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction, type CachePLLine } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes, sortByHierarchicalCode } from "@/lib/utils";
import { CopyPLModal } from "@/components/CopyPLModal";
import { parseXlsxPL, importPLToEvent } from "@/lib/import-pl-xlsx";

interface InlineForm {
  type: string;
  description: string;
  amount: string;
  iva_rate: string;
  category_id: string;
  notes: string;
  specification: string;
}

const emptyInline: InlineForm = {
  type: "expense",
  description: "",
  amount: "",
  iva_rate: "23",
  category_id: "",
  notes: "",
  specification: "",
};

interface Props {
  eventId: string;
  eventDate: string;
  eventName?: string;
  childEventIds?: string[];
  expenseOnly?: boolean;
  parentEventId?: string;
  eventStatus?: string;
}

export function EventForecast({ eventId, eventDate, eventName, childEventIds, expenseOnly, parentEventId, eventStatus }: Props) {
  const [addingType, setAddingType] = useState<"income" | "expense" | null>(null);
  const [inlineForm, setInlineForm] = useState<InlineForm>(emptyInline);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { isAdmin, isManager, user } = useAuth();
  const canApprove = isAdmin || isManager;

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

  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["event_forecasts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", eventId)
        .order("type")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["event_transactions_actual", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch ticket zones and lots for auto-calculated ticket revenue
  const ticketEventIds = [eventId, ...(childEventIds || [])];
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

  // Fetch cache configs for this event and its child events (for consolidated P&L)
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["event_cache_configs", ticketEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs")
        .select("*")
        .in("event_id", ticketEventIds)
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

  // Fetch parent event's expense forecasts for proration display on sub-events
  const { data: parentForecasts = [] } = useQuery({
    queryKey: ["parent_event_forecasts", parentEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", parentEventId!)
        .eq("type", "expense")
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!parentEventId,
  });

  // Count sibling sub-events for proration
  const { data: siblingCount = 1 } = useQuery({
    queryKey: ["sibling_count", parentEventId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("parent_event_id", parentEventId!);
      if (error) throw error;
      return count || 1;
    },
    enabled: !!parentEventId,
  });

  // Prorated parent expenses (amount / number of sub-events)
  const proratedParentExpenses = useMemo(() => {
    if (!parentEventId || parentForecasts.length === 0) return [];
    return parentForecasts.map((f: any) => ({
      ...f,
      amount: Number(f.amount) / siblingCount,
      _prorated: true,
      _originalAmount: Number(f.amount),
      _siblingCount: siblingCount,
    }));
  }, [parentForecasts, siblingCount, parentEventId]);

  // Ticket revenue: price includes IVA ("por dentro"), extract net value for P&L
  const ticketRevenueGross = ticketLots.reduce((s, l) => s + l.quantity * Number(l.price), 0);
  const ticketRevenueNet = ticketLots.reduce((s, l) => {
    const rate = Number((l as any).iva_rate ?? 6);
    return s + l.quantity * (Number(l.price) / (1 + rate / 100));
  }, 0);
  const ticketRevenueIva = ticketRevenueGross - ticketRevenueNet;
  const ticketRevenue = ticketRevenueNet; // P&L uses net values

  const parentCacheConfigs = useMemo(
    () => cacheConfigs.filter((config) => config.event_id === parentEventId),
    [cacheConfigs, parentEventId]
  );

  const parentCacheLines = useMemo(() => {
    if (!parentEventId || parentCacheConfigs.length === 0) return [] as CachePLLine[];
    return calculateCacheLinesForPL(
      parentCacheConfigs,
      cacheDeductions,
      ticketRevenueNet,
      parentForecasts.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
      ticketRevenueGross
    );
  }, [parentEventId, parentCacheConfigs, cacheDeductions, ticketRevenueNet, ticketRevenueGross, parentForecasts]);

  const proratedParentCacheExpenses = useMemo(() => {
    if (!parentEventId || parentCacheLines.length === 0) return [];
    return parentCacheLines.map((line, index) => ({
      id: `parent-cache-${index}`,
      event_id: parentEventId,
      type: "expense",
      description: line.artistName || "Cachê",
      amount: Number(line.amount) / siblingCount,
      iva_rate: 0,
      status: "approved",
      category_id: categories.find((category: any) => category.code === "2.1.01")?.id ?? null,
      _prorated: true,
      _originalAmount: Number(line.amount),
      _siblingCount: siblingCount,
    }));
  }, [parentEventId, parentCacheLines, siblingCount, categories]);

  const allProratedParentExpenses = useMemo(
    () => [...proratedParentExpenses, ...proratedParentCacheExpenses],
    [proratedParentExpenses, proratedParentCacheExpenses]
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

  // Calculate cache lines (after ticketRevenueNet is available)
  const cacheLines = useMemo(() => {
    return calculateCacheLinesForPL(
      cacheConfigs,
      cacheDeductions,
      ticketRevenueNet,
      forecasts.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
      ticketRevenueGross
    );
  }, [cacheConfigs, cacheDeductions, ticketRevenueNet, ticketRevenueGross, forecasts]);
  const totalCacheAmount = useMemo(() => cacheLines.reduce((s, c) => s + c.amount, 0), [cacheLines]);

  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: InlineForm; id: string | null }) => {
      const isCompletedEvent = eventStatus === "completed";
      const payload: any = {
        event_id: eventId,
        type: form.type,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        iva_rate: parseInt(form.iva_rate) || 23,
        category_id: form.category_id || null,
        notes: form.notes || null,
        specification: form.type === "expense" ? (form.specification || null) : null,
      };
      // Auto-approve forecasts on completed (historical) events
      if (!id && isCompletedEvent) {
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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_detail", eventId] });
      toast({ title: "Previsão aprovada!" });
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
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  const handleBulkApprove = () => {
    const items = forecasts.filter((f) => selectedIds.has(f.id) && f.status === "draft");
    if (items.length === 0) return;
    bulkApproveMutation.mutate(items);
  };

  const generateHistoricalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-historical-transactions", {
        body: { event_id: eventId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: `${data.created} transação(ões) gerada(s) com sucesso!`, description: data.errors?.length > 0 ? `${data.errors.length} erro(s) parciais` : undefined });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao gerar transações", description: err.message, variant: "destructive" });
    },
  });

  const handleGenerateHistorical = () => {
    const approvedWithoutTx = forecasts.filter((f) => f.status === "approved" && !f.transaction_id);
    if (approvedWithoutTx.length === 0) {
      toast({ title: "Nenhuma previsão aprovada sem transação vinculada", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Isto irá criar ${approvedWithoutTx.length} transação(ões) na conta "Histórico / Ajuste" com estado Pago. Continuar?`)) return;
    generateHistoricalMutation.mutate();
  };

  const handleImportXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportingXlsx(true);
    try {
      const buffer = await file.arrayBuffer();
      const sheets = parseXlsxPL(buffer);
      const allWarnings = sheets.flatMap((s) => s.warnings);
      if (allWarnings.length > 0) {
        toast({ title: "Avisos na leitura", description: allWarnings.join("; "), variant: "destructive" });
      }
      const sheetsWithData = sheets.filter((s) => s.rows.length > 0);
      if (sheetsWithData.length === 0) {
        toast({ title: "Nenhuma linha válida encontrada no ficheiro", variant: "destructive" });
        return;
      }

      // Parent event with child events: distribute tabs to matching sub-events
      if (childEventIds && childEventIds.length > 0 && sheetsWithData.length > 1) {
        const { data: childEvents } = await supabase
          .from("events")
          .select("id, name, date, city_id, cities:city_id(name)")
          .in("id", childEventIds);
        
        if (!childEvents || childEvents.length === 0) {
          toast({ title: "Nenhum sub-evento encontrado", variant: "destructive" });
          return;
        }

        const normStr = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        // Match each sheet to a child event by name similarity
        const matchedSheets: { sheet: typeof sheetsWithData[0]; childEvent: any }[] = [];
        const unmatchedSheets: string[] = [];

        for (const sheet of sheetsWithData) {
          const sheetNorm = normStr(sheet.sheetName);
          const match = childEvents.find((ce: any) => {
            const cityName = (ce.cities as any)?.name || "";
            const eventName = ce.name || "";
            return normStr(cityName) === sheetNorm || normStr(eventName).includes(sheetNorm) || sheetNorm.includes(normStr(cityName));
          });
          if (match) {
            matchedSheets.push({ sheet, childEvent: match });
          } else {
            unmatchedSheets.push(sheet.sheetName);
          }
        }

        if (matchedSheets.length === 0) {
          toast({ title: "Nenhuma aba corresponde aos sub-eventos", description: `Abas: ${sheetsWithData.map(s => s.sheetName).join(", ")}. Sub-eventos: ${childEvents.map((ce: any) => (ce.cities as any)?.name || ce.name).join(", ")}`, variant: "destructive" });
          return;
        }

        const summary = matchedSheets.map(m => `${m.sheet.sheetName} → ${(m.childEvent.cities as any)?.name || m.childEvent.name} (${m.sheet.rows.length} linhas)`).join("\n");
        const unmatchedMsg = unmatchedSheets.length > 0 ? `\n\nAbas sem correspondência (ignoradas): ${unmatchedSheets.join(", ")}` : "";
        if (!window.confirm(`Distribuir importação:\n\n${summary}${unmatchedMsg}\n\nConfirmar?`)) return;

        let totalCreated = 0;
        const allErrors: string[] = [];
        for (const { sheet, childEvent } of matchedSheets) {
          const result = await importPLToEvent(sheet.rows, childEvent.id, childEvent.date, categories, user?.email || "system", eventId);
          totalCreated += result.created;
          allErrors.push(...result.errors);
          queryClient.invalidateQueries({ queryKey: ["event_forecasts", childEvent.id] });
          queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", childEvent.id] });
        }
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        toast({
          title: `${totalCreated} linha(s) importada(s) em ${matchedSheets.length} sub-evento(s)!`,
          description: allErrors.length > 0 ? `${allErrors.length} erro(s): ${allErrors[0]}` : undefined,
        });
      } else {
        // Single event import (sub-event or simple event)
        let selectedRows = sheetsWithData[0].rows;
        if (sheetsWithData.length > 1) {
          const sheetNames = sheetsWithData.map((s) => `${s.sheetName} (${s.rows.length} linhas)`).join("\n");
          const choice = window.prompt(
            `O ficheiro tem ${sheetsWithData.length} abas com dados:\n\n${sheetNames}\n\nDigite o número da aba (1-${sheetsWithData.length}) ou "todas" para importar tudo:`,
            "1"
          );
          if (!choice) return;
          if (choice.toLowerCase() === "todas" || choice.toLowerCase() === "all") {
            selectedRows = sheetsWithData.flatMap((s) => s.rows);
          } else {
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < sheetsWithData.length) {
              selectedRows = sheetsWithData[idx].rows;
            } else {
              toast({ title: "Opção inválida", variant: "destructive" });
              return;
            }
          }
        }
        if (!window.confirm(`Importar ${selectedRows.length} linha(s) de despesa para o BP deste evento?`)) return;
        const result = await importPLToEvent(selectedRows, eventId, eventDate, categories, user?.email || "system", parentEventId);
        queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
        queryClient.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        toast({
          title: `${result.created} linha(s) importada(s) com sucesso!`,
          description: result.errors.length > 0 ? `${result.errors.length} erro(s): ${result.errors[0]}` : undefined,
        });
      }
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, variant: "destructive" });
    } finally {
      setImportingXlsx(false);
    }
  };

  const approvedWithoutTxCount = forecasts.filter((f) => f.status === "approved" && !f.transaction_id).length;

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

  const incomeForecasts = forecasts.filter((f) => f.type === "income");
  const expenseForecasts = forecasts.filter((f) => f.type === "expense");

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

    // Sort items within each group by category code
    groups.forEach((g) => {
      g.items.sort((a, b) => {
        const codeA = catLookup[a.category_id]?.code ?? "Z.Z";
        const codeB = catLookup[b.category_id]?.code ?? "Z.Z";
        return compareHierarchicalCodes(codeA, codeB);
      });
    });

    return groups.sort((a, b) => compareHierarchicalCodes(a.groupCode || "Z", b.groupCode || "Z"));
  };

  const incomeGroups = useMemo(() => groupForecasts(incomeForecasts), [incomeForecasts, catLookup]);
  const expenseGroups = useMemo(() => {
    const groups = groupForecasts(expenseForecasts);
    // Ensure "Artístico" group exists if there are cache lines
    if (cacheLines.length > 0 && !groups.some(g => g.groupCode === "2.1")) {
      groups.push({ groupName: "Artístico", groupCode: "2.1", items: [] });
      groups.sort((a, b) => compareHierarchicalCodes(a.groupCode || "Z", b.groupCode || "Z"));
    }
    return groups;
  }, [expenseForecasts, catLookup, cacheLines]);

  // Groups for prorated parent expenses (separate from own expenses)
  const proratedExpenseGroups = useMemo(() => {
    if (allProratedParentExpenses.length === 0) return [];
    return groupForecasts(allProratedParentExpenses);
  }, [allProratedParentExpenses, catLookup]);

  const proratedExpenseBase = allProratedParentExpenses.reduce((s: number, f: any) => s + Number(f.amount), 0);
  const proratedExpenseIva = allProratedParentExpenses.reduce((s: number, f: any) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);

  const totalForecastIncomeBase = incomeForecasts.reduce((s, f) => s + Number(f.amount), 0) + ticketRevenue;
  const totalForecastIncomeIva = incomeForecasts.reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0) + ticketRevenueIva;
  const totalForecastIncome = totalForecastIncomeBase + totalForecastIncomeIva;
  const totalForecastExpenseBaseNoCache = expenseForecasts.reduce((s, f) => s + Number(f.amount), 0);
  const totalForecastExpenseBase = totalForecastExpenseBaseNoCache + totalCacheAmount + proratedExpenseBase;
  const totalForecastExpenseIva = expenseForecasts.reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0) + proratedExpenseIva;
  const totalForecastExpense = totalForecastExpenseBase + totalForecastExpenseIva;
  const forecastProfit = totalForecastIncome - totalForecastExpense;

  const totalActualIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0) + ticketActualRevenue;
  const totalActualExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const actualProfit = totalActualIncome - totalActualExpense;

  const comparisonData = buildComparison(forecasts, transactions, categories);

  const draftCount = forecasts.filter((f) => f.status === "draft").length;
  const approvedCount = forecasts.filter((f) => f.status === "approved").length;

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

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
            options={cats.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
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
            <option value="23">23%</option>
            <option value="13">13%</option>
            <option value="6">6%</option>
            <option value="0">0%</option>
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
          <div className="flex justify-end gap-1">
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

  return (
    <div className="space-y-6">
      {expenseOnly && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <TrendingDown className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Despesas Partilhadas (Rateio)</p>
            <p className="text-xs text-muted-foreground">As despesas aqui criadas serão rateadas igualmente entre todos os sub-eventos nos relatórios.</p>
          </div>
        </div>
      )}
      {/* Summary cards */}
      <div className={`grid gap-4 ${expenseOnly ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {!expenseOnly && <SummaryCard label="Receitas" forecast={totalForecastIncome} actual={totalActualIncome} icon={<TrendingUp className="h-4 w-4 text-success" />} />}
        <SummaryCard label="Despesas" forecast={totalForecastExpense} actual={totalActualExpense} icon={<TrendingDown className="h-4 w-4 text-warning" />} />
        {!expenseOnly && <SummaryCard label="Resultado" forecast={forecastProfit} actual={actualProfit} icon={<BarChart3 className="h-4 w-4 text-primary" />} isProfit />}
        <div className="glass rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Estado do BP
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
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="forecasts">Previsões</TabsTrigger>
            <TabsTrigger value="comparison">Previsão vs Real</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {isAdmin && approvedWithoutTxCount > 0 && eventStatus === "completed" && (
              <button
                onClick={handleGenerateHistorical}
                disabled={generateHistoricalMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <History className="h-3.5 w-3.5" />
                {generateHistoricalMutation.isPending ? "A gerar…" : `Gerar Transações (${approvedWithoutTxCount})`}
              </button>
            )}
            {canApprove && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportXlsx}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingXlsx}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importingXlsx ? "A importar…" : "Importar XLSX"}
                </button>
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
            <div className="space-y-6">
              {/* Income section */}
              {!expenseOnly && <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receitas Previstas</h3>
                    {canApprove && incomeForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={incomeForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("income")}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-muted-foreground">Selecionar rascunhos</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => startAdding("income")}
                      disabled={addingType === "income"}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
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
                                <td colSpan={3} className="py-2 pl-2 text-xs font-semibold text-foreground">{group.groupName}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">{formatCurrency(groupBase)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(groupIva)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">{formatCurrency(groupBase + groupIva)}</td>
                                <td />
                              </tr>
                            )}
                            {group.items.map((f) => (
                              editingId === f.id ? (
                                <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                                  <td className="py-1.5 pr-2">
                                    <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                                  </td>
                                   <td className="hidden py-1.5 pr-2 sm:table-cell">
                                    <SearchableSelect
                                      options={incomeCategories.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                                      value={inlineForm.category_id}
                                      onValueChange={(v) => setInlineForm({ ...inlineForm, category_id: v })}
                                      placeholder="Categoria…"
                                      searchPlaceholder="Pesquisar conta…"
                                      className={inputClass}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`}>
                                      <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
                                    </select>
                                  </td>
                                   <td className="py-1.5 pr-2">
                                    <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} />
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
                                <ForecastRow key={f.id} item={f} colorClass="text-success" onEdit={startEdit} onDelete={(id) => deleteMutation.mutate(id)} onApprove={(item) => approveMutation.mutate(item)} isAdmin={canApprove} isApproving={approveMutation.isPending} isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} indented={showGroupHeader} />
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
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Despesas Previstas</h3>
                    {canApprove && expenseForecasts.some((f) => f.status === "draft") && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={expenseForecasts.filter((f) => f.status === "draft").every((f) => selectedIds.has(f.id))}
                          onCheckedChange={() => toggleSelectAllDrafts("expense")}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-muted-foreground">Selecionar rascunhos</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => startAdding("expense")}
                      disabled={addingType === "expense"}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-warning bg-warning/10 hover:bg-warning/20 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
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
                                  {group.groupName}
                                  {group.groupCode === "2.1" && cacheLines.length > 0 && (
                                    <span className="ml-2 text-muted-foreground font-normal">(incl. cachês)</span>
                                  )}
                                </td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">
                                  {formatCurrency(group.groupCode === "2.1" ? groupBase + totalCacheAmount : groupBase)}
                                </td>
                                <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(groupIva)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold">
                                  {formatCurrency((group.groupCode === "2.1" ? groupBase + totalCacheAmount : groupBase) + groupIva)}
                                </td>
                                <td />
                              </tr>
                            )}
                            {group.items.map((f) => (
                              editingId === f.id ? (
                                <tr key={f.id} className="bg-primary/5" onKeyDown={handleInlineKeyDown}>
                                  <td className="py-1.5 pr-2">
                                    <input ref={descRef} value={inlineForm.description} onChange={(e) => setInlineForm({ ...inlineForm, description: e.target.value })} className={inputClass} autoFocus />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <input value={inlineForm.specification} onChange={(e) => setInlineForm({ ...inlineForm, specification: e.target.value })} className={inputClass} placeholder="Especificação…" />
                                  </td>
                                   <td className="hidden py-1.5 pr-2 sm:table-cell">
                                     <SearchableSelect
                                       options={expenseCategories.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                                       value={inlineForm.category_id}
                                       onValueChange={(v) => setInlineForm({ ...inlineForm, category_id: v })}
                                       placeholder="Categoria…"
                                       searchPlaceholder="Pesquisar conta…"
                                       className={inputClass}
                                     />
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <select value={inlineForm.iva_rate} onChange={(e) => setInlineForm({ ...inlineForm, iva_rate: e.target.value })} className={`${inputClass} w-20`}>
                                      <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
                                    </select>
                                  </td>
                                   <td className="py-1.5 pr-2">
                                    <input type="number" step="0.01" min="0" value={inlineForm.amount} onChange={(e) => setInlineForm({ ...inlineForm, amount: e.target.value })} className={`${inputClass} w-28 text-right font-mono`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInlineSave(); }}} />
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
                                <ForecastRow key={f.id} item={f} colorClass="text-warning" isExpense onEdit={startEdit} onDelete={(id) => deleteMutation.mutate(id)} onApprove={(item) => approveMutation.mutate(item)} isAdmin={canApprove} isApproving={approveMutation.isPending} isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} indented={showGroupHeader} />
                              )
                            ))}
                            {/* Inject cachê lines inside the Artístico group */}
                            {group.groupCode === "2.1" && cacheLines.length > 0 && cacheLines.map((cl, idx) => {
                              const typeLabel = cl.cacheType === "fixed" ? "(Fixo)" : "(Variável)";
                              return (
                                <tr key={`cache-${idx}`} className="border-b border-border/10">
                                  <td className="py-2.5 pr-3 pl-4" colSpan={2}>
                                    <div className="flex items-center gap-2">
                                      <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="font-medium">{cl.artistName} <span className="text-muted-foreground text-xs">{typeLabel}</span></span>
                                    </div>
                                  </td>
                                  <td className="hidden sm:table-cell py-2.5 pr-3 text-muted-foreground text-xs">2.1.01 - Cachês</td>
                                  <td className="py-2.5 text-right text-muted-foreground text-xs">0%</td>
                                  <td className="py-2.5 text-right font-mono font-semibold text-warning">{formatCurrency(cl.amount)}</td>
                                  <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(0)}</td>
                                  <td className="py-2.5 text-right font-mono font-semibold text-warning">{formatCurrency(cl.amount)}</td>
                                  <td />
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      {/* Prorated parent expenses */}
                      {allProratedParentExpenses.length > 0 && (
                        <>
                          <tr className="bg-primary/5 border-t-2 border-primary/20">
                            <td colSpan={8} className="py-2.5 pl-2">
                              <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-xs font-semibold text-primary">Despesas Rateadas do Evento-Pai</span>
                                <span className="text-[10px] text-muted-foreground">(÷ {siblingCount} sub-eventos)</span>
                              </div>
                            </td>
                          </tr>
                          {proratedExpenseGroups.map((group) => {
                            const groupBase = group.items.reduce((s: number, f: any) => s + Number(f.amount), 0);
                            const groupIva = group.items.reduce((s: number, f: any) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);
                            const showGroupHeader = proratedExpenseGroups.length > 1 || group.groupName !== (group.items[0]?.account_categories?.name);
                            return (
                              <React.Fragment key={`prorated-${group.groupName}`}>
                                {showGroupHeader && (
                                  <tr className="bg-primary/5 border-t border-border/30">
                                    <td colSpan={4} className="py-2 pl-4 text-xs font-semibold text-foreground/70">{group.groupName}</td>
                                    <td className="py-2 text-right font-mono text-xs font-semibold text-foreground/70">{formatCurrency(groupBase)}</td>
                                    <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(groupIva)}</td>
                                    <td className="py-2 text-right font-mono text-xs font-semibold text-foreground/70">{formatCurrency(groupBase + groupIva)}</td>
                                    <td />
                                  </tr>
                                )}
                                {group.items.map((f: any) => (
                                  <ForecastRow key={`prorated-${f.id}`} item={f} colorClass="text-warning/60" isExpense onEdit={() => {}} onDelete={() => {}} onApprove={() => {}} isAdmin={false} isApproving={false} readOnly indented={showGroupHeader} />
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </>
                      )}
                      {addingType === "expense" && renderInlineRow("expense")}
                    </tbody>
                    {(expenseForecasts.length > 0 || addingType === "expense" || cacheLines.length > 0) && (
                      <tfoot>
                        <tr className="border-t border-border/50">
                          <td colSpan={4} className="py-2.5 text-right text-xs font-medium text-muted-foreground">Total</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning">{formatCurrency(totalForecastExpenseBase)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning/70">{formatCurrency(totalForecastExpenseIva)}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-warning">{formatCurrency(totalForecastExpense)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {expenseForecasts.length === 0 && addingType !== "expense" && allProratedParentExpenses.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem despesas previstas</p>
                  )}
                </div>
              </div>

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
        </TabsContent>

        <TabsContent value="comparison">
          <ComparisonTable data={comparisonData} cacheLines={cacheLines} />
        </TabsContent>
      </Tabs>

      {showCopyModal && (
        <CopyPLModal
          targetEventId={eventId}
          targetEventName={eventName || "este evento"}
          existingForecastCount={forecasts.length}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ForecastRow({ item, colorClass, isExpense, onEdit, onDelete, onApprove, isAdmin, isApproving, isSelected, onToggleSelect, indented, readOnly }: {
  item: any; colorClass: string; isExpense?: boolean;
  onEdit: (item: any) => void; onDelete: (id: string) => void;
  onApprove: (item: any) => void; isAdmin: boolean; isApproving: boolean;
  isSelected?: boolean; onToggleSelect?: (id: string) => void;
  indented?: boolean; readOnly?: boolean;
}) {
  const isDraft = item.status === "draft";
  const isApproved = item.status === "approved";
  const isProrated = item._prorated;

  return (
    <tr className={readOnly ? "bg-primary/5 opacity-70" : isApproved ? "opacity-60" : "group hover:bg-muted/30 transition-colors"}>
      <td className={`py-2.5 pr-3 ${indented ? "pl-4" : ""}`}>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          ) : isDraft && isAdmin && onToggleSelect ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(item.id)}
              className="h-3.5 w-3.5 shrink-0"
            />
          ) : isApproved ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-warning shrink-0" />
          )}
          <div>
            <p className="font-medium">{item.description}</p>
            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
            {isApproved && item.transaction_id && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Link2 className="h-3 w-3" /> Transação criada
              </p>
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
        {item.account_categories ? `${item.account_categories.code} - ${item.account_categories.name}` : "—"}
      </td>
      <td className="py-2.5 text-right text-muted-foreground text-xs">{item.iva_rate}%</td>
      <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
        {formatCurrency(Number(item.amount))}
      </td>
      <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">
        {formatCurrency(Number(item.amount) * Number(item.iva_rate) / 100)}
      </td>
      <td className={`py-2.5 text-right font-mono font-semibold ${colorClass}`}>
        {formatCurrency(Number(item.amount) * (1 + Number(item.iva_rate) / 100))}
      </td>
      <td className="py-2.5 text-right">
        {readOnly ? (
          <span className="text-[10px] text-primary/60 italic">rateio</span>
        ) : (
          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            {isDraft && (
              <>
                <button onClick={() => onEdit(item)} className="rounded p-1 hover:bg-secondary" title="Editar">
                  <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button onClick={() => onDelete(item.id)} className="rounded p-1 hover:bg-destructive/20" title="Remover">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function SummaryCard({ label, forecast, actual, icon, isProfit }: {
  label: string; forecast: number; actual: number; icon: React.ReactNode; isProfit?: boolean;
}) {
  const variance = actual - forecast;
  const variancePct = forecast !== 0 ? (variance / Math.abs(forecast)) * 100 : 0;
  const isPositive = isProfit ? variance >= 0 : (label === "Despesas" ? variance <= 0 : variance >= 0);

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
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

/* ── Comparison ── */

interface ComparisonRow {
  categoryCode: string;
  categoryName: string;
  groupName: string;
  groupCode: string;
  type: string;
  forecast: number;
  actual: number;
  variance: number;
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
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, groupName: cat.groupName, groupCode: cat.groupCode, type: f.type, forecast: 0, actual: 0, variance: 0 };
    map[key].forecast += Number(f.amount);
  });
  transactions.forEach((t) => {
    const key = getKey(t.type, t.category_id);
    const cat = getCatInfo(t.category_id);
    if (!map[key]) map[key] = { categoryCode: cat.code, categoryName: cat.name, groupName: cat.groupName, groupCode: cat.groupCode, type: t.type, forecast: 0, actual: 0, variance: 0 };
    map[key].actual += Number(t.amount);
  });

  return Object.values(map)
    .map((r) => ({ ...r, variance: r.actual - r.forecast }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return compareHierarchicalCodes(a.groupCode, b.groupCode) || compareHierarchicalCodes(a.categoryCode, b.categoryCode);
    });
}

function ComparisonTable({ data, cacheLines = [] }: { data: ComparisonRow[]; cacheLines?: CachePLLine[] }) {
  const incomeRows = data.filter((r) => r.type === "income");
  const expenseRows = data.filter((r) => r.type === "expense");
  const totalCacheF = cacheLines.reduce((s, c) => s + c.amount, 0);
  const totalFI = incomeRows.reduce((s, r) => s + r.forecast, 0);
  const totalAI = incomeRows.reduce((s, r) => s + r.actual, 0);
  const totalFE = expenseRows.reduce((s, r) => s + r.forecast, 0) + totalCacheF;
  const totalAE = expenseRows.reduce((s, r) => s + r.actual, 0);

  // Group rows by L2 parent
  const groupRows = (rows: ComparisonRow[]) => {
    const groups: { groupName: string; rows: ComparisonRow[]; totalF: number; totalA: number }[] = [];
    const gMap: Record<string, typeof groups[0]> = {};
    rows.forEach((r) => {
      if (!gMap[r.groupName]) {
        gMap[r.groupName] = { groupName: r.groupName, rows: [], totalF: 0, totalA: 0 };
        groups.push(gMap[r.groupName]);
      }
      gMap[r.groupName].rows.push(r);
      gMap[r.groupName].totalF += r.forecast;
      gMap[r.groupName].totalA += r.actual;
    });
    return groups;
  };

  const incomeGroups = groupRows(incomeRows);
  const expenseGroups = groupRows(expenseRows);

  if (data.length === 0) return <p className="py-8 text-center text-muted-foreground">Adicione previsões e transações para ver a comparação.</p>;

  const renderGroupedRows = (groups: ReturnType<typeof groupRows>, isIncome?: boolean) => {
    return groups.map((group) => {
      const showHeader = groups.length > 1 || (group.rows.length > 1 || group.rows[0]?.categoryName !== group.groupName);
      return (
        <React.Fragment key={group.groupName}>
          {showHeader && (
            <tr className="bg-secondary/10 border-t border-border/30">
              <td className="py-1.5 pl-2 text-xs font-semibold">{group.groupName}</td>
              <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(group.totalF)}</td>
              <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(group.totalA)}</td>
              <td className={`py-1.5 text-right font-mono text-xs font-semibold ${isIncome ? (group.totalA - group.totalF >= 0 ? "text-success" : "text-destructive") : (group.totalA - group.totalF <= 0 ? "text-success" : "text-destructive")}`}>
                {formatCurrency(group.totalA - group.totalF)}
              </td>
              <td />
            </tr>
          )}
          {group.rows.map((r) => <ComparisonRowItem key={`${r.type}-${r.categoryCode}`} row={r} isIncome={isIncome} indented={showHeader} />)}
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
          {(expenseRows.length > 0 || cacheLines.length > 0) && (
            <>
              <tr><td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-warning">Despesas</td></tr>
              {renderGroupedRows(expenseGroups, false)}
              {cacheLines.length > 0 && (
                <>
                  <tr className="bg-secondary/10 border-t border-border/30">
                    <td className="py-1.5 pl-2 text-xs font-semibold">2.1.01 Cachês</td>
                    <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(totalCacheF)}</td>
                    <td className="py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(0)}</td>
                    <td className={`py-1.5 text-right font-mono text-xs font-semibold text-destructive`}>{formatCurrency(0 - totalCacheF)}</td>
                    <td />
                  </tr>
                  {cacheLines.map((cl, idx) => {
                    const typeLabel = cl.cacheType === "fixed" ? "(Fixo)" : "(Var.)";
                    return (
                      <tr key={`cache-cmp-${idx}`} className="border-b border-border/20">
                        <td className="py-2 pr-3 pl-4">{cl.artistName} <span className="text-xs text-muted-foreground">{typeLabel}</span></td>
                        <td className="py-2 text-right font-mono">{formatCurrency(cl.amount)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(0)}</td>
                        <td className="py-2 text-right font-mono text-destructive">{formatCurrency(0 - cl.amount)}</td>
                        <td className="py-2 text-right text-xs">—</td>
                      </tr>
                    );
                  })}
                </>
              )}
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

function ComparisonRowItem({ row, isIncome, indented }: { row: ComparisonRow; isIncome?: boolean; indented?: boolean }) {
  const variancePct = row.forecast > 0 ? (row.variance / row.forecast) * 100 : 0;
  const isPositive = isIncome ? row.variance >= 0 : row.variance <= 0;
  return (
    <tr className="border-b border-border/20">
      <td className={`py-2 pr-3 ${indented ? "pl-4" : ""}`}><span className="text-xs text-muted-foreground mr-1.5">{row.categoryCode}</span>{row.categoryName}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.forecast)}</td>
      <td className="py-2 text-right font-mono">{formatCurrency(row.actual)}</td>
      <td className={`py-2 text-right font-mono ${isPositive ? "text-success" : "text-destructive"}`}>{row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}</td>
      <td className={`py-2 text-right text-xs ${isPositive ? "text-success" : "text-destructive"}`}>{row.forecast > 0 ? `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%` : "—"}</td>
    </tr>
  );
}
