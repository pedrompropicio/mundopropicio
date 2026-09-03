import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { X, FileText, Calendar, Building2, Wallet, ArrowDown, Plus, Trash2, AlertTriangle, Split } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import LinkBpLineDialog from "@/components/LinkBpLineDialog";
import { fetchWithBpEventIds } from "@/lib/bp-line-required";

interface PaymentPart {
  id: string;
  supplierId: string;
  categoryId: string;
  amount: string;
  description: string;
}

interface Props {
  onClose: () => void;
  eventId: string;
  artistName: string;
  amount: number;
  cacheConfigId: string;
  /** 'variable' → linha de BP garantida pelo módulo; 'fixed' → fluxo normal de despesa. */
  cacheType?: string;
  configSupplierId?: string | null;
  withholdingApplicable?: boolean;
  withholdingRate?: number;
  withholdingAmount?: number;
}

let partIdCounter = 0;
const newPartId = () => `part_${++partIdCounter}`;

export function CacheTransactionModal({
  onClose,
  eventId,
  artistName,
  amount,
  cacheConfigId,
  cacheType = "variable",
  configSupplierId,
  withholdingApplicable = false,
  withholdingRate = 25,
  withholdingAmount = 0,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isFixedCache = cacheType === "fixed";

  const netPayable = withholdingApplicable ? amount - withholdingAmount : amount;

  const [dueDate, setDueDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<Set<string>>(new Set());
  const [showLinkBp, setShowLinkBp] = useState(false);

  // Split payment parts
  const [parts, setParts] = useState<PaymentPart[]>([
    { id: newPartId(), supplierId: configSupplierId || "", categoryId: "", amount: "", description: `Cachê — ${artistName}` },
  ]);
  const [useSplit, setUseSplit] = useState(false);

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch financial accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["financial_accounts_active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch expense categories (leaf level)
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense_categories_leaf"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id")
        .eq("is_active", true)
        .eq("type", "expense")
        .not("parent_id", "is", null)
        .order("code");
      return data ?? [];
    },
  });

  // Fetch cache-related category
  const { data: cacheCategory } = useQuery({
    queryKey: ["cache_category_lookup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id")
        .eq("is_active", true)
        .eq("type", "expense")
        .ilike("name", "%cach%")
        .order("code")
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  // Fetch existing transactions (advances)
  const { data: artistTransactions = [] } = useQuery({
    queryKey: ["cache_artist_transactions", eventId, cacheCategory?.id, configSupplierId],
    enabled: !!cacheCategory?.id,
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("id, description, amount, paid_amount, status, date, due_date, specification, supplier_id, suppliers(name)")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .eq("category_id", cacheCategory!.id);

      if (configSupplierId) {
        query = query.eq("supplier_id", configSupplierId);
      }

      const { data } = await query.order("date", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const totalAdvances = useMemo(() => {
    return artistTransactions
      .filter((tx: any) => selectedAdvanceIds.has(tx.id))
      .reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
  }, [artistTransactions, selectedAdvanceIds]);

  const finalAmount = Math.max(0, netPayable - totalAdvances);

  // Split parts total
  const partsTotal = useMemo(() => {
    if (!useSplit) return finalAmount;
    return parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  }, [parts, useSplit, finalAmount]);

  const splitDiff = useSplit ? finalAmount - partsTotal : 0;

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.type})` })),
    [accounts]
  );

  const categoryOptions = useMemo(
    () => expenseCategories.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [expenseCategories]
  );

  const toggleAdvance = (id: string) => {
    setSelectedAdvanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updatePart = (id: string, field: keyof PaymentPart, value: string) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const addPart = () => {
    setParts((prev) => [
      ...prev,
      { id: newPartId(), supplierId: "", categoryId: "", amount: "", description: "" },
    ]);
  };

  const removePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id));
  };

  // Auto-fill first part amount when not splitting
  const effectiveParts = useMemo(() => {
    if (!useSplit) {
      return [
        {
          supplierId: parts[0]?.supplierId || configSupplierId || "",
          categoryId: cacheCategory?.id || "",
          amount: finalAmount,
          description: `Cachê — ${artistName}${totalAdvances > 0 ? ` (deduzidos ${formatCurrency(totalAdvances)} em adiantamentos)` : ""}`,
        },
      ];
    }
    return parts.map((p) => ({
      supplierId: p.supplierId,
      categoryId: p.categoryId || cacheCategory?.id || "",
      amount: parseFloat(p.amount) || 0,
      description: p.description || `Cachê — ${artistName}`,
    }));
  }, [useSplit, parts, finalAmount, artistName, totalAdvances, cacheCategory, configSupplierId]);

  /**
   * D1+D8 aplicado ao cachê (decisão 2026-09-03):
   *  - cachê VARIÁVEL: a linha de BP é do módulo. Se não existir linha
   *    `formula_type='cache_module'` ligada a este `cache_config_id`, o módulo
   *    cria-a. Todas as partes do split ligam à MESMA linha (vínculo N:1).
   *  - cachê FIXO: sem linha automática. Segue o fluxo normal de despesa — o
   *    utilizador escolhe/cria a linha no LinkBpLineDialog antes de gerar.
   */
  const ensureCacheModuleForecast = async (): Promise<string | null> => {
    const { data: existing } = await supabase
      .from("event_forecasts")
      .select("id")
      .eq("event_id", eventId)
      .eq("cache_config_id", cacheConfigId)
      .eq("formula_type", "cache_module")
      .is("version_id", null)
      .limit(1);
    if (existing?.[0]?.id) return existing[0].id as string;

    if (!cacheCategory?.id) return null;
    const { data: created, error } = await supabase
      .from("event_forecasts")
      .insert({
        event_id: eventId,
        type: "expense",
        description: `Cachê — ${artistName}`,
        amount,
        iva_rate: 0,
        category_id: cacheCategory.id,
        formula_type: "cache_module",
        cache_config_id: cacheConfigId,
        status: "draft",
      } as any)
      .select("id")
      .single();
    if (error) throw error;
    return (created as any)?.id ?? null;
  };

  const createMutation = useMutation({
    mutationFn: async (pickedForecastId?: string) => {
      const today = new Date().toISOString().split("T")[0];

      const forecastId = isFixedCache
        ? pickedForecastId ?? null
        : await ensureCacheModuleForecast();

      // Pre-fetch ALL cache-related forecasts for this event so we can propagate
      // their attachment links to the newly-created transactions. This covers:
      //  1) The official cache_module forecast linked to this cache_config (if any).
      //  2) Free-form BP lines whose description starts with "Cach" (typically
      //     imported from XLSX as formula_type='fixed') that don't yet have a
      //     transaction associated.
      const { data: moduleForecasts } = await supabase
        .from("event_forecasts")
        .select("id, transaction_id, attachment_refs, description, formula_type")
        .eq("event_id", eventId)
        .eq("cache_config_id", cacheConfigId)
        .eq("formula_type", "cache_module").is("version_id", null);

      const { data: freeFormCacheForecasts } = await supabase
        .from("event_forecasts")
        .select("id, transaction_id, attachment_refs, description, formula_type")
        .eq("event_id", eventId)
        .ilike("description", "Cach%")
        .is("transaction_id", null).is("version_id", null);

      const allCacheForecasts = [
        ...((moduleForecasts as any[]) || []),
        ...((freeFormCacheForecasts as any[]) || []).filter(
          (f) => !((moduleForecasts as any[]) || []).some((m: any) => m.id === f.id),
        ),
      ];

      // Use the official cache_module record (if exists) as the primary forecast
      // we will eventually back-link to the first created transaction.
      const cacheForecast = (moduleForecasts as any[])?.[0] || allCacheForecasts[0] || null;

      // Merge attachment refs across all matched forecasts and dedupe by URL.
      const refSet = new Set<string>();
      for (const f of allCacheForecasts) {
        const refs = Array.isArray(f?.attachment_refs) ? (f.attachment_refs as any[]) : [];
        for (const r of refs) {
          const url = r && typeof r.url === "string" ? r.url.trim() : "";
          if (/^https?:\/\//i.test(url)) refSet.add(url);
        }
      }
      const refUrls: string[] = Array.from(refSet);

      const createdTxIds: string[] = [];

      // Create payment transactions for each part
      for (const part of effectiveParts) {
        if (part.amount <= 0) continue;
        const { data: newTx, error } = await supabase
          .from("transactions")
          .insert({
            description: part.description,
            type: "expense",
            amount: part.amount,
            iva_rate: 0,
            event_id: eventId,
            category_id: part.categoryId || null,
            supplier_id: part.supplierId || null,
            account_id: accountId || null,
            date: today,
            due_date: dueDate || null,
            status: "approved",
            paid_amount: 0,
            forecast_id: forecastId,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        if (newTx?.id) createdTxIds.push(newTx.id);
      }

      // Propagate cache forecast attachment links to each created transaction.
      if (refUrls.length > 0 && createdTxIds.length > 0) {
        for (const txId of createdTxIds) {
          const docs = refUrls.map((link) => {
            let fileName = link.slice(0, 80);
            try {
              const u = new URL(link);
              fileName = decodeURIComponent(
                u.pathname.split("/").filter(Boolean).pop() || u.hostname,
              ).slice(0, 120);
            } catch { /* keep fallback */ }
            return {
              transaction_id: txId,
              name: fileName,
              file_url: `ref://${link}`,
              doc_type: "outro",
              uploaded_by: user?.email ?? "system",
              is_accounting: true,
            };
          });
          await supabase.from("transaction_documents").insert(docs as any);
        }

        // Back-link every cache forecast (module + free-form) we just used to
        // the first created transaction, so future attachment edits in the BP
        // continue to propagate automatically.
        const forecastsToLink = allCacheForecasts.filter((f: any) => !f.transaction_id);
        if (forecastsToLink.length > 0) {
          await supabase
            .from("event_forecasts")
            .update({ transaction_id: createdTxIds[0] } as any)
            .in("id", forecastsToLink.map((f: any) => f.id));
        }
      }

      // Retenção de IRS: NÃO é criada aqui (decisão 2026-09-03). Um cachê
      // calculado inclui muitas vezes logística e verba de marketing sem
      // incidência de retenção — só no fecho se sabe a base. A obrigação
      // fiscal é definida e criada no fecho.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["cache_artist_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
      toast({
        title: "Transações criadas",
        description: `Pagamento de cachê para ${artistName}: ${formatCurrency(finalAmount)}`,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transação", description: err.message, variant: "destructive" });
    },
  });

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  const canSubmit = dueDate && finalAmount > 0 && (!useSplit || Math.abs(splitDiff) < 0.01);

  /**
   * Cachê fixo em evento gerido `with_bp`: a linha de BP é obrigatória e
   * escolhida/criada pelo utilizador (mesmo fluxo de src/pages/Transactions.tsx).
   * Cachê variável: o módulo garante a linha, sem intervenção.
   */
  const handleSubmit = async () => {
    if (isFixedCache) {
      try {
        const withBp = await fetchWithBpEventIds([eventId]);
        if (withBp.has(eventId)) {
          setShowLinkBp(true);
          return;
        }
      } catch (err: any) {
        toast({ title: "Erro ao validar o modo do evento", description: err.message, variant: "destructive" });
        return;
      }
    }
    createMutation.mutate(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Gerar Transação de Cachê</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Artista</p>
            <p className="font-semibold text-foreground">{artistName}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor do Cachê</span>
              <span className="font-mono font-bold text-lg text-primary">
                {formatCurrency(amount)}
              </span>
            </div>
            {withholdingApplicable && (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-destructive">Retenção IRS ({withholdingRate}%)</span>
                <span className="font-mono text-destructive">− {formatCurrency(withholdingAmount)}</span>
              </div>
            )}
            {withholdingApplicable && (
              <div className="mt-1 flex items-center justify-between text-xs font-semibold border-t border-primary/20 pt-1">
                <span>Líquido a pagar</span>
                <span className="font-mono">{formatCurrency(netPayable)}</span>
              </div>
            )}
            {cacheCategory && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Categoria: {cacheCategory.code} — {cacheCategory.name}
              </p>
            )}
          </div>

          {/* Existing transactions / advances section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lançamentos existentes — Adiantamentos
              </span>
            </div>

            {artistTransactions.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Nenhum lançamento encontrado para este artista neste evento.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                  {artistTransactions.map((tx: any) => {
                    const isSelected = selectedAdvanceIds.has(tx.id);
                    const paidAmount = Number(tx.paid_amount) || 0;
                    const txAmount = Number(tx.amount);
                    const statusLabel =
                      tx.status === "paid" ? "Pago" :
                      tx.status === "approved" ? "Aprovado" :
                      tx.status === "pending" ? "Pendente" : tx.status;

                    return (
                      <label
                        key={tx.id}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleAdvance(tx.id)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {tx.description}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {tx.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              tx.status === "paid"
                                ? "bg-success/10 text-success"
                                : tx.status === "approved"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs font-semibold text-foreground">
                            {formatCurrency(txAmount)}
                          </p>
                          {paidAmount > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              pago: {formatCurrency(paidAmount)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {totalAdvances > 0 && (
                  <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Total adiantamentos selecionados
                    </span>
                    <span className="font-mono text-xs font-bold text-destructive">
                      − {formatCurrency(totalAdvances)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Final amount calculation */}
          {(totalAdvances > 0 || withholdingApplicable) && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Cachê {withholdingApplicable ? "líquido" : "total"}</span>
                <span className="font-mono">{formatCurrency(netPayable)}</span>
              </div>
              {totalAdvances > 0 && (
                <div className="flex items-center justify-between text-xs text-destructive">
                  <span>Adiantamentos</span>
                  <span className="font-mono">− {formatCurrency(totalAdvances)}</span>
                </div>
              )}
              <div className="border-t border-primary/20 pt-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Valor a pagar</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {formatCurrency(finalAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Split payment toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
            <div className="flex items-center gap-2">
              <Split className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-medium">Dividir pagamento</span>
                <p className="text-[10px] text-muted-foreground">
                  Múltiplos beneficiários ou categorias
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setUseSplit(!useSplit);
                if (!useSplit) {
                  // Initialize first part with current values
                  setParts([
                    {
                      id: newPartId(),
                      supplierId: configSupplierId || "",
                      categoryId: cacheCategory?.id || "",
                      amount: String(finalAmount),
                      description: `Cachê — ${artistName}`,
                    },
                  ]);
                }
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                useSplit
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              {useSplit ? "Ativo" : "Dividir"}
            </button>
          </div>

          {/* Split parts */}
          {useSplit && (
            <div className="space-y-3">
              {parts.map((part, idx) => (
                <div key={part.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Parcela {idx + 1}</span>
                    {parts.length > 1 && (
                      <button
                        onClick={() => removePart(part.id)}
                        className="rounded p-1 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Beneficiário</label>
                      <SearchableSelect
                        options={supplierOptions}
                        value={part.supplierId}
                        onValueChange={(v) => updatePart(part.id, "supplierId", v)}
                        placeholder="Selecionar..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Categoria</label>
                      <SearchableSelect
                        options={categoryOptions}
                        value={part.categoryId}
                        onValueChange={(v) => updatePart(part.id, "categoryId", v)}
                        placeholder="Selecionar..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,120px] gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Descrição</label>
                      <input
                        type="text"
                        value={part.description}
                        onChange={(e) => updatePart(part.id, "description", e.target.value)}
                        className={`${inputClass} text-xs`}
                        placeholder="Descrição da parcela"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Valor (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={part.amount}
                        onChange={(e) => updatePart(part.id, "amount", e.target.value)}
                        className={`${inputClass} text-xs font-mono`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addPart}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar parcela
              </button>

              {/* Split validation */}
              <div className={`flex items-center justify-between rounded-lg border p-2 text-xs ${
                Math.abs(splitDiff) < 0.01
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-warning/40 bg-warning/5 text-warning"
              }`}>
                <span>Total das parcelas: {formatCurrency(partsTotal)}</span>
                {Math.abs(splitDiff) >= 0.01 && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Diferença: {formatCurrency(splitDiff)}
                  </span>
                )}
                {Math.abs(splitDiff) < 0.01 && (
                  <span>✓ Correto</span>
                )}
              </div>
            </div>
          )}

          {/* Single payment: supplier selector (when not splitting) */}
          {!useSplit && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Fornecedor
              </label>
              <SearchableSelect
                options={supplierOptions}
                value={parts[0]?.supplierId || ""}
                onValueChange={(v) => {
                  setParts((prev) => {
                    const copy = [...prev];
                    if (copy[0]) copy[0] = { ...copy[0], supplierId: v };
                    return copy;
                  });
                }}
                placeholder="Selecionar fornecedor..."
              />
            </div>
          )}

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Data de Vencimento *
            </label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Conta Financeira
            </label>
            <SearchableSelect
              options={accountOptions}
              value={accountId}
              onValueChange={setAccountId}
              placeholder="Selecionar conta..."
            />
          </div>

          {/* Withholding tax notice */}
          {withholdingApplicable && withholdingAmount > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-warning">Retenção tratada no fecho</p>
                  <p className="text-[10px] text-warning/80 mt-0.5">
                    A retenção de IRS ({withholdingRate}%) estimada em {formatCurrency(withholdingAmount)} NÃO é
                    gerada agora. A base de incidência só se conhece no fecho (parte do cachê pode ser logística
                    ou verba de marketing, sem retenção), pelo que a obrigação fiscal é definida e criada aí.
                  </p>
                </div>
              </div>
            </div>

          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4 shrink-0">
          <div className="text-xs text-muted-foreground">
            {(totalAdvances > 0 || withholdingApplicable) && (
              <span>
                Pagamento: <strong className="text-foreground">{formatCurrency(finalAmount)}</strong>
                {withholdingApplicable && (
                  <span className="ml-1">+ ret. {formatCurrency(withholdingAmount)}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Criando..." : `Criar ${useSplit ? `${parts.length} Transações` : "Transação"}`}
            </button>
          </div>
        </div>
      </div>

      {showLinkBp && (
        <LinkBpLineDialog
          pickOnly
          transaction={{
            id: "",
            description: `Cachê — ${artistName}`,
            amount: finalAmount,
            iva_rate: 0,
            event_id: eventId,
            category_id: cacheCategory?.id ?? null,
            account_categories: cacheCategory
              ? { code: cacheCategory.code, name: cacheCategory.name }
              : null,
          }}
          onClose={() => setShowLinkBp(false)}
          onLinked={() => {}}
          onPicked={(forecastId) => {
            setShowLinkBp(false);
            createMutation.mutate(forecastId);
          }}
        />
      )}
    </div>
  );
}
