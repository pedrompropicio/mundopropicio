import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X, Building, FileText, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { DatePicker } from "@/components/ui/date-picker";
import { sortByHierarchicalCode, cn } from "@/lib/utils";
import { PaymentTimeline } from "@/components/PaymentTimeline";
import { ReimbursementNoteRefBadge } from "@/components/ReimbursementNoteRefBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CurrencyAmountInput } from "@/components/CurrencyAmountInput";
import { CurrencyBadge } from "@/components/CurrencyBadge";
import { CurrencyCode, isSupportedCurrency, eurToOriginal } from "@/lib/currency";
import { TransactionCamarimTab } from "@/components/camarim/TransactionCamarimTab";
import { WithholdingDeclaredFields } from "@/components/WithholdingDeclaredFields";

type PaymentMethod = "transfer" | "service_payment" | "state_payment";

interface Props {
  transaction: any;
  onClose: () => void;
  isAdmin: boolean;
}

export function TransactionEditModal({ transaction, onClose, isAdmin }: Props) {
  const isPaid = transaction.status === "paid";
  // Admins can fully edit paid transactions (audit adjustment)
  const paidLocked = isPaid && !isAdmin;

  const [form, setForm] = useState({
    description: transaction.description,
    amount: String(transaction.amount),
    iva_rate: transaction.iva_rate as IvaRate,
    event_id: transaction.event_id,
    category_id: transaction.category_id ?? "",
    supplier_id: transaction.supplier_id ?? "",
    account_id: transaction.account_id ?? "",
    date: transaction.date,
    due_date: transaction.due_date ?? "",
    payment_date: transaction.payment_date ?? "",
    specification: transaction.specification ?? "",
    is_transitory: transaction.is_transitory ?? false,
    exclude_from_result: transaction.exclude_from_result ?? false,
    invoice_ref: transaction.invoice_ref ?? "",
    payment_method: (transaction.payment_method ?? "transfer") as PaymentMethod,
    payment_entity: transaction.payment_entity ?? "",
    payment_reference: transaction.payment_reference ?? "",
    declared_withholding_rate: transaction.declared_withholding_rate != null ? String(transaction.declared_withholding_rate) : "",
    declared_withholding_amount: transaction.declared_withholding_amount != null ? String(transaction.declared_withholding_amount) : "",
    is_reimbursement: transaction.is_reimbursement ?? false,
    reimbursement_to: transaction.reimbursement_to ?? "",
  });
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();

  // Multi-currency state
  const initCurrency: CurrencyCode = isSupportedCurrency(transaction.currency) ? transaction.currency : "EUR";
  const [currency, setCurrency] = useState<CurrencyCode>(initCurrency);
  const [originalAmount, setOriginalAmount] = useState<string>(
    initCurrency === "EUR"
      ? ""
      : String(transaction.original_amount ?? eurToOriginal(Number(transaction.amount), Number(transaction.fx_rate) || 1))
  );
  const [fxRate, setFxRate] = useState<string>(initCurrency === "EUR" ? "" : String(transaction.fx_rate ?? ""));
  const [fxRateSource, setFxRateSource] = useState<"manual" | "suggested">(
    transaction.fx_rate_source === "suggested" ? "suggested" : "manual"
  );
  const [eurFromCurrency, setEurFromCurrency] = useState<number>(Number(transaction.amount) || 0);
  useEffect(() => {
    if (currency !== "EUR") {
      setForm((f) => ({ ...f, amount: eurFromCurrency ? String(eurFromCurrency) : "" }));
    }
  }, [currency, eurFromCurrency]);

  // Check if this is a parent split transaction (has children)
  const isAbsoluteMode = (transaction.split_mode ?? "percentage") === "absolute";
  const { data: childTransactions = [] } = useQuery({
    queryKey: ["child-transactions-full", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, split_percentage, split_amount, amount, event_id, events(name)")
        .eq("parent_transaction_id", transaction.id)
        .not("split_percentage", "is", null);
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        split_percentage: c.split_percentage,
        split_amount: c.split_amount,
        amount: Number(c.amount),
        event_id: c.event_id,
        event_name: c.events?.name ?? "—",
      }));
    },
  });
  const hasChildren = childTransactions.length > 0;

  // Editable child amounts for absolute mode adjustment
  const [childAdjustments, setChildAdjustments] = useState<Record<string, number>>({});

  // Initialize child adjustments when children load
  useEffect(() => {
    if (hasChildren && Object.keys(childAdjustments).length === 0) {
      const initial: Record<string, number> = {};
      childTransactions.forEach((c: any) => {
        initial[c.id] = c.amount;
      });
      setChildAdjustments(initial);
    }
  }, [hasChildren, childTransactions.length]);

  const newParentAmount = parseFloat(form.amount) || 0;
  const amountChanged = hasChildren && newParentAmount !== Number(transaction.amount);
  
  const childAdjustmentTotal = useMemo(() => {
    return Object.values(childAdjustments).reduce((s, v) => s + v, 0);
  }, [childAdjustments]);
  
  const childMismatch = hasChildren && amountChanged && Math.abs(childAdjustmentTotal - newParentAmount) > 0.01;

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase.from("suppliers").select("id, name, trade_name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).eq("is_hidden", false).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Detect if this transaction was generated by the consolidated camarim integration
  const { data: camarimItemsCount = 0 } = useQuery({
    queryKey: ["transaction-has-camarim", transaction.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("camarim_items")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", transaction.id);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const hasCamarim = camarimItemsCount > 0;
  const { data: partnerPaidLink } = useQuery({
    queryKey: ["partner-paid-link", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("id, partner_id, paid_date, event_partners(suppliers(name), percentage)")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isPaidByPartner = !!partnerPaidLink;

  // Detect if this transaction is already linked to a reimbursement note
  // (used to block toggling "Reembolso" OFF while it's part of a note).
  const { data: reimbursementNoteLink } = useQuery({
    queryKey: ["transaction-reimbursement-note-link", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_note_items")
        .select("id, reimbursement_note_id, reimbursement_notes:reimbursement_note_id(code, status)")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isLinkedToReimbursementNote = !!reimbursementNoteLink;
  const [partnerPaidDate, setPartnerPaidDate] = useState<string>("");
  useEffect(() => {
    if (partnerPaidLink?.paid_date) setPartnerPaidDate(partnerPaidLink.paid_date);
  }, [partnerPaidLink?.paid_date]);

  // Detect if this transaction is an Extra do Sócio (despesa a abater do sócio no fecho)
  const { data: partnerExtraLink } = useQuery({
    queryKey: ["partner-extra-link", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_advance_expenses")
        .select("id, partner_id, event_id, event_partners(suppliers(name), percentage)")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isPartnerExtra = !!partnerExtraLink;

  // Estado do evento (para bloqueio em "Concluído" para não-admins)
  const { data: eventInfo } = useQuery({
    queryKey: ["event-status-edit", form.event_id],
    queryFn: async () => {
      if (!form.event_id) return null;
      const { data, error } = await supabase
        .from("events")
        .select("id, status")
        .eq("id", form.event_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!form.event_id,
  });
  const eventCompleted = eventInfo?.status === "completed";
  const canEditPartnerExtra = isAdmin || (!eventCompleted && isManager);

  // Detecta se EXISTE irmã transitória vinculada à mesma fatura (split parcial criado na origem).
  // Quando existe, "Reverter" = eliminar irmã + apagar partner_advance_expenses dela; a principal
  // já está NORMAL pelo total.
  const invoiceGroupId = transaction.invoice_group_id ?? null;
  const { data: extraSibling } = useQuery({
    queryKey: ["partner-extra-sibling", transaction.id, invoiceGroupId],
    queryFn: async () => {
      if (!invoiceGroupId) return null;
      const { data: siblings, error } = await supabase
        .from("transactions")
        .select("id, amount, is_transitory")
        .eq("invoice_group_id", invoiceGroupId)
        .neq("id", transaction.id);
      if (error) throw error;
      if (!siblings?.length) return null;
      const ids = siblings.map((s: any) => s.id);
      const { data: links } = await supabase
        .from("partner_advance_expenses")
        .select("id, transaction_id, partner_id, event_partners(suppliers(name))")
        .in("transaction_id", ids);
      if (!links?.length) return null;
      const link = links[0] as any;
      const sib = siblings.find((s: any) => s.id === link.transaction_id);
      return sib ? { ...sib, link } : null;
    },
    enabled: !!invoiceGroupId,
  });
  // "principalDeSplitParcial" = esta tx é a principal (NORMAL) e existe irmã transitória do sócio
  const isPrincipalOfPartialSplit = !isPartnerExtra && !!extraSibling;

  // Partners for the event (used to convert/change Extra)
  const { data: eventPartnersForExtra = [] } = useQuery({
    queryKey: ["event-partners-edit", form.event_id],
    queryFn: async () => {
      if (!form.event_id) return [];
      const { data, error } = await supabase
        .from("event_partners")
        .select("id, percentage, suppliers(name)")
        .eq("event_id", form.event_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.event_id,
  });

  // UI state — conversão e reversão parciais
  const [convertPartnerId, setConvertPartnerId] = useState<string>("");
  const [convertIsPartial, setConvertIsPartial] = useState(false);
  const [convertPartialAmount, setConvertPartialAmount] = useState("");
  const [revertIsPartial, setRevertIsPartial] = useState(false);
  const [revertPartialAmount, setRevertPartialAmount] = useState("");

  const editMutation = useMutation({
    mutationFn: async () => {
      const changes: { field_name: string; old_value: string; new_value: string }[] = [];
      const fieldLabels: Record<string, string> = {
        description: "Descrição", amount: "Valor", iva_rate: "Taxa IVA",
        event_id: "Evento", category_id: "Categoria", supplier_id: "Fornecedor",
        account_id: "Conta", specification: "Especificação", date: "Data", due_date: "Data Vencimento", payment_date: "Data Pagamento",
        is_transitory: "Transitória",
        exclude_from_result: "Fora do Resultado",
        invoice_ref: "Nº Fatura",
        payment_method: "Método Pagamento",
        payment_entity: "Entidade Pagamento",
        payment_reference: "Referência Pagamento",
        declared_withholding_rate: "Retenção IRS declarada (%)",
        declared_withholding_amount: "Retenção IRS declarada (€)",
        is_reimbursement: "Reembolso",
        reimbursement_to: "Colaborador (reembolso)",
      };
      const allowedFields = paidLocked
        ? ["specification", "supplier_id", "is_transitory", "exclude_from_result", "invoice_ref", "payment_method", "payment_entity", "payment_reference"]
        : Object.keys(fieldLabels);
      for (const key of allowedFields) {
        const oldVal = String(transaction[key] ?? "");
        const newVal = String((form as any)[key] ?? "");
        if (oldVal !== newVal) {
          changes.push({ field_name: fieldLabels[key], old_value: oldVal, new_value: newVal });
        }
      }
      if (changes.length === 0) throw new Error("Nenhuma alteração detectada.");

      const paymentFields = {
        payment_method: form.payment_method,
        payment_entity: form.payment_method === "service_payment" ? (form.payment_entity.trim() || null) : null,
        payment_reference: form.payment_method !== "transfer" ? (form.payment_reference.trim() || null) : null,
      };

      const updates = paidLocked ? {
        supplier_id: form.supplier_id || null,
        specification: transaction.type === "expense" ? (form.specification || null) : null,
        is_transitory: form.is_transitory,
        exclude_from_result: form.exclude_from_result,
        invoice_ref: form.invoice_ref.trim() || null,
        ...(isPaidByPartner ? {} : paymentFields),
        ...(isPaidByPartner ? { account_id: null, payment_date: partnerPaidDate || form.date } : {}),
      } : {
        description: form.description,
        amount: parseFloat(form.amount),
        iva_rate: form.iva_rate,
        event_id: form.event_id,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        account_id: isPaidByPartner ? null : (form.account_id || null),
        specification: transaction.type === "expense" ? (form.specification || null) : null,
        date: form.date,
        due_date: form.due_date || null,
        ...(isPaidByPartner
          ? { payment_date: partnerPaidDate || form.date }
          : (isAdmin && isPaid ? { payment_date: form.payment_date || null } : {})),
        is_transitory: form.is_transitory,
        exclude_from_result: form.exclude_from_result,
        invoice_ref: form.invoice_ref.trim() || null,
        ...(isPaidByPartner ? {} : paymentFields),
        currency,
        original_amount: currency === "EUR" ? null : (parseFloat(originalAmount) || null),
        fx_rate: currency === "EUR" ? null : (parseFloat(fxRate) || null),
        fx_rate_source: currency === "EUR" ? null : fxRateSource,
        declared_withholding_rate: transaction.type === "expense" && parseFloat(form.declared_withholding_rate) > 0 ? Number(form.declared_withholding_rate) : null,
        declared_withholding_amount: transaction.type === "expense" && parseFloat(form.declared_withholding_amount) > 0 ? parseFloat(form.declared_withholding_amount) : null,
        // Reembolso: só permitimos alterar em despesas ainda não aprovadas/pagas (ver UI).
        // Se desligado, limpa também reimbursement_to.
        ...(transaction.type === "expense" && !isApproved && !isPaid ? {
          is_reimbursement: form.is_reimbursement,
          reimbursement_to: form.is_reimbursement ? (form.reimbursement_to.trim() || null) : null,
        } : {}),
      };


      if (!paidLocked && currency !== "EUR") {
        const orig = parseFloat(originalAmount) || 0;
        const rate = parseFloat(fxRate) || 0;
        if (orig <= 0 || rate <= 0) {
          throw new Error(`Define valor em ${currency} e câmbio.`);
        }
      }

      // Build snapshot of pre-change values for the same fields
      const snapshot: Record<string, any> = {};
      for (const key of Object.keys(updates)) {
        snapshot[key] = transaction[key] ?? null;
      }

      // Send child adjustments if amount changed on a parent split
      const childUpdatesPayload = (amountChanged && hasChildren)
        ? Object.entries(childAdjustments).map(([id, amt]) => ({ id, amount: amt }))
        : undefined;

      const { data, error } = await supabase.functions.invoke("update-transaction", {
        body: { transaction_id: transaction.id, updates, changes, child_adjustments: childUpdatesPayload },
      });
      if (error) {
        // FunctionsHttpError → tentar extrair mensagem do corpo
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) {
            const j = await ctx.json();
            const msg = j?.error || j?.message;
            if (msg) throw new Error(j?.details ? `${msg} — ${j.details}` : msg);
          } else if (ctx?.text) {
            const t = await ctx.text();
            if (t) throw new Error(t);
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message) throw parseErr;
        }
        throw error;
      }
      if (data?.error) throw new Error(data.details ? `${data.error} — ${data.details}` : data.error);

      // Sync partner_paid_expenses.paid_date if it changed
      if (isPaidByPartner && partnerPaidLink?.id && partnerPaidDate && partnerPaidDate !== partnerPaidLink.paid_date) {
        await supabase.from("partner_paid_expenses").update({ paid_date: partnerPaidDate }).eq("id", partnerPaidLink.id);
      }

      // Desvincular linha BP (limpa event_forecasts.transaction_id) se o user pediu.
      if (unlinkBpRequested && (linkedForecast as any)?.id) {
        const { error: unlinkErr } = await supabase
          .from("event_forecasts")
          .update({ transaction_id: null } as any)
          .eq("id", (linkedForecast as any).id);
        if (unlinkErr) {
          console.error("[BP unlink] failed", unlinkErr);
          toast({
            title: "TX atualizada, mas falhou desvincular da linha BP",
            description: "Pode tentar novamente pela edição da linha do BP.",
            variant: "destructive",
          });
        }
      }

      return { data, snapshot, changesCount: changes.length };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-link", transaction.id] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-map-by-supplier"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-check", transaction.id] });
      onClose();
      if (result?.snapshot && user) {
        const { recordUndo } = await import("@/lib/undo");
        const { showUndoToast } = await import("@/hooks/useUndoToast");
        const undoRec = await recordUndo({
          action_type: "edit_transaction",
          entity_type: "transaction",
          entity_id: transaction.id,
          payload: { snapshot: result.snapshot },
          description: `Edição: ${transaction.description ?? ""}`.slice(0, 200),
          performed_by: user.id,
          performed_by_name: user.user_metadata?.full_name ?? user.email ?? undefined,
        });
        if (undoRec) {
          showUndoToast({
            message: "Transação atualizada com sucesso!",
            description: `${result.changesCount} alteração(ões) gravada(s). Toque em Desfazer para restaurar os valores anteriores.`,
            undoId: undoRec.id,
            user: { id: user.id, name: user.user_metadata?.full_name ?? user.email ?? undefined },
            onUndone: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
          });
          return;
        }
      }
      toast({ title: "Transação atualizada com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  // Check if transaction is linked to a BP forecast
  const { data: linkedForecast } = useQuery({
    queryKey: ["linked-forecast", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, category_id")
        .eq("transaction_id", transaction.id)
        .is("version_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Permite o utilizador desvincular a TX da linha BP para alterar a categoria.
  // Ao gravar, se unlinkBpRequested=true, limpa event_forecasts.transaction_id.
  const [unlinkBpRequested, setUnlinkBpRequested] = useState(false);
  const isBpLinked = !!linkedForecast && !unlinkBpRequested;
  const bpCategoryId = isBpLinked ? ((linkedForecast as any)?.category_id ?? null) : null;
  // Regra: TX vinculada a BP só aceita L3 do mesmo L2 do BP.
  const bpL2Id = (() => {
    if (!bpCategoryId) return null;
    const cur = (categories as any[]).find((c) => c.id === bpCategoryId);
    if (!cur) return null;
    if (!cur.parent_id) return null;
    const parent = (categories as any[]).find((c) => c.id === cur.parent_id);
    if (!parent) return null;
    return parent.parent_id ? parent.id : cur.id;
  })();
  const bpL2Label = (() => {
    if (!bpL2Id) return null;
    const l2 = (categories as any[]).find((c) => c.id === bpL2Id);
    return l2 ? `${l2.code} ${l2.name}` : null;
  })();

  const isExpense = transaction.type === "expense";
  const isApproved = transaction.status === "approved";
  const valueLocked = paidLocked;
  const isParentSplit = !transaction.parent_transaction_id && transaction.split_percentage === null;

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
    // Only require event if the category demands it AND the transaction originally had an event
    // (general/administrative transactions without event should remain editable without forcing event selection)
    const originallyHadEvent = !!transaction.event_id && transaction.event_id !== "";
    if (rootFlags.event_required && !form.event_id && !hasChildren && originallyHadEvent) {
      toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
      return;
    }
    if (!isExpense && !form.account_id) {
      toast({ title: "Selecione a conta destino para receitas", variant: "destructive" });
      return;
    }
    if (childMismatch) {
      toast({ title: "A soma dos splits deve igualar o valor total", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  };

  const filteredCategories = categories.filter((c) => {
    const typeMatch = transaction.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    // Only leaf categories (no children)
    if (categories.some((ch) => ch.parent_id === c.id)) return false;
    // Frente B: se TX vinculada a BP, restringir a L3 do mesmo L2 do BP
    if (bpL2Id) {
      const parent = categories.find((p) => p.id === c.parent_id);
      const l2Id = parent && parent.parent_id ? parent.id : c.id;
      if (l2Id !== bpL2Id) return false;
    }
    return true;
  });

  const eventOptions = events.map((ev) => ({ value: ev.id, label: ev.name }));
  const categoryOptions = filteredCategories.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }));
  const supplierOptions = suppliers.map((s: any) => ({ value: s.id, label: s.trade_name ? `${s.name} (${s.trade_name})` : s.name, searchText: s.trade_name ?? undefined }));
  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-lg font-bold">{isPaid ? (isAdmin ? "Editar (Ajuste Admin)" : "Editar (Liquidada)") : "Editar Transação"}</h2>
            <Button asChild size="sm" variant="outline" className="h-8 w-fit text-xs">
              <RouterLink to="/reembolsos">Abrir listas de reembolso</RouterLink>
            </Button>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className={`rounded-lg px-3 py-1.5 text-xs font-medium inline-flex ${
          isExpense ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
        }`}>
          {isExpense ? "Despesa" : "Receita"}
        </div>

        {isPaid && !isAdmin && (
          <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-xs text-success">
            Transação liquidada — Especificação, Fornecedor, Nº Fatura e Método de Pagamento podem ser alterados.
          </div>
        )}
        {isPaid && isAdmin && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ajuste administrativo — todos os campos podem ser alterados. Alterações serão registadas no audit log.
          </div>
        )}

        <ReimbursementNoteRefBadge transactionId={transaction.id} variant="banner" />

        <Tabs defaultValue="details" className="w-full">
          <TabsList className={cn("grid w-full", hasCamarim ? "grid-cols-3" : "grid-cols-2")}>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="payment">Pagamento</TabsTrigger>
            {hasCamarim && <TabsTrigger value="camarim">Camarim</TabsTrigger>}
          </TabsList>

          <TabsContent value="payment" className="pt-3">
            <PaymentTimeline transaction={transaction} isAdmin={isAdmin} />
          </TabsContent>

          {hasCamarim && (
            <TabsContent value="camarim" className="pt-3">
              <TransactionCamarimTab transactionId={transaction.id} />
            </TabsContent>
          )}

          <TabsContent value="details" className="pt-3">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={paidLocked}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Detalhes adicionais da despesa" />
            </div>
          )}

          {!paidLocked && valueLocked && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-400">
              Transação aprovada — valor e IVA não podem ser alterados.
            </div>
          )}
          {!paidLocked && isApproved && !isAdmin && isBpLinked && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
              Transação vinculada ao BP — valor editável até à liquidação.
            </div>
          )}

          {!paidLocked && (
          <div className="space-y-2">
            {currency === "EUR" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Base *</label>
                  <input type="number" step="0.01" min="0" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    disabled={valueLocked}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    disabled={valueLocked}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  >
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            ) : (
              <CurrencyAmountInput
                currency={currency}
                onCurrencyChange={setCurrency}
                originalAmount={originalAmount}
                onOriginalAmountChange={setOriginalAmount}
                fxRate={fxRate}
                onFxRateChange={setFxRate}
                onFxRateSourceChange={setFxRateSource}
                onEurAmountChange={setEurFromCurrency}
                label="Valor Base"
                disabled={valueLocked}
              />
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa IVA</label>
              <select value={form.iva_rate} onChange={(e) => setForm({ ...form, iva_rate: Number(e.target.value) as IvaRate })}
                disabled={valueLocked}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed">
                <option value={23}>23% - Normal</option>
                <option value={13}>13% - Intermédia</option>
                <option value={6}>6% - Reduzida</option>
                <option value={0}>0% - Isento</option>
              </select>
            </div>
            {(() => {
              const base = parseFloat(form.amount) || 0;
              const iva = base * (form.iva_rate / 100);
              const total = base + iva;
              if (base <= 0) return null;
              return (
                <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">
                    Base (EUR): {base.toFixed(2)}€
                    {currency !== "EUR" && (
                      <CurrencyBadge currency={currency} originalAmount={parseFloat(originalAmount) || 0} fxRate={parseFloat(fxRate) || 0} className="ml-2" />
                    )}
                  </span>
                  <span className="text-muted-foreground">+ IVA ({form.iva_rate}%): {iva.toFixed(2)}€</span>
                  <span className="font-semibold text-foreground">Total: {total.toFixed(2)}€</span>
                </div>
              );
            })()}
          </div>
          )}

          {transaction.type === "expense" && !paidLocked && (() => {
            const base = parseFloat(form.amount) || 0;
            const ivaRate = parseFloat(String(form.iva_rate)) || 0;
            const totalCIva = +(base + base * ivaRate / 100).toFixed(2);
            return (
              <WithholdingDeclaredFields
                baseAmount={totalCIva}
                rate={form.declared_withholding_rate}
                amount={form.declared_withholding_amount}
                onRateChange={(v) => setForm((f) => ({ ...f, declared_withholding_rate: v }))}
                onAmountChange={(v) => setForm((f) => ({ ...f, declared_withholding_amount: v }))}
                disabled={valueLocked}
              />
            );
          })()}

          {/* Split adjustment panel when parent amount changes */}
          {hasChildren && !paidLocked && (
            <div className={`rounded-lg border p-3 space-y-2 ${amountChanged ? "border-warning/50 bg-warning/5" : "border-border/50 bg-secondary/20"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  {amountChanged && <AlertTriangle className="h-3 w-3 text-warning" />}
                  Distribuição pelos Splits ({childTransactions.length})
                </p>
                {amountChanged && (
                  <button
                    type="button"
                    onClick={() => {
                      const pct = +(100 / childTransactions.length).toFixed(2);
                      const adj: Record<string, number> = {};
                      childTransactions.forEach((c: any, i: number) => {
                        const isLast = i === childTransactions.length - 1;
                        const val = isLast
                          ? +(newParentAmount - Object.values(adj).reduce((s, v) => s + v, 0)).toFixed(2)
                          : +(newParentAmount * pct / 100).toFixed(2);
                        adj[c.id] = val;
                      });
                      setChildAdjustments(adj);
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Dividir igualmente
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {childTransactions.map((child: any) => {
                  const adjVal = childAdjustments[child.id] ?? child.amount;
                  const pctOfNew = newParentAmount > 0 ? (adjVal / newParentAmount * 100).toFixed(1) : "—";
                  return (
                    <div key={child.id} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs">{child.event_name}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={adjVal || ""}
                        onChange={(e) => setChildAdjustments(prev => ({
                          ...prev,
                          [child.id]: parseFloat(e.target.value) || 0,
                        }))}
                        disabled={!amountChanged}
                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
                      />
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{pctOfNew}%</span>
                    </div>
                  );
                })}
              </div>
              {amountChanged && (
                <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
                  <span className="text-[10px] text-muted-foreground">Total splits</span>
                  <span className={`text-xs font-mono font-semibold ${childMismatch ? "text-destructive" : "text-success"}`}>
                    {childAdjustmentTotal.toFixed(2)}€
                    {childMismatch && ` (esperado: ${newParentAmount.toFixed(2)}€)`}
                  </span>
                </div>
              )}
            </div>
          )}

          {!paidLocked && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
              <SearchableSelect
                options={categoryOptions}
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
                placeholder="Sem categoria"
                searchPlaceholder="Pesquisar categoria…"
              />
              {bpL2Label && (
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-muted-foreground">
                    🔒 Categoria limitada pelo BP: <span className="font-mono text-primary/80">{bpL2Label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnlinkBpRequested(true)}
                    className="text-primary hover:underline font-medium shrink-0"
                    title="Remove o vínculo desta TX à linha BP. Após gravar, a TX fica órfã (aceita qualquer L3)."
                  >
                    Desvincular do BP
                  </button>
                </div>
              )}
              {unlinkBpRequested && !!linkedForecast && (
                <p className="mt-1 text-[10px] text-warning">
                  ⚠️ Vínculo BP será removido ao gravar.{" "}
                  <button type="button" className="underline" onClick={() => setUnlinkBpRequested(false)}>Reverter</button>
                </p>
              )}
            </div>
            {hasChildren ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
                <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
                  Master ({childTransactions.length} transações split)
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento {rootFlags.event_required ? "*" : ""}</label>
                <SearchableSelect
                  options={eventOptions}
                  value={form.event_id}
                  onValueChange={(v) => setForm({ ...form, event_id: v })}
                  placeholder={rootFlags.event_required ? "Selecionar…" : "Sem evento"}
                  searchPlaceholder="Pesquisar evento…"
                />
              </div>
            )}
          </div>
          )}

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
              <SearchableSelect
                options={supplierOptions}
                value={form.supplier_id}
                onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                placeholder="Sem fornecedor"
                searchPlaceholder="Pesquisar fornecedor…"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Fatura</label>
            <input value={form.invoice_ref} onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })}
              placeholder="Ex: FT 002/5944"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <p className="mt-0.5 text-[10px] text-muted-foreground">Transações com o mesmo nº serão agrupadas</p>
          </div>

          {/* Pago por Sócio — bloco informativo + edição de data */}
          {isPaidByPartner && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                🤝 Pago por Sócio: {(partnerPaidLink as any)?.event_partners?.suppliers?.name ?? "—"}
                {(partnerPaidLink as any)?.event_partners?.percentage != null && (
                  <span className="text-xs opacity-70">({(partnerPaidLink as any).event_partners.percentage}%)</span>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data em que o sócio pagou</label>
                <DatePicker value={partnerPaidDate} onChange={setPartnerPaidDate} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Despesa liquidada via sócio — sem conta financeira da empresa nem método de pagamento. Entra no acerto com o sócio.
              </p>
            </div>
          )}

          {/* Extra do Sócio — bloco informativo + ações (reverter total ou parcial) */}
          {isPartnerExtra && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                🧳 Extra do Sócio: {(partnerExtraLink as any)?.event_partners?.suppliers?.name ?? "—"}
                {(partnerExtraLink as any)?.event_partners?.percentage != null && (
                  <span className="text-xs opacity-70">({(partnerExtraLink as any).event_partners.percentage}%)</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Despesa paga pela empresa, descontada do sócio no fecho. Marcada como transitória — não entra no DRE.
              </p>

              {canEditPartnerExtra && (
                <div className="space-y-2 pt-1">
                  {/* Toggle: reversão total OU parcial */}
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={revertIsPartial} onCheckedChange={(v) => { setRevertIsPartial(v); setRevertPartialAmount(""); }} />
                    <span>Reverter apenas parte para o evento</span>
                    <HelpTooltip
                      size={12}
                      text="Vazio = reverter o total (a despesa volta a ser despesa normal do evento). Ativo = reduzir o valor que fica com o sócio e criar uma nova transação NORMAL para o evento pelo valor revertido."
                    />
                  </label>

                  {revertIsPartial && (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Valor a reverter para o evento (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={Number(transaction.amount)}
                        value={revertPartialAmount}
                        onChange={(e) => setRevertPartialAmount(e.target.value)}
                        placeholder={`máx ${Number(transaction.amount).toFixed(2)}`}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        O valor do Extra do Sócio passa a {Math.max(0, Number(transaction.amount) - (parseFloat(revertPartialAmount) || 0)).toFixed(2)} € e cria-se uma transação NORMAL pelo valor indicado, no mesmo evento/fornecedor/categoria/fatura.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      if (revertIsPartial) {
                        const partial = parseFloat(revertPartialAmount) || 0;
                        const total = Number(transaction.amount);
                        if (partial <= 0 || partial >= total) {
                          toast({ title: "Valor inválido", description: `Indica um valor entre 0,01 e ${(total - 0.01).toFixed(2)} €.`, variant: "destructive" });
                          return;
                        }
                        if (!confirm(`Reverter ${partial.toFixed(2)} € para despesa normal do evento? O Extra do Sócio passa a ${(total - partial).toFixed(2)} €.`)) return;
                        // 1) Reduz a transitória do sócio
                        const newExtraAmount = +(total - partial).toFixed(2);
                        const { error: updErr } = await supabase
                          .from("transactions")
                          .update({ amount: newExtraAmount })
                          .eq("id", transaction.id);
                        if (updErr) { toast({ title: "Erro a atualizar", description: updErr.message, variant: "destructive" }); return; }
                        // 2) Garante invoice_group_id partilhado
                        let groupId = transaction.invoice_group_id ?? null;
                        if (!groupId) {
                          groupId = crypto.randomUUID();
                          await supabase.from("transactions").update({ invoice_group_id: groupId }).eq("id", transaction.id);
                        }
                        // 3) Cria a nova transação NORMAL pelo valor revertido
                        const { error: insErr } = await supabase.from("transactions").insert({
                          type: transaction.type,
                          description: `${transaction.description} — revertido do sócio`,
                          amount: partial,
                          iva_rate: transaction.iva_rate,
                          event_id: transaction.event_id,
                          category_id: transaction.category_id,
                          supplier_id: transaction.supplier_id,
                          account_id: transaction.account_id,
                          date: transaction.date,
                          due_date: transaction.due_date,
                          invoice_ref: transaction.invoice_ref,
                          invoice_group_id: groupId,
                          status: "pending",
                          is_transitory: false,
                          exclude_from_result: false,
                          currency: transaction.currency ?? "EUR",
                        } as any);
                        if (insErr) { toast({ title: "Erro a criar despesa", description: insErr.message, variant: "destructive" }); return; }
                        toast({ title: "Reversão parcial concluída", description: `${partial.toFixed(2)} € voltaram para o evento.` });
                      } else {
                        if (!confirm("Reverter Extra do Sócio na totalidade? A despesa volta a ser uma despesa normal do evento.")) return;
                        await supabase.from("partner_advance_expenses").delete().eq("transaction_id", transaction.id);
                        await supabase.from("transactions").update({ is_transitory: false }).eq("id", transaction.id);
                        toast({ title: "Extra do Sócio revertido" });
                      }
                      queryClient.invalidateQueries({ queryKey: ["partner-extra-link", transaction.id] });
                      queryClient.invalidateQueries({ queryKey: ["partner-extra-sibling"] });
                      queryClient.invalidateQueries({ queryKey: ["transactions"] });
                      queryClient.invalidateQueries({ queryKey: ["partner-advance-expenses"] });
                      onClose();
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    {revertIsPartial ? "Reverter parcialmente" : "Reverter para despesa normal"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Principal de split parcial — atalho para reverter o split (eliminar a irmã do sócio) */}
          {isPrincipalOfPartialSplit && canEditPartnerExtra && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
              <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
                🧳 Esta fatura tem {Number(extraSibling?.amount ?? 0).toFixed(2)} € marcados como Extra do Sócio
                {extraSibling?.link?.event_partners?.suppliers?.name ? ` (${extraSibling.link.event_partners.suppliers.name})` : ""}
              </div>
              <p className="text-[10px] text-muted-foreground">
                A fatura está registada pelo total nesta transação (entra DRE/BP) e existe uma transação irmã transitória que abate do sócio no fecho.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!extraSibling?.id) return;
                  if (!confirm("Eliminar o Extra do Sócio desta fatura? A fatura volta a ser 100% despesa do evento.")) return;
                  await supabase.from("partner_advance_expenses").delete().eq("transaction_id", extraSibling.id);
                  await supabase.from("transactions").delete().eq("id", extraSibling.id);
                  queryClient.invalidateQueries({ queryKey: ["partner-extra-sibling"] });
                  queryClient.invalidateQueries({ queryKey: ["transactions"] });
                  queryClient.invalidateQueries({ queryKey: ["partner-advance-expenses"] });
                  toast({ title: "Extra do Sócio removido", description: "A fatura volta a ser despesa do evento." });
                  onClose();
                }}
                className="text-xs text-destructive hover:underline"
              >
                Remover Extra do Sócio desta fatura
              </button>
            </div>
          )}

          {/* Converter para Extra do Sócio — total ou parcial */}
          {!isPartnerExtra && !isPrincipalOfPartialSplit && !isPaidByPartner && transaction.type === "expense" && form.event_id && eventPartnersForExtra.length > 0 && canEditPartnerExtra && (
            <div className="rounded-lg border border-dashed border-orange-500/30 p-3 space-y-2">
              <p className="text-xs font-medium">🧳 Converter em Extra do Sócio</p>
              <SearchableSelect
                options={eventPartnersForExtra.map((p: any) => ({
                  value: p.id,
                  label: `${p.suppliers?.name} (${p.percentage}%)`,
                }))}
                value={convertPartnerId}
                onValueChange={(v) => setConvertPartnerId(v)}
                placeholder="Escolher sócio para abater…"
                searchPlaceholder="Pesquisar sócio…"
              />

              {convertPartnerId && (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={convertIsPartial} onCheckedChange={(v) => { setConvertIsPartial(v); setConvertPartialAmount(""); }} />
                    <span>Apenas parte da fatura é extra do sócio</span>
                    <HelpTooltip
                      size={12}
                      text={`Vazio = a fatura inteira (${Number(transaction.amount).toFixed(2)} €) vira Extra do Sócio (transitória). Ativo = a fatura mantém-se NORMAL pelo total e cria-se uma transação irmã transitória pelo valor parcial vinculada ao sócio.`}
                    />
                  </label>

                  {convertIsPartial && (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Valor que é extra do sócio (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={Number(transaction.amount)}
                        value={convertPartialAmount}
                        onChange={(e) => setConvertPartialAmount(e.target.value)}
                        placeholder={`máx ${Number(transaction.amount).toFixed(2)}`}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        A fatura é registada por {Number(transaction.amount).toFixed(2)} € (entra DRE/BP). {(parseFloat(convertPartialAmount) || 0).toFixed(2)} € serão descontados do sócio no fecho via transação irmã transitória vinculada à mesma fatura.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      const total = Number(transaction.amount);
                      if (convertIsPartial) {
                        const partial = parseFloat(convertPartialAmount) || 0;
                        if (partial <= 0 || partial >= total) {
                          toast({ title: "Valor inválido", description: `Indica um valor entre 0,01 e ${(total - 0.01).toFixed(2)} €.`, variant: "destructive" });
                          return;
                        }
                        if (!confirm(`Marcar ${partial.toFixed(2)} € como Extra do Sócio? A fatura mantém-se normal pelo total.`)) return;
                        // 1) Garante invoice_group_id na principal
                        let groupId = transaction.invoice_group_id ?? null;
                        if (!groupId) {
                          groupId = crypto.randomUUID();
                          await supabase.from("transactions").update({ invoice_group_id: groupId }).eq("id", transaction.id);
                        }
                        // 2) Cria irmã transitória pelo valor parcial
                        const { data: sibling, error: sErr } = await supabase
                          .from("transactions")
                          .insert({
                            type: transaction.type,
                            description: `${transaction.description} — extra sócio (parcial)`,
                            amount: partial,
                            iva_rate: transaction.iva_rate,
                            event_id: transaction.event_id,
                            category_id: transaction.category_id,
                            supplier_id: transaction.supplier_id,
                            account_id: transaction.account_id,
                            date: transaction.date,
                            due_date: transaction.due_date,
                            invoice_ref: transaction.invoice_ref,
                            invoice_group_id: groupId,
                            status: "paid",
                            payment_date: transaction.payment_date ?? transaction.date,
                            is_transitory: true,
                            exclude_from_result: false,
                            currency: transaction.currency ?? "EUR",
                          } as any)
                          .select("id")
                          .single();
                        if (sErr || !sibling) { toast({ title: "Erro a criar irmã", description: sErr?.message, variant: "destructive" }); return; }
                        // 3) Vincula a irmã ao partner_advance_expenses
                        await supabase.from("partner_advance_expenses").insert({
                          event_id: form.event_id,
                          partner_id: convertPartnerId,
                          transaction_id: sibling.id,
                        } as any);
                        toast({ title: "Split parcial criado", description: `${partial.toFixed(2)} € serão descontados do sócio no fecho.` });
                      } else {
                        if (!confirm("Converter esta despesa em Extra do Sócio? Será marcada como transitória e descontada do sócio no fecho.")) return;
                        await supabase.from("partner_advance_expenses").insert({
                          event_id: form.event_id,
                          partner_id: convertPartnerId,
                          transaction_id: transaction.id,
                        } as any);
                        await supabase.from("transactions").update({ is_transitory: true, exclude_from_result: false }).eq("id", transaction.id);
                        toast({ title: "Convertido em Extra do Sócio" });
                      }
                      queryClient.invalidateQueries({ queryKey: ["partner-extra-link", transaction.id] });
                      queryClient.invalidateQueries({ queryKey: ["partner-extra-sibling"] });
                      queryClient.invalidateQueries({ queryKey: ["transactions"] });
                      queryClient.invalidateQueries({ queryKey: ["partner-advance-expenses"] });
                      onClose();
                    }}
                    className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-500/20 dark:text-orange-400"
                  >
                    {convertIsPartial ? "Criar split parcial" : "Converter para Extra do Sócio"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Método de Pagamento — escondido quando pago por sócio */}
          {!isPaidByPartner && (() => {
            const selectedCat = categories.find((c: any) => c.id === form.category_id);
            const isStateCat = selectedCat?.code?.startsWith("10.4") || selectedCat?.code?.startsWith("10.5");
            const methods = [
              { value: "transfer" as const, label: "Transferência", icon: Building },
              { value: "service_payment" as const, label: "Pag. Serviços", icon: FileText },
              ...(isStateCat ? [{ value: "state_payment" as const, label: "Pag. Estado", icon: Landmark }] : []),
            ];
            return (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Método de Pagamento</label>
                <div className={cn("grid gap-1.5", isStateCat ? "grid-cols-3" : "grid-cols-2")}>
                  {methods.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm({ ...form, payment_method: m.value, ...(m.value === "transfer" ? { payment_entity: "", payment_reference: "" } : m.value === "state_payment" ? { payment_entity: "" } : {}) })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-all",
                        form.payment_method === m.value
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {!isPaidByPartner && form.payment_method === "service_payment" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Entidade</label>
                <input type="text" value={form.payment_entity}
                  onChange={(e) => setForm({ ...form, payment_entity: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: 10611" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência</label>
                <input type="text" value={form.payment_reference}
                  onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Referência MB" />
              </div>
            </div>
          )}

          {!isPaidByPartner && form.payment_method === "state_payment" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência de Pagamento</label>
              <input type="text" value={form.payment_reference}
                onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Referência AT / SS" />
            </div>
          )}

          {!paidLocked && !isExpense && !isPaidByPartner && (
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

          {!paidLocked && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
              <DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} />
            </div>
            {isExpense && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vencimento</label>
                <DatePicker value={form.due_date} onChange={(d) => setForm({ ...form, due_date: d })} />
              </div>
            )}
          </div>
          )}

          {isAdmin && isPaid && !isPaidByPartner && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data de Pagamento</label>
              <DatePicker value={form.payment_date} onChange={(d) => setForm({ ...form, payment_date: d })} />
              <p className="mt-0.5 text-[10px] text-muted-foreground">Ajuste administrativo da data efetiva de pagamento</p>
            </div>
          )}

          {/* Reembolso toggle — despesas ainda não aprovadas nem pagas.
              Permite ao editor corrigir uma transação que devia ter sido marcada como reembolso. */}
          {isExpense && !isApproved && !isPaid && !hasChildren && !isPaidByPartner && !isPartnerExtra && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.is_reimbursement}
                  disabled={isLinkedToReimbursementNote && form.is_reimbursement}
                  onCheckedChange={(v) => {
                    if (!v && isLinkedToReimbursementNote) {
                      toast({
                        title: "Transação vinculada a uma Nota de Reembolso",
                        description: "Desvincule primeiro pela Nota antes de desmarcar como reembolso.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setForm({ ...form, is_reimbursement: v, reimbursement_to: v ? form.reimbursement_to : "" });
                  }}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">💰 Reembolso a colaborador</span>
                  <HelpTooltip text={helpTexts.reimbursementToggle} size={13} />
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {form.is_reimbursement ? "Vincule a uma Nota após guardar" : "Marcar se foi despesa a reembolsar"}
                </span>
              </div>
              {form.is_reimbursement && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Colaborador</label>
                  <input
                    value={form.reimbursement_to}
                    onChange={(e) => setForm({ ...form, reimbursement_to: e.target.value })}
                    placeholder="Nome do colaborador a reembolsar"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {isLinkedToReimbursementNote && (reimbursementNoteLink as any)?.reimbursement_notes && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Já vinculada à Nota {(reimbursementNoteLink as any).reimbursement_notes.code}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}


          {/* Transitory toggle — only admin/manager can change */}
          {(isAdmin || isManager) && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <Switch
              checked={form.is_transitory}
              onCheckedChange={(v) => setForm({ ...form, is_transitory: v, ...(v ? { exclude_from_result: false } : {}) })}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">🔄 Transitória</span>
              <HelpTooltip text={helpTexts.transitoryTransaction} size={13} />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">Sem impacto no resultado</span>
          </div>
          )}

          {/* Exclude from result toggle — only admin/manager, mutually exclusive with transitory */}
          {(isAdmin || isManager) && !form.is_transitory && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <Switch
              checked={form.exclude_from_result}
              onCheckedChange={(v) => setForm({ ...form, exclude_from_result: v })}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">📋 Fora do Resultado</span>
              <HelpTooltip text={helpTexts.excludeFromResultToggle} size={13} />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">Apenas para registo</span>
          </div>
          )}

          <button type="submit" disabled={editMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
            {editMutation.isPending ? "A guardar…" : "Guardar Alterações"}
          </button>
        </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>,
    document.body
  );
}
