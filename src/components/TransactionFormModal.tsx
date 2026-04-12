import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

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
  reimbursement_note_id: string;
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
  reimbursement_note_id: "",
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
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [plExpanded, setPlExpanded] = useState(true);
  const [plOverride, setPlOverride] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom">("equal");
  const [isPaidByPartner, setIsPaidByPartner] = useState(false);
  const [paidByPartnerId, setPaidByPartnerId] = useState("");
  const [isTransitory, setIsTransitory] = useState(false);
  const [showNewReimbursementNote, setShowNewReimbursementNote] = useState(false);
  const [newReimbursementEmployeeName, setNewReimbursementEmployeeName] = useState("");
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

  // Event partners for "paid by partner" feature
  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event-partners-for-tx", form.event_id],
    queryFn: async () => {
      if (!form.event_id) return [];
      const { data, error } = await supabase
        .from("event_partners")
        .select("id, percentage, suppliers(name)")
        .eq("event_id", form.event_id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id,
  });

  const { data: reimbursementNotes = [] } = useQuery({
    queryKey: ["reimbursement-notes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .select("id, code, employee_name, status")
        .in("status", ["draft", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: form.is_reimbursement,
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

  // For parent multi_day events, fetch parent's own BP + child BPs for aggregation
  // For child (split) events, also include parent's BP lines (shared/prorated costs)
  const forecastEventIds = useMemo(() => {
    if (!form.event_id) return [];
    if (isParentMultiDay) {
      const childIds = (subEventsByParent[form.event_id] || []).map((e: any) => e.id);
      return [form.event_id, ...childIds];
    }
    // If this is a child event, include the parent's BP too
    const parentId = selectedEvent?.parent_event_id;
    if (parentId) {
      return [form.event_id, parentId];
    }
    return [form.event_id];
  }, [form.event_id, isParentMultiDay, subEventsByParent, selectedEvent?.parent_event_id]);

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
        .select("id, event_id, type, category_id, amount, status, description, iva_rate, specification")
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

  // When selecting a parent multi_day event, only show the parent's own BP lines (for proration)
  const relevantForecasts = useMemo(() => {
    if (isParentMultiDay) {
      return eventForecasts.filter((f: any) => f.event_id === form.event_id);
    }
    return eventForecasts;
  }, [eventForecasts, isParentMultiDay, form.event_id]);

  const forecastBudgetByCategory = hasPL
    ? relevantForecasts.reduce<Record<string, number>>((acc, f) => {
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
    ? [...new Set(relevantForecasts.filter(f => f.type === form.type).map(f => f.category_id).filter(Boolean))]
    : [];

  // --- BP data for split events ---
  const splitEventIds = useMemo(() => splitEntries.map(e => e.event_id), [splitEntries]);

  // Find parent event IDs for split entries (for category validation)
  const splitParentEventIds = useMemo(() => {
    if (!isSplit || splitEventIds.length === 0) return [];
    const parentIds = new Set<string>();
    for (const eventId of splitEventIds) {
      const ev = events.find((e: any) => e.id === eventId);
      if (ev?.parent_event_id) parentIds.add(ev.parent_event_id);
    }
    return [...parentIds];
  }, [isSplit, splitEventIds, events]);

  // Fetch parent event forecasts for split validation
  const { data: parentForecasts = [] } = useQuery({
    queryKey: ["split-parent-bp-forecasts", splitParentEventIds],
    queryFn: async () => {
      if (splitParentEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, type, category_id, amount")
        .in("event_id", splitParentEventIds);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitParentEventIds.length > 0,
  });

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

  // Validate split category against parent/child BP rules
  const splitCategoryBlockReason = useMemo<string | null>(() => {
    if (!isSplit || !form.category_id || splitEventIds.length === 0) return null;

    // Rule 1: Category already exists in the parent/master event's BP → block
    if (splitParentEventIds.length > 0) {
      const categoryInParent = parentForecasts.some(
        f => f.type === form.type && f.category_id === form.category_id
      );
      if (categoryInParent) {
        const parentEvent = events.find((e: any) => splitParentEventIds.includes(e.id));
        const parentName = parentEvent?.name ?? "evento master";
        return `Esta categoria já existe no BP do ${parentName}. A transação deve ser criada directamente no evento master, que fará o rateio automático para os sub-eventos.`;
      }
    }

    // Rule 2: Category exists in ALL child events but NOT in the parent → block & guide
    if (splitParentEventIds.length > 0 && splitEventIds.length >= 2) {
      const categoryInParent = parentForecasts.some(
        f => f.type === form.type && f.category_id === form.category_id
      );
      if (!categoryInParent) {
        const allChildrenHaveCategory = splitEventIds.every(eventId => {
          return splitForecasts.some(
            f => f.event_id === eventId && f.type === form.type && f.category_id === form.category_id
          );
        });
        if (allChildrenHaveCategory) {
          const parentEvent = events.find((e: any) => splitParentEventIds.includes(e.id));
          const parentName = parentEvent?.name ?? "evento master";
          const selectedCat = categories.find((c: any) => c.id === form.category_id);
          const catLabel = selectedCat ? `${selectedCat.code} ${selectedCat.name}` : "esta categoria";
          return `A categoria "${catLabel}" existe individualmente no BP de cada sub-evento, mas não no evento master (${parentName}). Para criar uma transação com rateio, primeiro adicione esta linha ao BP do evento master. O sistema fará a projeção automática para os sub-eventos.`;
        }
      }
    }

    return null;
  }, [isSplit, form.category_id, form.type, splitEventIds, splitParentEventIds, parentForecasts, splitForecasts, events, categories]);

  // Check if any split event needs BP bypass
  const splitNeedsBypass = useMemo(() => {
    if (!isSplit || !form.category_id || splitCategoryBlockReason) return false;
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
  }, [isSplit, form.category_id, form.amount, splitEntries, splitBPInfoByEvent, splitCategoryBlockReason]);

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
            is_transitory: isTransitory,
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
          is_transitory: isTransitory,
        } as any).select("id").single();
        if (parentError) throw parentError;
        const parentId = parentRow.id;

        // 3. Set parent ID on children and insert
        const childInsertsWithParent = childInserts.map(c => ({ ...c, parent_transaction_id: parentId }));
        const { error: childError } = await supabase.from("transactions").insert(childInsertsWithParent as any);
        if (childError) throw childError;
      } else {
        // --- SINGLE TRANSACTION ---
        const hasForecastMatch = relevantForecasts.length > 0 && relevantForecasts.some(
          (f) => f.type === data.type && f.category_id === data.category_id
        );
        const autoApproved = hasForecastMatch;

        const accountId = data.is_reimbursement || isPaidByPartner ? null : (data.account_id || null);

        const { data: insertedTx, error } = await supabase.from("transactions").insert({
          description: data.description,
          type: data.type,
          amount: parseFloat(data.amount),
          iva_rate: data.iva_rate,
          event_id: data.event_id || null,
          category_id: data.category_id || null,
          supplier_id: data.supplier_id || null,
          account_id: accountId,
          specification: data.type === "expense" ? (data.specification || null) : null,
          pl_override_note: data.pl_override_note.trim() || null,
          date: data.date,
          due_date: parseDueDateForDb(data.due_date),
          status: autoApproved ? "approved" : "pending",
          paid_amount: 0,
          is_reimbursement: data.is_reimbursement,
          reimbursement_to: data.is_reimbursement ? (data.reimbursement_to.trim() || null) : null,
          is_transitory: isTransitory,
        } as any).select("id").single();
        if (error) throw error;

        // Auto-link to partner if paid by partner
        if (isPaidByPartner && paidByPartnerId && insertedTx?.id && data.event_id) {
          await supabase.from("partner_paid_expenses").insert({
            event_id: data.event_id,
            partner_id: paidByPartnerId,
            transaction_id: insertedTx.id,
          });
        }

        // Auto-link to reimbursement note
        if (data.is_reimbursement && insertedTx?.id) {
          let noteId = data.reimbursement_note_id;

          // Create new note if needed
          if (!noteId && showNewReimbursementNote && newReimbursementEmployeeName.trim()) {
            const { data: newNote, error: noteError } = await supabase
              .from("reimbursement_notes")
              .insert({
                employee_name: newReimbursementEmployeeName.trim(),
                created_by: "system",
                code: "",
              } as any)
              .select("id")
              .single();
            if (noteError) throw noteError;
            noteId = newNote.id;
          }

          if (noteId) {
            // Link transaction to the note
            await supabase.from("reimbursement_note_items").insert({
              reimbursement_note_id: noteId,
              transaction_id: insertedTx.id,
            });

            // Update note total
            const txAmount = parseFloat(data.amount);
            const { data: currentNote } = await supabase
              .from("reimbursement_notes")
              .select("total_amount")
              .eq("id", noteId)
              .single();
            await supabase
              .from("reimbursement_notes")
              .update({ total_amount: (Number(currentNote?.total_amount) || 0) + txAmount } as any)
              .eq("id", noteId);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes-active"] });
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

  const proceedWithCreate = () => {
    setShowDuplicateConfirm(false);
    setShowProrationConfirm(false);
    createMutation.mutate(form);
  };

  const checkDuplicatesAndSubmit = async () => {
    // Check for existing transactions with same description + event + similar amount
    try {
      let query = supabase
        .from("transactions")
        .select("id, description, amount, status, due_date, supplier_id, event_id")
        .ilike("description", form.description.trim());

      if (form.event_id) {
        query = query.eq("event_id", form.event_id);
      }

      const { data: matches } = await query.limit(10);

      if (matches && matches.length > 0) {
        const amount = parseFloat(form.amount) || 0;
        const relevant = matches.filter((m: any) => {
          const diff = Math.abs(Number(m.amount) - amount);
          return diff < 0.01 || form.supplier_id === m.supplier_id;
        });
        if (relevant.length > 0) {
          setDuplicateMatches(relevant);
          setShowDuplicateConfirm(true);
          return;
        }
      }
    } catch {
      // If check fails, proceed anyway
    }

    if (isParentMultiDay && !showProrationConfirm) {
      setShowProrationConfirm(true);
      return;
    }
    proceedWithCreate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.is_reimbursement && !form.reimbursement_note_id && !showNewReimbursementNote) {
      toast({ title: "Selecione ou crie uma Nota de Reembolso", variant: "destructive" });
      return;
    }
    if (form.is_reimbursement && showNewReimbursementNote && !newReimbursementEmployeeName.trim()) {
      toast({ title: "Indique o nome do funcionário para a nova nota", variant: "destructive" });
      return;
    }
    if (isPaidByPartner && !paidByPartnerId) {
      toast({ title: "Selecione o sócio que pagou a despesa", variant: "destructive" });
      return;
    }

    // Split validation
    if (isSplit) {
      if (splitCategoryBlockReason) {
        toast({ title: "Categoria bloqueada para rateio", description: splitCategoryBlockReason, variant: "destructive" });
        return;
      }
      if (splitEntries.length < 2) {
        toast({ title: "Selecione pelo menos 2 eventos para rateio", variant: "destructive" });
        return;
      }
      const totalPct = splitEntries.reduce((s, e) => s + e.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        toast({ title: "A soma das percentagens deve ser 100%", variant: "destructive" });
        return;
      }
      if (splitNeedsBypass && !plOverride) {
        toast({ title: "Rateio inclui eventos com BP que requerem justificação. Ative 'Fora do BP'.", variant: "destructive" });
        return;
      }
      if (plOverride && !form.pl_override_note.trim()) {
        toast({ title: "Justificação obrigatória para categorias fora do BP", variant: "destructive" });
        return;
      }
    } else {
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

    // Skip duplicate check if already confirmed
    if (showDuplicateConfirm) {
      if (isParentMultiDay && !showProrationConfirm) {
        setShowProrationConfirm(true);
        return;
      }
      proceedWithCreate();
      return;
    }

    checkDuplicatesAndSubmit();
  };

  const filteredCategories = categories.filter((c) => {
    const typeMatch = form.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    // Only leaf categories (no children)
    const isLeaf = !categories.some((ch) => ch.parent_id === c.id);
    if (!isLeaf) return false;
    if (hasPLRestriction && form.event_id && !plOverride) {
      if (isParentMultiDay) {
        return allowedCategoryIds.includes(c.id);
      }
      if (allowedCategoryIds.length > 0) {
        return allowedCategoryIds.includes(c.id);
      }
    }
    return true;
  });

  // Build hierarchical category options: L1/L2 as headers, L3 as selectable
  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string; description?: string; isHeader?: boolean; indentLevel?: number; searchText?: string }[] = [];

    // Build parent maps
    const catById = new Map(categories.map(c => [c.id, c]));
    
    // Group filtered (leaf) categories by their ancestry
    const leafSet = new Set(filteredCategories.map(c => c.id));
    
    // Collect all ancestor chains for visible leaves
    type TreeNode = { cat: any; children: TreeNode[] };
    const rootNodes: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    // Find all ancestors needed
    const neededIds = new Set<string>();
    filteredCategories.forEach(c => {
      neededIds.add(c.id);
      let cur = c;
      while (cur.parent_id && catById.has(cur.parent_id)) {
        neededIds.add(cur.parent_id);
        cur = catById.get(cur.parent_id)!;
      }
    });

    // Build tree from needed categories
    const neededCats = Array.from(neededIds).map(id => catById.get(id)!).filter(Boolean);
    neededCats.forEach(c => nodeMap.set(c.id, { cat: c, children: [] }));
    neededCats.forEach(c => {
      const node = nodeMap.get(c.id)!;
      if (c.parent_id && nodeMap.has(c.parent_id)) {
        nodeMap.get(c.parent_id)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // Sort by code
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => compareHierarchicalCodes(a.cat.code, b.cat.code));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(rootNodes);

    // Flatten tree into options
    const flatten = (nodes: TreeNode[], level: number) => {
      nodes.forEach(node => {
        const isLeaf = leafSet.has(node.cat.id);
        if (isLeaf) {
          // BP description enrichment
          let description: string | undefined;
          if (hasPL && form.event_id && !plOverride) {
            const bpLines = relevantForecasts.filter(f => f.category_id === node.cat.id && f.type === form.type);
            if (bpLines.length > 0) {
              description = bpLines.map(l => l.description).join(", ");
            }
          }
          opts.push({ value: node.cat.id, label: `${node.cat.code} ${node.cat.name}`, description, indentLevel: level, searchText: description });
        } else {
          // Header (L1 or L2)
          opts.push({ value: `header-${node.cat.id}`, label: `${node.cat.code} ${node.cat.name}`, isHeader: true, indentLevel: level });
        }
        if (node.children.length > 0) {
          flatten(node.children, level + 1);
        }
      });
    };
    flatten(rootNodes, 0);

    return opts;
  }, [filteredCategories, categories, hasPL, form.event_id, form.type, plOverride, relevantForecasts]);
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
                onValueChange={(v) => {
                  setForm({ ...form, event_id: v, category_id: "", pl_override_note: "" });
                  setPlExpanded(true);
                  setShowProrationConfirm(false);
                  setPlOverride(false);
                  // Auto-enable split when selecting a parent (multi_day) event with children
                  const ev = events.find((e: any) => e.id === v);
                  const children = subEventsByParent[v] || [];
                  if (ev?.event_type === "multi_day" && children.length > 0) {
                    setIsSplit(true);
                    setForm(prev => ({ ...prev, event_id: "" }));
                    const pct = +(100 / children.length).toFixed(2);
                    const entries: SplitEntry[] = children.map((child: any, idx: number) => {
                      const parentName = ev.name;
                      const name = `${parentName} — ${child.name}`;
                      const percentage = idx === children.length - 1
                        ? +(100 - pct * (children.length - 1)).toFixed(2)
                        : pct;
                      return { event_id: child.id, event_name: name, percentage };
                    });
                    setSplitEntries(entries);
                    setSplitMethod("equal");
                  }
                }}
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
              {/* Category block warning for split mode */}
              {splitCategoryBlockReason && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Categoria bloqueada para rateio
                  </div>
                  <p className="text-xs text-destructive/90 leading-relaxed">{splitCategoryBlockReason}</p>
                </div>
              )}
              {/* BP Override toggle for split mode */}
              {splitNeedsBypass && !splitCategoryBlockReason && (
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
              {plOverride && splitNeedsBypass && !splitCategoryBlockReason && (
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
            const typeForecasts = relevantForecasts.filter(f => f.type === form.type);

            // Calculate cachê lines for expense view
            const cacheLines = form.type === "expense" && cacheConfigs.length > 0
              ? calculateCacheLinesForPL(
                  cacheConfigs,
                  cacheDeductions,
                  ticketRevenueNet,
                  relevantForecasts.map(f => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
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
                    event_id: form.event_id,
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

            const handleLineClick = (line: any, detail: PLDetail) => {
              if (detail.catId === "none") return;
              setForm(prev => ({
                ...prev,
                category_id: detail.catId,
                description: line.description || prev.description,
                amount: String(Number(line.amount) || prev.amount),
                iva_rate: (line.iva_rate ?? prev.iva_rate) as IvaRate,
                specification: line.specification || prev.specification,
              }));
              setPlExpanded(false);
            };

            const handleDetailClick = (detail: PLDetail) => {
              if (detail.catId === "none") return;
              if (detail.lines.length === 1) {
                handleLineClick(detail.lines[0], detail);
                return;
              }
              // Multiple lines — set category and collapse
              setForm(prev => ({
                ...prev,
                category_id: detail.catId,
              }));
              setPlExpanded(false);
            };

            return (
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
                <button type="button" onClick={() => setPlExpanded(false)} className="w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  BP{hasPLRestriction ? " 🔒" : ""} — {form.type === "income" ? "Receitas" : "Despesas"} previstas ▲
                </button>
                <p className="text-[10px] text-muted-foreground">Clique numa linha de previsão para preencher automaticamente os dados da transação</p>
                <div
                  className="max-h-64 overflow-y-auto overscroll-contain border border-border/30 rounded"
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
                        <th className="text-left pb-1 font-medium">Conta / Previsão</th>
                        <th className="text-right pb-1 font-medium">Previsto</th>
                        <th className="text-right pb-1 font-medium">Utilizado</th>
                        <th className="text-right pb-1 font-medium">Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(group => {
                        const groupRemaining = group.totalForecast - group.totalUsed;
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
                            {/* L3 Detail lines with individual forecasts */}
                            {group.details.map(detail => {
                              const remaining = detail.forecast - detail.used;
                              const isSelected = form.category_id === detail.catId;
                              const hasMultipleLines = detail.lines.length > 1;
                              return (
                                <React.Fragment key={detail.catId}>
                                  <tr
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
                                      {hasMultipleLines && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">({detail.lines.length} linhas)</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right font-mono">{detail.forecast.toFixed(2)}€</td>
                                    <td className="py-1.5 text-right font-mono">{detail.used.toFixed(2)}€</td>
                                    <td className={`py-1.5 text-right font-mono font-semibold ${
                                      remaining <= 0 ? "text-destructive" : "text-success"
                                    }`}>
                                      {remaining.toFixed(2)}€
                                    </td>
                                  </tr>
                                  {/* Individual forecast lines */}
                                  {detail.lines.map((line: any) => (
                                    <tr
                                      key={line.id}
                                      onClick={() => handleLineClick(line, detail)}
                                      className={`cursor-pointer transition-colors border-l-2 ${
                                        form.category_id === detail.catId && form.description === line.description
                                          ? "border-l-primary bg-primary/5 font-medium"
                                          : "border-l-transparent hover:bg-muted/20 hover:border-l-primary/30"
                                      }`}
                                    >
                                      <td className="py-1 pr-2 pl-8 text-[10px]">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${line.status === "approved" ? "bg-success" : "bg-warning"}`} />
                                          <span className="truncate">{line.description}</span>
                                          {line.specification && (
                                            <span className="text-muted-foreground truncate">· {line.specification}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-1 text-right font-mono text-[10px]">{Number(line.amount).toFixed(2)}€</td>
                                      <td className="py-1 text-right font-mono text-[10px] text-muted-foreground">
                                        {line.iva_rate}%
                                      </td>
                                      <td className="py-1 text-right font-mono text-[10px]">
                                        {(Number(line.amount) * (1 + Number(line.iva_rate) / 100)).toFixed(2)}€
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
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

          {/* Duplicate detection warning */}
          {showDuplicateConfirm && duplicateMatches.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">⚠️ Possível duplicação detectada</p>
                  <p className="text-xs text-muted-foreground">
                    Já existe(m) {duplicateMatches.length} transação(ões) com descrição e valores semelhantes:
                  </p>
                  <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                    {duplicateMatches.map((m: any) => {
                      const evName = events.find((e: any) => e.id === m.event_id)?.name;
                      const suppName = suppliers.find((s: any) => s.id === m.supplier_id)?.name;
                      return (
                        <div key={m.id} className="text-xs bg-background/60 rounded px-2 py-1.5 border border-border">
                          <span className="font-medium">{m.description}</span>
                          <span className="text-muted-foreground"> — {Number(m.amount).toFixed(2)}€</span>
                          {evName && <span className="text-muted-foreground"> · {evName}</span>}
                          {suppName && <span className="text-muted-foreground"> · {suppName}</span>}
                          <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            m.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                          }`}>
                            {m.status === "paid" ? "Pago" : m.status === "approved" ? "Aprovado" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isParentMultiDay) {
                      setShowDuplicateConfirm(false);
                      setShowProrationConfirm(true);
                    } else {
                      proceedWithCreate();
                    }
                  }}
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-lg bg-destructive/20 py-2 text-xs font-medium text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? "A guardar…" : "Criar Mesmo Assim"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDuplicateConfirm(false); setDuplicateMatches([]); }}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Proration confirmation for multi_day parent */}
          {showProrationConfirm && isParentMultiDay && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-warning">Lançamento master (rateio)</p>
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

          {/* Reimbursement toggle — only for expenses */}
          {form.type === "expense" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const next = !form.is_reimbursement;
                    setForm({ ...form, is_reimbursement: next, reimbursement_to: "", reimbursement_note_id: "", account_id: next ? "" : form.account_id });
                    if (next) { setIsPaidByPartner(false); setPaidByPartnerId(""); setShowNewReimbursementNote(false); setNewReimbursementEmployeeName(""); }
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    form.is_reimbursement
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  💰 {form.is_reimbursement ? "Reembolso Ativo" : "Marcar como Reembolso"}
                  <HelpTooltip text={helpTexts.reimbursementToggle} size={12} />
                </button>

                {/* Paid by partner toggle — only when event has partners */}
                {form.event_id && eventPartners.length > 0 && !form.is_reimbursement && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isPaidByPartner;
                      setIsPaidByPartner(next);
                      setPaidByPartnerId("");
                      if (next) { setForm({ ...form, account_id: "" }); }
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isPaidByPartner
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🤝 {isPaidByPartner ? "Pago por Sócio" : "Pago por Sócio"}
                    <HelpTooltip text={helpTexts.paidByPartnerToggle} size={12} />
                  </button>
                )}

                {/* Transitory toggle — admin/manager only */}
                {(authIsAdmin || authIsManager) && (
                <button
                  type="button"
                  onClick={() => setIsTransitory(!isTransitory)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    isTransitory
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🔄 {isTransitory ? "Transitória" : "Marcar como Transitória"}
                  <HelpTooltip text={helpTexts.transitoryToggle} size={12} />
                </button>
                )}
              </div>
              {form.is_reimbursement && (
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota de Reembolso *</label>
                  {!showNewReimbursementNote ? (
                    <div className="space-y-2">
                      <SearchableSelect
                        options={reimbursementNotes.map((n: any) => ({
                          value: n.id,
                          label: `${n.code} — ${n.employee_name}`,
                        }))}
                        value={form.reimbursement_note_id}
                        onValueChange={(v) => {
                          const note = reimbursementNotes.find((n: any) => n.id === v);
                          setForm({ ...form, reimbursement_note_id: v, reimbursement_to: note?.employee_name || "" });
                        }}
                        placeholder="Selecionar nota existente…"
                        searchPlaceholder="Pesquisar por código ou funcionário…"
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewReimbursementNote(true); setForm({ ...form, reimbursement_note_id: "" }); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Criar nova nota
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={newReimbursementEmployeeName}
                        onChange={(e) => {
                          setNewReimbursementEmployeeName(e.target.value);
                          setForm({ ...form, reimbursement_to: e.target.value });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Nome do funcionário"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewReimbursementNote(false); setNewReimbursementEmployeeName(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        ← Selecionar nota existente
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    A transação será vinculada automaticamente à nota de reembolso — sem conta financeira associada
                  </p>
                </div>
              )}
              {isPaidByPartner && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Sócio que pagou *</label>
                  <SearchableSelect
                    options={eventPartners.map((p: any) => ({
                      value: p.id,
                      label: `${p.suppliers?.name} (${p.percentage}%)`,
                    }))}
                    value={paidByPartnerId}
                    onValueChange={setPaidByPartnerId}
                    placeholder="Selecionar sócio…"
                    searchPlaceholder="Pesquisar…"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Despesa paga diretamente pelo sócio — sem conta financeira da empresa
                  </p>
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

          {!showProrationConfirm && !showDuplicateConfirm && (
            <button type="submit" disabled={createMutation.isPending || !!(isSplit && splitCategoryBlockReason)}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? "A guardar…" : "Criar Transação"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
