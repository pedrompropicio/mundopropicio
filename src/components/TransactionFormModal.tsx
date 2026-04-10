import React, { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X, Plus, AlertTriangle, ChevronDown, ChevronRight, Split } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes, sortByHierarchicalCode } from "@/lib/utils";
import { TransactionSplitConfig, type SplitEntry, type SplitBPInfo } from "@/components/TransactionSplitConfig";

interface TransactionForm {
  description: string;
  type: "income" | "expense";
  amount: string;
  iva_rate: IvaRate;
  event_id: string;
  category_id: string;
  supplier_id: string;
  account_id: string;
  date: string;
  due_date: string;
  specification: string;
  pl_override_note: string;
  is_reimbursement: boolean;
  reimbursement_to: string;
}

const emptyForm: TransactionForm = {
  description: "",
  type: "income",
  amount: "",
  iva_rate: 23,
  event_id: "",
  category_id: "",
  supplier_id: "",
  account_id: "",
  date: new Date().toISOString().split("T")[0],
  due_date: "",
  specification: "",
  pl_override_note: "",
  is_reimbursement: false,
  reimbursement_to: "",
};

const formatDueDateInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseDueDateForDb = (value: string) => {
  if (!value.trim()) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

export function TransactionFormModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showProrationConfirm, setShowProrationConfirm] = useState(false);
  const [plExpanded, setPlExpanded] = useState(true);
  const [plOverride, setPlOverride] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom">("equal");
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, pl_mode, event_type, parent_event_id" as any).in("status", ["active", "confirmed"]).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, name, code, type, parent_id, event_required").eq("is_active", true);
      if (error) throw error;
      return sortByHierarchicalCode(data ?? [], (category) => category.code);
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, trade_name, nif, iban, swift_bic, iban_2, swift_bic_2, iban_3, swift_bic_3").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedSupplier = suppliers.find((s: any) => s.id === form.supplier_id) ?? null;

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedEvent = events.find((e: any) => e.id === form.event_id);
  const isActivePL = selectedEvent?.pl_mode === "active";
  const hasPL = selectedEvent?.pl_mode === "active" || selectedEvent?.pl_mode === "passive";
  const hasPLRestriction = hasPL;
  const isParentMultiDay = selectedEvent?.event_type === "multi_day";

  const parentEvents = useMemo(() => events.filter((e: any) => !e.parent_event_id), [events]);
  const subEventsByParent = useMemo(() => {
    const map: Record<string, any[]> = {};
    events.filter((e: any) => e.parent_event_id).forEach((e: any) => {
      if (!map[e.parent_event_id]) map[e.parent_event_id] = [];
      map[e.parent_event_id].push(e);
    });
    return map;
  }, [events]);

  // For parent multi_day events, collect all child event IDs to aggregate BP
  const forecastEventIds = useMemo(() => {
    if (!form.event_id) return [];
    if (isParentMultiDay) {
      const childIds = (subEventsByParent[form.event_id] || []).map((e: any) => e.id);
      return childIds.length > 0 ? childIds : [form.event_id];
    }
    return [form.event_id];
  }, [form.event_id, isParentMultiDay, subEventsByParent]);

  // Build event options for SearchableSelect
  const eventOptions = useMemo(() => {
    const opts: { value: string; label: string; group?: string; indent?: boolean; icon?: string }[] = [];
    parentEvents.forEach((ev: any) => {
      const subs = subEventsByParent[ev.id] || [];
      const isMulti = ev.event_type === "multi_day" && subs.length > 0;
      const groupName = isMulti ? `🔀 ${ev.name} (Turnê)` : undefined;
      opts.push({
        value: ev.id,
        label: `${ev.name}${ev.pl_mode === "active" ? " 🔒" : ""}${isMulti ? " ⚡ Rateio" : ""}`,
        group: groupName,
      });
      subs.forEach((sub: any) => {
        opts.push({
          value: sub.id,
          label: `${ev.name} — ${sub.name}`,
          group: groupName,
          indent: true,
          icon: "↳",
        });
      });
    });
    return opts;
  }, [parentEvents, subEventsByParent]);

  const { data: eventForecasts = [] } = useQuery({
    queryKey: ["event_forecasts_budget", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, type, category_id, amount, status, description, iva_rate, specification")
        .in("event_id", forecastEventIds);
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id && hasPL && forecastEventIds.length > 0,
  });

  const { data: eventTransactions = [] } = useQuery({
    queryKey: ["event_transactions_budget", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, category_id, amount")
        .in("event_id", forecastEventIds);
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id && hasPL && forecastEventIds.length > 0,
  });

  // Fetch cache configs for this event (aggregate from children for parent tours)
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["event_cache_configs_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs")
        .select("*")
        .in("event_id", forecastEventIds);
      if (error) throw error;
      return data as CacheConfig[];
    },
    enabled: !!form.event_id && hasPL && forecastEventIds.length > 0,
  });

  const { data: cacheDeductions = [] } = useQuery({
    queryKey: ["event_cache_deductions_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      if (cacheConfigs.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions")
        .select("*")
        .in("cache_config_id", cacheConfigs.map(c => c.id));
      if (error) throw error;
      return data as CacheDeduction[];
    },
    enabled: !!form.event_id && hasPL && cacheConfigs.length > 0,
  });

  // Fetch ticket lots for cachê calculation (aggregate from children for parent tours)
  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ticket_lots_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", forecastEventIds);
      if (!zones || zones.length === 0) return [];
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, iva_rate, quantity")
        .in("zone_id", zones.map(z => z.id));
      return lots || [];
    },
    enabled: !!form.event_id && hasPL && cacheConfigs.length > 0,
  });

  const ticketRevenueGross = useMemo(() => {
    return ticketLots.reduce((s, l: any) => s + Number(l.quantity) * Number(l.price), 0);
  }, [ticketLots]);

  const ticketRevenueNet = useMemo(() => {
    return ticketLots.reduce((s, l: any) => {
      const rate = Number(l.iva_rate ?? 6);
      return s + Number(l.quantity) * (Number(l.price) / (1 + rate / 100));
    }, 0);
  }, [ticketLots]);

  const forecastBudgetByCategory = hasPL
    ? eventForecasts.reduce<Record<string, number>>((acc, f) => {
        const key = `${f.type}_${f.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(f.amount);
        return acc;
      }, {})
    : {};

  const usedBudgetByCategory = hasPL
    ? eventTransactions.reduce<Record<string, number>>((acc, t) => {
        const key = `${t.type}_${t.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(t.amount);
        return acc;
      }, {})
    : {};

  const allowedCategoryIds = hasPLRestriction
    ? [...new Set(eventForecasts.filter(f => f.type === form.type).map(f => f.category_id).filter(Boolean))]
    : [];

  // --- BP data for split events ---
  const splitEventIds = useMemo(() => splitEntries.map(e => e.event_id), [splitEntries]);

  const { data: splitForecasts = [] } = useQuery({
    queryKey: ["split-bp-forecasts", splitEventIds],
    queryFn: async () => {
      if (splitEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, type, category_id, amount")
        .in("event_id", splitEventIds);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitEventIds.length > 0,
  });

  const { data: splitTransactions = [] } = useQuery({
    queryKey: ["split-bp-transactions", splitEventIds],
    queryFn: async () => {
      if (splitEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, type, category_id, amount")
        .in("event_id", splitEventIds);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitEventIds.length > 0,
  });

  const splitBPInfoByEvent = useMemo<Record<string, SplitBPInfo>>(() => {
    if (!isSplit || splitEventIds.length === 0 || !form.category_id) return {};
    const result: Record<string, SplitBPInfo> = {};
    for (const eventId of splitEventIds) {
      const ev = events.find((e: any) => e.id === eventId);
      const evForecasts = splitForecasts.filter(f => f.event_id === eventId);
      const evTransactions = splitTransactions.filter(t => t.event_id === eventId);
      const hasAnyForecasts = evForecasts.length > 0;
      const hasForecastMatch = evForecasts.some(f => f.type === form.type && f.category_id === form.category_id);
      const forecast = evForecasts
        .filter(f => f.type === form.type && f.category_id === form.category_id)
        .reduce((s, f) => s + Number(f.amount), 0);
      const used = evTransactions
        .filter(t => t.type === form.type && t.category_id === form.category_id)
        .reduce((s, t) => s + Number(t.amount), 0);
      result[eventId] = {
        event_id: eventId,
        pl_mode: ev?.pl_mode ?? null,
        forecast,
        used,
        hasForecastMatch,
        hasAnyForecasts,
      };
    }
    return result;
  }, [isSplit, splitEventIds, form.category_id, form.type, splitForecasts, splitTransactions, events]);

  // Check if any split event needs BP bypass
  const splitNeedsBypass = useMemo(() => {
    if (!isSplit || !form.category_id) return false;
    const amount = parseFloat(form.amount) || 0;
    for (const entry of splitEntries) {
      const bp = splitBPInfoByEvent[entry.event_id];
      if (!bp || !bp.hasAnyForecasts) continue;
      const childAmount = +(amount * entry.percentage / 100).toFixed(2);
      // Category not in BP
      if (!bp.hasForecastMatch) return true;
      // Exceeds available budget
      const remaining = bp.forecast - bp.used;
      if (bp.forecast > 0 && childAmount > remaining) return true;
    }
    return false;
  }, [isSplit, form.category_id, form.amount, splitEntries, splitBPInfoByEvent]);

  const createMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      if (isSplit && splitEntries.length >= 2) {
        // --- SPLIT TRANSACTION ---
        const totalAmount = parseFloat(data.amount);

        // 1. Build child inserts first to determine parent status
        const childInserts = splitEntries.map((entry) => {
          const childAmount = +(totalAmount * entry.percentage / 100).toFixed(2);
          const bp = splitBPInfoByEvent[entry.event_id];
          const hasBP = bp && bp.hasAnyForecasts;
          const hasForecastMatch = bp?.hasForecastMatch ?? false;
          
          // Determine if this child needs override
          let needsOverride = false;
          if (hasBP) {
            if (!hasForecastMatch) {
              needsOverride = true;
            } else {
              const remaining = bp.forecast - bp.used;
              if (bp.forecast > 0 && childAmount > remaining) {
                needsOverride = true;
              }
            }
          }

          const childStatus = (hasForecastMatch && !needsOverride) ? "approved" : "pending";

          return {
            description: data.description,
            type: data.type,
            amount: childAmount,
            iva_rate: data.iva_rate,
            event_id: entry.event_id,
            category_id: data.category_id || null,
            supplier_id: data.supplier_id || null,
            account_id: null,
            specification: data.type === "expense" ? (data.specification || null) : null,
            pl_override_note: needsOverride ? (data.pl_override_note.trim() || null) : null,
            date: data.date,
            due_date: parseDueDateForDb(data.due_date),
            status: childStatus,
            paid_amount: 0,
            split_percentage: entry.percentage,
            parent_transaction_id: "", // placeholder, set after parent insert
          };
        });

        // Parent is approved only if ALL children are approved
        const allChildrenApproved = childInserts.every(c => c.status === "approved");
        const parentStatus = allChildrenApproved ? "approved" : "pending";

        // 2. Create parent transaction (no event)
        const { data: parentRow, error: parentError } = await supabase.from("transactions").insert({
          description: data.description,
          type: data.type,
          amount: totalAmount,
          iva_rate: data.iva_rate,
          event_id: null,
          category_id: data.category_id || null,
          supplier_id: data.supplier_id || null,
          account_id: data.account_id || null,
          specification: data.type === "expense" ? (data.specification || null) : null,
          pl_override_note: data.pl_override_note.trim() || null,
          date: data.date,
          due_date: parseDueDateForDb(data.due_date),
          status: parentStatus,
          paid_amount: 0,
          split_percentage: null,
          parent_transaction_id: null,
        } as any).select("id").single();
        if (parentError) throw parentError;
        const parentId = parentRow.id;

        // 3. Set parent ID on children and insert
        const childInsertsWithParent = childInserts.map(c => ({ ...c, parent_transaction_id: parentId }));
        const { error: childError } = await supabase.from("transactions").insert(childInsertsWithParent as any);
        if (childError) throw childError;
      } else {
        // --- SINGLE TRANSACTION ---
        const hasForecastMatch = eventForecasts.length > 0 && eventForecasts.some(
          (f) => f.type === data.type && f.category_id === data.category_id
        );
        const autoApproved = hasForecastMatch;

        const { error } = await supabase.from("transactions").insert({
          description: data.description,
          type: data.type,
          amount: parseFloat(data.amount),
          iva_rate: data.iva_rate,
          event_id: data.event_id || null,
          category_id: data.category_id || null,
          supplier_id: data.supplier_id || null,
          account_id: data.account_id || null,
          specification: data.type === "expense" ? (data.specification || null) : null,
          pl_override_note: data.pl_override_note.trim() || null,
          date: data.date,
          due_date: parseDueDateForDb(data.due_date),
          status: autoApproved ? "approved" : "pending",
          paid_amount: 0,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: isSplit ? "Rateio criado com sucesso!" : "Transação criada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transação", description: err.message, variant: "destructive" });
    },
  });

  const getRootFlags = (categoryId: string) => {
    if (!categoryId) return { event_required: false };
    let cat = categories.find((c: any) => c.id === categoryId);
    while (cat && cat.parent_id) {
      cat = categories.find((c: any) => c.id === cat!.parent_id);
    }
    return { event_required: cat?.event_required ?? true };
  };

  const rootFlags = getRootFlags(form.category_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    // Split validation
    if (isSplit) {
      if (splitEntries.length < 2) {
        toast({ title: "Selecione pelo menos 2 eventos para rateio", variant: "destructive" });
        return;
      }
      const totalPct = splitEntries.reduce((s, e) => s + e.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        toast({ title: "A soma das percentagens deve ser 100%", variant: "destructive" });
        return;
      }
      // BP bypass validation for split events
      if (splitNeedsBypass && !plOverride) {
        toast({ title: "Rateio inclui eventos com BP que requerem justificação. Ative 'Fora do BP'.", variant: "destructive" });
        return;
      }
      if (plOverride && !form.pl_override_note.trim()) {
        toast({ title: "Justificação obrigatória para categorias fora do BP", variant: "destructive" });
        return;
      }
    } else {
      // Single transaction validation
      if (rootFlags.event_required && !form.event_id) {
        toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
        return;
      }
      if (hasPLRestriction && form.event_id && allowedCategoryIds.length > 0 && !plOverride) {
        if (!form.category_id) {
          toast({ title: "Evento com BP: selecione uma categoria existente no BP", variant: "destructive" });
          return;
        }
        if (!allowedCategoryIds.includes(form.category_id)) {
          toast({ title: "Esta categoria não existe no BP do evento", variant: "destructive" });
          return;
        }
      }
    }
    if (plOverride && !form.pl_override_note.trim()) {
      toast({ title: "Justificação obrigatória para categorias fora do BP", variant: "destructive" });
      return;
    }
    // Warning (non-blocking) when amount exceeds BP forecast
    if (hasPL && form.event_id && form.category_id) {
      const budgetKey = `${form.type}_${form.category_id}`;
      const forecast = forecastBudgetByCategory[budgetKey] || 0;
      const used = usedBudgetByCategory[budgetKey] || 0;
      const newAmount = parseFloat(form.amount) || 0;
      const remaining = forecast - used;
      if (forecast > 0 && newAmount > remaining) {
        toast({
          title: "⚠️ Valor ultrapassa o previsto no BP",
          description: `Previsto: ${forecast.toFixed(2)}€ | Utilizado: ${used.toFixed(2)}€ | Disponível: ${remaining.toFixed(2)}€ | Lançando: ${newAmount.toFixed(2)}€`,
        });
      }
    }
    if (isParentMultiDay && !showProrationConfirm) {
      setShowProrationConfirm(true);
      return;
    }
    setShowProrationConfirm(false);
    createMutation.mutate(form);
  };

  const filteredCategories = categories.filter((c) => {
    const typeMatch = form.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    // Only leaf categories (no children)
    const isLeaf = !categories.some((ch) => ch.parent_id === c.id);
    if (!isLeaf) return false;
    if (hasPLRestriction && form.event_id && allowedCategoryIds.length > 0 && !plOverride) {
      return allowedCategoryIds.includes(c.id);
    }
    return true;
  });

  const categoryOptions = filteredCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }));
  const supplierOptions = suppliers.map((s: any) => ({ value: s.id, label: s.trade_name ? `${s.name} (${s.trade_name})` : s.name, searchText: s.trade_name ?? undefined }));
  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nova Transação</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setForm({ ...form, type: t, category_id: "", supplier_id: "", pl_override_note: "" }); setPlOverride(false); }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  form.type === t
                    ? t === "income" ? "bg-success/20 text-success ring-1 ring-success/40" : "bg-warning/20 text-warning ring-1 ring-warning/40"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {t === "income" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          {/* Split toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSplit(!isSplit);
                if (!isSplit) {
                  setForm({ ...form, event_id: "" });
                } else {
                  setSplitEntries([]);
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isSplit
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Split className="h-3.5 w-3.5" />
              {isSplit ? "Rateio Ativo" : "Ratear por eventos"}
            </button>
          </div>

          {/* Event selector (single) — hidden when split */}
          {!isSplit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Evento {rootFlags.event_required ? "*" : ""}
                {isActivePL && <span className="ml-1 text-success">(BP Ativo)</span>}
                {hasPL && !isActivePL && <span className="ml-1 text-blue-500">(BP Passivo)</span>}
              </label>
              <SearchableSelect
                options={eventOptions}
                value={form.event_id}
                onValueChange={(v) => { setForm({ ...form, event_id: v, category_id: "", pl_override_note: "" }); setPlExpanded(true); setShowProrationConfirm(false); setPlOverride(false); }}
                placeholder={rootFlags.event_required ? "Selecionar…" : "Sem evento"}
                searchPlaceholder="Pesquisar evento…"
              />
            </div>
          )}

          {/* Split config panel — shown when split is active */}
          {isSplit && (
            <>
              <TransactionSplitConfig
                events={events}
                splitEntries={splitEntries}
                onChange={setSplitEntries}
                splitMethod={splitMethod}
                onMethodChange={setSplitMethod}
                totalAmount={parseFloat(form.amount) || 0}
                bpInfoByEvent={splitBPInfoByEvent}
              />
              {/* BP Override toggle for split mode */}
              {splitNeedsBypass && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setPlOverride(!plOverride); setForm({ ...form, pl_override_note: "" }); }}
                    className={`text-xs font-medium transition-colors ${plOverride ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {plOverride ? "⚠️ Fora do BP — Clique para reverter" : "⚠️ Rateio excede BP em alguns eventos. Clique para justificar"}
                  </button>
                </div>
              )}
              {plOverride && splitNeedsBypass && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-warning">Justificação *</label>
                  <input
                    value={form.pl_override_note}
                    onChange={(e) => setForm({ ...form, pl_override_note: e.target.value })}
                    className="w-full rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50"
                    placeholder="Ex: Despesa partilhada não prevista no orçamento individual"
                  />
                </div>
              )}
            </>
          )}

          {/* BP forecast lines — auto-expand when event selected */}
          {hasPL && form.event_id && plExpanded && (() => {
            const typeForecasts = eventForecasts.filter(f => f.type === form.type);

            // Calculate cachê lines for expense view
            const cacheLines = form.type === "expense" && cacheConfigs.length > 0
              ? calculateCacheLinesForPL(
                  cacheConfigs,
                  cacheDeductions,
                  ticketRevenueNet,
                  eventForecasts.map(f => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
                  ticketRevenueGross
                )
              : [];
            const totalCache = cacheLines.reduce((s, c) => s + c.amount, 0);

            if (typeForecasts.length === 0 && cacheLines.length === 0) return null;

            // Build hierarchy using category lookup
            const catLookup = buildCategoryLookup(categories);

            // Aggregate forecasts and transactions by L2 group → L3 detail
            interface PLDetail {
              catId: string;
              catName: string;
              catCode: string;
              forecast: number;
              used: number;
              lines: typeof typeForecasts;
            }
            interface PLGroup {
              groupName: string;
              groupCode: string;
              totalForecast: number;
              totalUsed: number;
              details: PLDetail[];
            }

            const groupMap: Record<string, PLGroup> = {};
            typeForecasts.forEach(f => {
              const catId = f.category_id || "none";
              const info = catLookup[catId];
              const groupName = info?.groupName ?? "Sem categoria";
              const groupCode = info?.groupCode ?? "Z";
              const detailName = info?.name ?? "Sem categoria";
              const detailCode = info?.code ?? "Z.Z";

              if (!groupMap[groupCode]) {
                groupMap[groupCode] = { groupName, groupCode, totalForecast: 0, totalUsed: 0, details: [] };
              }
              const grp = groupMap[groupCode];
              let detail = grp.details.find(d => d.catId === catId);
              if (!detail) {
                detail = { catId, catName: detailName, catCode: detailCode, forecast: 0, used: 0, lines: [] };
                grp.details.push(detail);
              }
              detail.forecast += Number(f.amount);
              detail.lines.push(f);
              grp.totalForecast += Number(f.amount);
            });

            eventTransactions.filter(t => t.type === form.type).forEach(t => {
              const catId = t.category_id || "none";
              const info = catLookup[catId];
              const groupCode = info?.groupCode ?? "Z";
              const grp = groupMap[groupCode];
              if (grp) {
                const detail = grp.details.find(d => d.catId === catId);
                if (detail) {
                  detail.used += Number(t.amount);
                  grp.totalUsed += Number(t.amount);
                }
              }
            });

            // Inject cachê lines into Artístico group (2.1)
            if (totalCache > 0) {
              if (!groupMap["2.1"]) {
                groupMap["2.1"] = { groupName: "Artístico", groupCode: "2.1", totalForecast: 0, totalUsed: 0, details: [] };
              }
              const artGroup = groupMap["2.1"];
              // Find real category for Cachês (code 2.1.01)
              const cacheCat = categories.find(c => c.code === "2.1.01");
              const cacheCatId = cacheCat?.id ?? "cache-auto";
              let cacheDetail = artGroup.details.find(d => d.catCode === "2.1.01");
              if (!cacheDetail) {
                const artistNames = cacheLines.map(c => `Cachê ${c.artistName}`).join(", ");
                cacheDetail = {
                  catId: cacheCatId,
                  catName: cacheCat?.name ?? "Cachês (auto)",
                  catCode: "2.1.01",
                  forecast: 0,
                  used: 0,
                  lines: [{
                    id: "cache-auto",
                    type: "expense" as const,
                    category_id: cacheCatId,
                    amount: totalCache,
                    status: "draft",
                    description: artistNames || "Cachê",
                    iva_rate: 0,
                    specification: cacheLines.map(c => `${c.artistName}: ${c.amount.toFixed(2)}€ (${c.cacheType === "fixed" ? "fixo" : "variável"})`).join("; "),
                  }],
                };
                artGroup.details.push(cacheDetail);
              }
              cacheDetail.forecast += totalCache;
              artGroup.totalForecast += totalCache;
            }

            const groups = Object.values(groupMap)
              .map(g => ({ ...g, details: sortByHierarchicalCode(g.details, (detail) => detail.catCode) }))
              .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));

            const handleDetailClick = (detail: PLDetail) => {
              if (detail.catId === "none") return;
              const firstLine = detail.lines[0];
              setForm(prev => ({
                ...prev,
                category_id: detail.catId,
                description: firstLine?.description || prev.description,
                iva_rate: (firstLine?.iva_rate ?? prev.iva_rate) as IvaRate,
                specification: firstLine?.specification || prev.specification,
              }));
              setPlExpanded(false);
            };

            return (
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
                <button type="button" onClick={() => setPlExpanded(false)} className="w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  BP{hasPLRestriction ? " 🔒" : ""} — {form.type === "income" ? "Receitas" : "Despesas"} previstas ▲
                </button>
                <p className="text-[10px] text-muted-foreground">Clique numa linha para preencher automaticamente os dados da transação</p>
                <div
                  className="max-h-52 overflow-y-auto overscroll-contain border border-border/30 rounded"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  onWheel={(e) => {
                    const el = e.currentTarget;
                    const atTop = el.scrollTop === 0 && e.deltaY < 0;
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0;
                    if (!atTop && !atBottom) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/30">
                        <th className="text-left pb-1 font-medium">Conta</th>
                        <th className="text-right pb-1 font-medium">Previsto</th>
                        <th className="text-right pb-1 font-medium">Utilizado</th>
                        <th className="text-right pb-1 font-medium">Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(group => {
                        const groupRemaining = group.totalForecast - group.totalUsed;
                        const hasMultipleDetails = group.details.length > 1;
                        return (
                          <React.Fragment key={group.groupCode}>
                            {/* L2 Group header */}
                            <tr className="bg-muted/30 border-t border-border/20">
                              <td className="py-1.5 pr-2 font-semibold text-foreground">
                                <span className="text-muted-foreground mr-1">{group.groupCode}</span>
                                {group.groupName}
                              </td>
                              <td className="py-1.5 text-right font-mono font-semibold">{group.totalForecast.toFixed(2)}€</td>
                              <td className="py-1.5 text-right font-mono font-semibold">{group.totalUsed.toFixed(2)}€</td>
                              <td className={`py-1.5 text-right font-mono font-bold ${groupRemaining <= 0 ? "text-destructive" : "text-success"}`}>
                                {groupRemaining.toFixed(2)}€
                              </td>
                            </tr>
                            {/* L3 Detail lines */}
                            {group.details.map(detail => {
                              const remaining = detail.forecast - detail.used;
                              const isSelected = form.category_id === detail.catId;
                              return (
                                <tr
                                  key={detail.catId}
                                  onClick={() => handleDetailClick(detail)}
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? "bg-primary/10 font-medium"
                                      : "hover:bg-muted/40"
                                  }`}
                                >
                                  <td className="py-1.5 pr-2 pl-4">
                                    <span className="text-muted-foreground mr-1">{detail.catCode}</span>
                                    {detail.catName}
                                  </td>
                                  <td className="py-1.5 text-right font-mono">{detail.forecast.toFixed(2)}€</td>
                                  <td className="py-1.5 text-right font-mono">{detail.used.toFixed(2)}€</td>
                                  <td className={`py-1.5 text-right font-mono font-semibold ${
                                    remaining <= 0 ? "text-destructive" : "text-success"
                                  }`}>
                                    {remaining.toFixed(2)}€
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {hasPL && form.event_id && !plExpanded && (
            <button type="button" onClick={() => setPlExpanded(true)} className="w-full rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
              BP — {form.type === "income" ? "Receitas" : "Despesas"} previstas ▼
            </button>
          )}

          {/* BP Override toggle — only when restriction is active */}
          {hasPLRestriction && form.event_id && allowedCategoryIds.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPlOverride(!plOverride); setForm({ ...form, category_id: "", pl_override_note: "" }); }}
                className={`text-xs font-medium transition-colors ${plOverride ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
              >
                {plOverride ? "⚠️ Categoria fora do BP — Clique para reverter" : "Categoria não prevista? Clique aqui"}
              </button>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Categoria {hasPLRestriction && !plOverride ? "*" : ""}
              {plOverride && <span className="ml-1 text-warning font-semibold">⚠️ Fora do BP</span>}
            </label>
            <SearchableSelect
              options={categoryOptions}
              value={form.category_id}
              onValueChange={(v) => setForm({ ...form, category_id: v })}
              placeholder={hasPLRestriction && !plOverride ? "Selecionar do BP…" : "Selecionar categoria…"}
              searchPlaceholder="Pesquisar categoria…"
            />
          </div>

          {/* Justification field when BP override is active */}
          {plOverride && (
            <div>
              <label className="mb-1 block text-xs font-medium text-warning">Justificação *</label>
              <input
                value={form.pl_override_note}
                onChange={(e) => setForm({ ...form, pl_override_note: e.target.value })}
                className="w-full rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50"
                placeholder="Ex: Despesa urgente não prevista no orçamento inicial"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Venda de bilhetes" />
          </div>

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Detalhes adicionais da despesa" />
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Base (€) *</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
                <select value={form.iva_rate} onChange={(e) => setForm({ ...form, iva_rate: Number(e.target.value) as IvaRate })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value={23}>23% - Normal</option>
                  <option value={13}>13% - Intermédia</option>
                  <option value={6}>6% - Reduzida</option>
                  <option value={0}>0% - Isento</option>
                </select>
              </div>
            </div>
            {/* IVA breakdown */}
            {(() => {
              const base = parseFloat(form.amount) || 0;
              const ivaValue = base * (form.iva_rate / 100);
              const total = base + ivaValue;
              if (base <= 0) return null;
              return (
                <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">
                    Base: {base.toFixed(2)}€
                  </span>
                  <span className="text-muted-foreground">
                    + IVA ({form.iva_rate}%): {ivaValue.toFixed(2)}€
                  </span>
                  <span className="font-semibold text-foreground">
                    Total: {total.toFixed(2)}€
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Proration confirmation for multi_day parent */}
          {showProrationConfirm && isParentMultiDay && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-warning">Lançamento no evento-pai (rateio)</p>
                  <p className="text-xs text-muted-foreground">
                    Este valor será rateado igualmente por {(subEventsByParent[form.event_id] || []).length} datas nos relatórios DRE e BP.
                    Se pretende lançar para uma cidade específica, selecione a data correspondente.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-lg bg-warning/20 py-2 text-xs font-medium text-warning hover:bg-warning/30 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? "A guardar…" : "Confirmar Rateio"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProrationConfirm(false)}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Voltar e Escolher Data
                </button>
              </div>
            </div>
          )}

          {/* Budget indicator for BP */}
          {hasPL && form.category_id && form.event_id && (() => {
            const budgetKey = `${form.type}_${form.category_id}`;
            const forecast = forecastBudgetByCategory[budgetKey] || 0;
            const used = usedBudgetByCategory[budgetKey] || 0;
            const remaining = forecast - used;
            const pct = forecast > 0 ? (used / forecast) * 100 : 0;
            const newAmount = parseFloat(form.amount) || 0;
            const exceedsForcast = forecast > 0 && newAmount > remaining;
            return (
              <div className={`rounded-lg border p-3 space-y-1.5 ${exceedsForcast ? "border-warning bg-warning/10" : "border-border/50 bg-secondary/30"}`}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Orçamento BP</span>
                  <span className="font-mono font-medium">{pct.toFixed(0)}% utilizado</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Previsto: {forecast.toFixed(2)}€</span>
                  <span>Utilizado: {used.toFixed(2)}€</span>
                  <span className={remaining < 0 ? "text-destructive" : "text-success"}>Disponível: {remaining.toFixed(2)}€</span>
                </div>
                {exceedsForcast && (
                  <p className="flex items-center gap-1.5 text-xs text-warning font-medium pt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Valor ultrapassa o disponível em {(newAmount - remaining).toFixed(2)}€
                  </p>
                )}
              </div>
            );
          })()}

          {form.type === "income" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Destino *</label>
              <SearchableSelect
                options={accountOptions}
                value={form.account_id}
                onValueChange={(v) => setForm({ ...form, account_id: v })}
                placeholder="Selecionar conta…"
                searchPlaceholder="Pesquisar conta…"
              />
            </div>
          )}

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    options={supplierOptions}
                    value={form.supplier_id}
                    onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                    placeholder="Sem fornecedor"
                    searchPlaceholder="Pesquisar fornecedor…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors"
                  title="Cadastrar novo fornecedor"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <SupplierFormModal
                open={showNewSupplier}
                onOpenChange={setShowNewSupplier}
                onCreated={(id) => setForm((prev) => ({ ...prev, supplier_id: id }))}
              />
              {selectedSupplier && (
                <div className="mt-2">
                  <SupplierBankDetails supplier={selectedSupplier} defaultExpanded />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Lançamento</label>
              <DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} placeholder="Data…" />
            </div>
            {form.type === "expense" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vcto</label>
                <input
                  key={`due-date-${form.type}-${form.event_id || "none"}`}
                  type="text"
                  inputMode="numeric"
                  name="transaction_due_date"
                  autoComplete="off"
                  placeholder="dd/mm/aaaa"
                  value={form.due_date || ""}
                  onChange={(e) => setForm({ ...form, due_date: formatDueDateInput(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}
          </div>

          {!showProrationConfirm && (
            <button type="submit" disabled={createMutation.isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? "A guardar…" : "Criar Transação"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
