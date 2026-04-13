import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, X, Music, Percent, DollarSign, ChevronDown, ChevronUp, Info, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { sortByHierarchicalCode } from "@/lib/utils";
import { CacheExtrasPanel } from "@/components/CacheExtrasPanel";
import { CacheSettlementPanel } from "@/components/CacheSettlementPanel";
import { useSyncCacheForecasts } from "@/hooks/useSyncCacheForecasts";
import { useRealCacheCalculation } from "@/hooks/useRealCacheCalculation";

interface Props {
  eventId: string;
  childEventIds?: string[];
  eventStatus?: string;
}

export function EventCacheConfig({ eventId, childEventIds, eventStatus }: Props) {
  const { isAdmin, isManager } = useAuth();
  const queryClient = useQueryClient();
  const isEventLocked = eventStatus === "completed";
  const canEdit = (isAdmin || isManager) && !isEventLocked;
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [artistName, setArtistName] = useState("");
  const [cacheType, setCacheType] = useState<"fixed" | "variable">("fixed");
  const [fixedAmount, setFixedAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [minimumGuaranteed, setMinimumGuaranteed] = useState("");

  // Fetch cache configs
  const { data: cacheConfigs = [], isLoading } = useQuery({
    queryKey: ["event_cache_configs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs" as any)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch deductions for all configs
  const configIds = cacheConfigs.map((c: any) => c.id);
  const { data: deductions = [] } = useQuery({
    queryKey: ["event_cache_deductions", configIds.join(",")],
    queryFn: async () => {
      if (configIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions" as any)
        .select("*")
        .in("cache_config_id", configIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: configIds.length > 0,
  });

  // Fetch expense categories (for deduction selection)
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

  // Fetch ticket data for revenue calculation
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

  // Fetch forecasts to calculate deduction amounts
  const { data: forecasts = [] } = useQuery({
    queryKey: ["event_forecasts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories(code, name, type)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  // Calculate ticket revenues
  const ticketRevenueGross = useMemo(() => {
    return ticketLots.reduce((s, l) => s + l.quantity * Number(l.price), 0);
  }, [ticketLots]);

  const ticketRevenueNet = useMemo(() => {
    return ticketLots.reduce((s, l) => {
      const rate = Number((l as any).iva_rate ?? 6);
      return s + l.quantity * (Number(l.price) / (1 + rate / 100));
    }, 0);
  }, [ticketLots]);

  // Find cache category (2.1.01) for forecast sync
  const cacheCategoryId = useMemo(() => {
    const cat = categories.find((c) => c.code === "2.1.01" && c.type === "expense");
    return cat?.id ?? null;
  }, [categories]);

  // Sync cache configs to real forecasts in BP
  useSyncCacheForecasts({
    eventId,
    childEventIds,
    cacheConfigs: cacheConfigs.map((c: any) => ({
      id: c.id,
      event_id: c.event_id,
      artist_name: c.artist_name,
      cache_type: c.cache_type,
      fixed_amount: Number(c.fixed_amount),
      percentage: Number(c.percentage),
      fixed_deduction_percentage: Number(c.fixed_deduction_percentage),
      cache_revenue_basis: c.cache_revenue_basis,
      cache_deduction_basis: c.cache_deduction_basis,
      minimum_guaranteed: Number(c.minimum_guaranteed),
      is_finalized: !!c.is_finalized,
    })),
    deductions: deductions.map((d: any) => ({
      cache_config_id: d.cache_config_id,
      category_id: d.category_id,
    })),
    forecasts: forecasts.map((f: any) => ({
      id: f.id,
      type: f.type,
      category_id: f.category_id,
      amount: Number(f.amount),
      iva_rate: Number(f.iva_rate ?? 0),
      cache_config_id: (f as any).cache_config_id ?? null,
    })),
    ticketRevenueNet,
    ticketRevenueGross,
    cacheCategoryId,
    enabled: canEdit && cacheConfigs.length > 0,
  });

  // Real cache calculation (for settlement)
  const { results: realCacheResults } = useRealCacheCalculation(
    eventId,
    childEventIds || [],
    cacheConfigs,
    deductions,
    cacheConfigs.length > 0,
  );

  // Expense categories (level 3 only - detail accounts)
  const expenseDetailCategories = useMemo(() => {
    return categories.filter((c) => c.type === "expense" && c.parent_id !== null);
  }, [categories]);

  // Get deductions for a specific config
  const getDeductionsForConfig = (configId: string) => {
    return deductions.filter((d: any) => d.cache_config_id === configId);
  };

  // Calculate deduction amount for a config (categories + fixed %)
  const calculateDeductionAmount = (configId: string, deductionBasisGross = false) => {
    const configDeductions = getDeductionsForConfig(configId);
    const deductionCategoryIds = configDeductions.map((d: any) => d.category_id);

    const categoryAmount = forecasts
      .filter((f) => f.type === "expense" && deductionCategoryIds.includes(f.category_id))
      .reduce((s, f) => {
        const base = Number(f.amount);
        if (deductionBasisGross) {
          const rate = Number(f.iva_rate ?? 0);
          return s + base * (1 + rate / 100);
        }
        return s + base;
      }, 0);

    return categoryAmount;
  };

  // Calculate fixed percentage deduction
  const calculateFixedPctDeduction = (config: any) => {
    const pct = Number(config.fixed_deduction_percentage) || 0;
    const basis = config.cache_revenue_basis === "gross" ? ticketRevenueGross : ticketRevenueNet;
    return basis * (pct / 100);
  };

  // Calculate variable cachê
  const calculateVariableCache = (config: any) => {
    const deductionBasisGross = (config.cache_deduction_basis || "net") === "gross";
    const categoryDeduction = calculateDeductionAmount(config.id, deductionBasisGross);
    const fixedPctDeduction = calculateFixedPctDeduction(config);
    const totalDeduction = categoryDeduction + fixedPctDeduction;
    const basis = config.cache_revenue_basis === "gross" ? ticketRevenueGross : ticketRevenueNet;
    const baseForCalc = basis - totalDeduction;
    const pct = Number(config.percentage) || 0;
    const calculated = Math.max(0, baseForCalc * (pct / 100));
    const minGuaranteed = Number(config.minimum_guaranteed) || 0;
    return Math.max(minGuaranteed, calculated);
  };

  // Add config
  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("event_cache_configs" as any).insert({
        event_id: eventId,
        artist_name: artistName,
        cache_type: cacheType,
        fixed_amount: cacheType === "fixed" ? (parseFloat(fixedAmount) || 0) : 0,
        percentage: cacheType === "variable" ? (parseFloat(percentage) || 0) : 0,
        minimum_guaranteed: cacheType === "variable" ? (parseFloat(minimumGuaranteed) || 0) : 0,
        cache_revenue_basis: cacheType === "variable" ? revenueBasis : "net",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
      toast({ title: "Cachê adicionado!" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_cache_configs" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_cache_deductions"] });
      toast({ title: "Cachê removido" });
    },
  });

  // Toggle deduction category
  const toggleDeductionMutation = useMutation({
    mutationFn: async ({ configId, categoryId, add }: { configId: string; categoryId: string; add: boolean }) => {
      if (add) {
        const { error } = await supabase.from("event_cache_deductions" as any).insert({
          cache_config_id: configId,
          category_id: categoryId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("event_cache_deductions" as any)
          .delete()
          .eq("cache_config_id", configId)
          .eq("category_id", categoryId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_deductions"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar dedução", description: err.message, variant: "destructive" });
    },
  });

  // Update fixed deduction percentage
  const updateFixedDeductionMutation = useMutation({
    mutationFn: async ({ configId, value }: { configId: string; value: number }) => {
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update({ fixed_deduction_percentage: value })
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
    },
  });

  const resetForm = () => {
    setArtistName("");
    setCacheType("fixed");
    setFixedAmount("");
    setPercentage("");
    setMinimumGuaranteed("");
    setRevenueBasis("net");
    setShowAddForm(false);
  };

  // Toggle finalized
  const toggleFinalizedMutation = useMutation({
    mutationFn: async ({ configId, value }: { configId: string; value: boolean }) => {
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update({ is_finalized: value })
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
      toast({ title: "Estado atualizado" });
    },
  });

  // Update minimum guaranteed
  const updateMinGuaranteedMutation = useMutation({
    mutationFn: async ({ configId, value }: { configId: string; value: number }) => {
      const { error } = await supabase
        .from("event_cache_configs" as any)
        .update({ minimum_guaranteed: value })
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
    },
  });

  const handleAdd = () => {
    if (!artistName) {
      toast({ title: "Informe o nome da atração", variant: "destructive" });
      return;
    }
    addMutation.mutate();
  };

  const totalCache = useMemo(() => {
    return cacheConfigs.reduce((total: number, config: any) => {
      if (config.cache_type === "fixed") {
        return total + Number(config.fixed_amount);
      } else {
        return total + calculateVariableCache(config);
      }
    }, 0);
  }, [cacheConfigs, ticketRevenueNet, ticketRevenueGross, forecasts, deductions]);

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  // Revenue basis state for add form
  const [revenueBasis, setRevenueBasis] = useState<"net" | "gross">("net");

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">Cachê das Atrações <HelpTooltip text={helpTexts.eventCache} size={13} /></h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-mono font-bold text-foreground">{formatCurrency(totalCache)}</span>
          </span>
          <button
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm || !canEdit}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Atração
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Nova Atração</span>
            <button onClick={resetForm} className="rounded p-1 hover:bg-secondary">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Row 1: Name + Type */}
          <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome da Atração *</label>
              <input
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                className={inputClass}
                placeholder="Ex: Artista Principal"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCacheType("fixed")}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${
                    cacheType === "fixed"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <DollarSign className="h-3 w-3" /> Fixo
                </button>
                <button
                  type="button"
                  onClick={() => setCacheType("variable")}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${
                    cacheType === "variable"
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-border bg-background text-muted-foreground hover:border-warning/40"
                  }`}
                >
                  <Percent className="h-3 w-3" /> Variável
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Values based on type */}
          {cacheType === "fixed" ? (
            <div className="max-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor do Cachê (€)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Percentual (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    className={inputClass}
                    placeholder="Ex: 50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Mín. Garantido (€)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={minimumGuaranteed}
                    onChange={(e) => setMinimumGuaranteed(e.target.value)}
                    className={inputClass}
                    placeholder="0 (opcional)"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Base de cálculo</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setRevenueBasis("net")}
                      className={`flex-1 rounded border px-2 py-2 text-xs font-medium transition-all ${
                        revenueBasis === "net"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      s/ IVA
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevenueBasis("gross")}
                      className={`flex-1 rounded border px-2 py-2 text-xs font-medium transition-all ${
                        revenueBasis === "gross"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      c/ IVA
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                <Info className="inline h-3 w-3 mr-0.5" />
                Após adicionar, configure os descontos (despesas a subtrair da receita antes do cálculo).
              </p>
            </>
          )}

          <button
            onClick={handleAdd}
            disabled={addMutation.isPending}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {addMutation.isPending ? "A guardar…" : "Adicionar Cachê"}
          </button>
        </div>
      )}

      {/* Configs list */}
      {isLoading ? (
        <p className="text-center text-xs text-muted-foreground py-4">A carregar…</p>
      ) : cacheConfigs.length === 0 && !showAddForm ? (
        <p className="text-center text-xs text-muted-foreground py-6">Nenhum cachê configurado para este evento.</p>
      ) : (
        <div className="space-y-2">
          {cacheConfigs.map((config: any) => {
            const isVariable = config.cache_type === "variable";
            const isFinalized = !!config.is_finalized;
            const isExpanded = expandedId === config.id;
            const configDeductions = getDeductionsForConfig(config.id);
            const deductionCategoryIds = new Set(configDeductions.map((d: any) => d.category_id));
            const deductionBasisGross = (config.cache_deduction_basis || "net") === "gross";
            const categoryDeduction = isVariable ? calculateDeductionAmount(config.id, deductionBasisGross) : 0;
            const fixedPctDeduction = isVariable ? calculateFixedPctDeduction(config) : 0;
            const totalDeduction = categoryDeduction + fixedPctDeduction;
            const variableValue = isVariable ? calculateVariableCache(config) : 0;
            const displayValue = isVariable ? variableValue : Number(config.fixed_amount);
            const minGuaranteed = Number(config.minimum_guaranteed) || 0;
            const isUsingMinimum = isVariable && minGuaranteed > 0 && variableValue === minGuaranteed;

            return (
              <div key={config.id} className={`rounded-lg border bg-background overflow-hidden ${isFinalized ? "border-success/40" : "border-border"}`}>
                {/* Header */}
                <div className="flex items-center gap-3 p-3">
                  <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{config.artist_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isVariable
                          ? "bg-warning/15 text-warning"
                          : "bg-primary/15 text-primary"
                      }`}>
                        {isVariable ? `Variável · ${config.percentage}%` : "Fixo"}
                      </span>
                      {isFinalized && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-success/15 text-success flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> Finalizado
                        </span>
                      )}
                      {isUsingMinimum && !isFinalized && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-accent text-accent-foreground">
                          Mín. Garantido
                        </span>
                      )}
                    </div>
                    {isVariable && (() => {
                      const basisIsGross = (config.cache_revenue_basis || "net") === "gross";
                      const basisRevenue = basisIsGross ? ticketRevenueGross : ticketRevenueNet;
                      const basisLabel = basisIsGross ? "c/ IVA" : "s/ IVA";
                      return (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Receita {basisLabel} ({formatCurrency(basisRevenue)})
                          {totalDeduction > 0 && ` − Descontos (${formatCurrency(totalDeduction)})`}
                          {` = Base: ${formatCurrency(Math.max(0, basisRevenue - totalDeduction))}`}
                          {minGuaranteed > 0 && ` · Mín: ${formatCurrency(minGuaranteed)}`}
                        </p>
                      );
                    })()}
                  </div>
                  <span className="font-mono font-bold text-sm shrink-0">{formatCurrency(displayValue)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isVariable && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : config.id)}
                        className="rounded p-1.5 hover:bg-secondary transition-colors"
                        title="Configurar descontos"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => {
                          if (confirm(`Remover cachê de "${config.artist_name}"?`)) {
                            deleteMutation.mutate(config.id);
                          }
                        }}
                        className="rounded p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Deductions panel (variable only) */}
                {isVariable && isExpanded && canEdit && (
                  <div className="border-t border-border bg-muted/30 p-3 space-y-3 animate-fade-in">
                    {/* Row: Finalized + Revenue Basis + Deduction Basis */}
                    <div className="grid grid-cols-[1fr,auto,auto] gap-3 items-start">
                      <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                        <div className="flex items-center gap-2">
                          {isFinalized ? <Lock className="h-3.5 w-3.5 text-success" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                          <div>
                            <span className="text-xs font-medium">Finalizado</span>
                            <p className="text-[10px] text-muted-foreground">Bloqueia o valor.</p>
                          </div>
                        </div>
                        <Switch
                          checked={isFinalized}
                          onCheckedChange={(checked) => toggleFinalizedMutation.mutate({ configId: config.id, value: checked })}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Receita</span>
                        <div className="flex gap-1">
                          {[
                            { value: "net", label: "s/ IVA" },
                            { value: "gross", label: "c/ IVA" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                supabase
                                  .from("event_cache_configs" as any)
                                  .update({ cache_revenue_basis: opt.value })
                                  .eq("id", config.id)
                                  .then(() => {
                                    queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
                                  });
                              }}
                              className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-all ${
                                (config.cache_revenue_basis || "net") === opt.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Deduções</span>
                        <div className="flex gap-1">
                          {[
                            { value: "net", label: "s/ IVA" },
                            { value: "gross", label: "c/ IVA" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                supabase
                                  .from("event_cache_configs" as any)
                                  .update({ cache_deduction_basis: opt.value })
                                  .eq("id", config.id)
                                  .then(() => {
                                    queryClient.invalidateQueries({ queryKey: ["event_cache_configs", eventId] });
                                  });
                              }}
                              className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-all ${
                                (config.cache_deduction_basis || "net") === opt.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Row: Min Guaranteed + Fixed % Deduction */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> Mínimo Garantido (€)
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={Number(config.minimum_guaranteed) || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateMinGuaranteedMutation.mutate({ configId: config.id, value: val });
                          }}
                          className={`${inputClass} text-xs`}
                          placeholder="0"
                          disabled={isFinalized}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          <Percent className="h-3 w-3" /> Desc. Percentual Fixo
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={Number(config.fixed_deduction_percentage) || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              updateFixedDeductionMutation.mutate({ configId: config.id, value: val });
                            }}
                            className={`${inputClass} text-xs max-w-[80px]`}
                            placeholder="0"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                          {fixedPctDeduction > 0 && (
                            <span className="ml-auto font-mono text-xs font-semibold text-warning">
                              − {formatCurrency(fixedPctDeduction)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Category-based deductions */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Descontos por Conta — Despesas a subtrair da receita
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {expenseDetailCategories.map((cat) => {
                          const isChecked = deductionCategoryIds.has(cat.id);
                          const forecastAmount = forecasts
                            .filter((f) => f.type === "expense" && f.category_id === cat.id)
                            .reduce((s, f) => s + Number(f.amount), 0);

                          return (
                            <label
                              key={cat.id}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-background transition-colors ${
                                isChecked ? "bg-background" : ""
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  toggleDeductionMutation.mutate({
                                    configId: config.id,
                                    categoryId: cat.id,
                                    add: !!checked,
                                  });
                                }}
                                className="h-3.5 w-3.5"
                              />
                              <span className="flex-1 text-foreground">
                                <span className="text-muted-foreground">{cat.code}</span> {cat.name}
                              </span>
                              {forecastAmount > 0 && (
                                <span className="font-mono text-muted-foreground">{formatCurrency(forecastAmount)}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Totals */}
                    {totalDeduction > 0 && (
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Total descontos na cabeça
                        </span>
                        <span className="font-mono font-semibold text-warning">
                          − {formatCurrency(totalDeduction)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Extras panel (always visible) */}
                <div className="px-3 pb-3">
                  <CacheExtrasPanel
                    cacheConfigId={config.id}
                    artistName={config.artist_name}
                    eventId={eventId}
                    canEdit={canEdit}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
