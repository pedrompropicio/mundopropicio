import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_VARIANTS,
  type CamarimItemStatus,
} from "@/lib/camarim-helpers";

interface SessionAgg {
  id: string;
  title: string;
  currency: string;
  budget: number;
  spent: number;
  pct: number;
  itemCount: number;
  pendingReview: number;
  missingDocs: number;
}

interface Props {
  className?: string;
}

interface SessionRow {
  id: string;
  title: string;
  budget_amount: number;
  currency: string;
}

interface ItemRow {
  session_id: string;
  total_amount: number;
  status: CamarimItemStatus;
  has_document: boolean;
  supplier_name_raw: string | null;
  supplier_id: string | null;
  category_id: string | null;
}

export function CamarimManagerDashboard({ className }: Props) {
  const [loading, setLoading] = useState(true);
  const [sessionAggs, setSessionAggs] = useState<SessionAgg[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<{ name: string; total: number }[]>([]);
  const [topCategories, setTopCategories] = useState<{ name: string; total: number }[]>([]);
  const [statusTotals, setStatusTotals] = useState<Record<CamarimItemStatus, number>>({
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    integrated: 0,
  });

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);

    // 1) Sessões abertas
    const { data: sess } = await supabase
      .from("camarim_sessions" as any)
      .select("id,title,budget_amount,currency")
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    const sessions = ((sess ?? []) as any[]) as SessionRow[];

    if (sessions.length === 0) {
      setSessionAggs([]);
      setTopSuppliers([]);
      setTopCategories([]);
      setLoading(false);
      return;
    }

    const ids = sessions.map((s) => s.id);

    // 2) Itens dessas sessões (campos necessários para todos os agregados)
    const { data: itemsRaw } = await supabase
      .from("camarim_items" as any)
      .select(
        "session_id,total_amount,status,has_document,supplier_name_raw,supplier_id,category_id",
      )
      .in("session_id", ids);

    const items = ((itemsRaw ?? []) as any[]) as ItemRow[];

    // Resolver nomes (suppliers + categorias) em paralelo
    const supplierIds = [...new Set(items.map((i) => i.supplier_id).filter(Boolean) as string[])];
    const categoryIds = [
      ...new Set(items.map((i) => i.category_id).filter(Boolean) as string[]),
    ];

    const [suppliersRes, catsRes] = await Promise.all([
      supplierIds.length
        ? supabase.from("suppliers").select("id,name").in("id", supplierIds)
        : Promise.resolve({ data: [] as any[] }),
      categoryIds.length
        ? supabase.from("account_categories").select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const supplierMap = new Map<string, string>();
    ((suppliersRes.data ?? []) as any[]).forEach((s) => supplierMap.set(s.id, s.name));
    const categoryMap = new Map<string, string>();
    ((catsRes.data ?? []) as any[]).forEach((c) => categoryMap.set(c.id, c.name));

    // 3) Agregar por sessão
    const aggMap = new Map<string, SessionAgg>();
    for (const s of sessions) {
      aggMap.set(s.id, {
        id: s.id,
        title: s.title,
        currency: s.currency,
        budget: Number(s.budget_amount ?? 0),
        spent: 0,
        pct: 0,
        itemCount: 0,
        pendingReview: 0,
        missingDocs: 0,
      });
    }

    const statusAcc: Record<CamarimItemStatus, number> = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      integrated: 0,
    };

    const supplierTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();

    for (const it of items) {
      const agg = aggMap.get(it.session_id);
      if (agg) {
        const amt = Number(it.total_amount ?? 0);
        agg.spent += amt;
        agg.itemCount += 1;
        if (it.status === "submitted") agg.pendingReview += 1;
        if (!it.has_document) agg.missingDocs += 1;
      }
      statusAcc[it.status] = (statusAcc[it.status] ?? 0) + 1;

      const supplierName =
        (it.supplier_id ? supplierMap.get(it.supplier_id) : null) ||
        it.supplier_name_raw ||
        "Sem fornecedor";
      supplierTotals.set(
        supplierName,
        (supplierTotals.get(supplierName) ?? 0) + Number(it.total_amount ?? 0),
      );

      if (it.category_id) {
        const catName = categoryMap.get(it.category_id) ?? "—";
        categoryTotals.set(
          catName,
          (categoryTotals.get(catName) ?? 0) + Number(it.total_amount ?? 0),
        );
      }
    }

    const aggs = [...aggMap.values()].map((a) => ({
      ...a,
      pct: a.budget > 0 ? Math.min(100, (a.spent / a.budget) * 100) : 0,
    }));

    setSessionAggs(aggs);
    setStatusTotals(statusAcc);
    setTopSuppliers(
      [...supplierTotals.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    );
    setTopCategories(
      [...categoryTotals.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    );
    setLoading(false);
  };

  // Agregados globais (assumindo currency consistente; usa primeiro)
  const globals = useMemo(() => {
    const currency = sessionAggs[0]?.currency ?? "EUR";
    const budget = sessionAggs.reduce((s, a) => s + a.budget, 0);
    const spent = sessionAggs.reduce((s, a) => s + a.spent, 0);
    const pendingReview = sessionAggs.reduce((s, a) => s + a.pendingReview, 0);
    const missingDocs = sessionAggs.reduce((s, a) => s + a.missingDocs, 0);
    const overBudget = sessionAggs.filter((a) => a.pct >= 100).length;
    return { currency, budget, spent, pendingReview, missingDocs, overBudget };
  }, [sessionAggs]);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          A carregar dashboard…
        </CardContent>
      </Card>
    );
  }

  if (sessionAggs.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* KPIs globais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3 w-3" /> Orçamento total
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(globals.budget, globals.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              em {sessionAggs.length} sessão(ões) aberta(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Gasto consolidado
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(globals.spent, globals.currency)}
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                globals.budget > 0 && globals.spent / globals.budget >= 0.8
                  ? "text-amber-600"
                  : "text-muted-foreground",
              )}
            >
              {globals.budget > 0
                ? `${((globals.spent / globals.budget) * 100).toFixed(0)}% do orçamento`
                : "sem orçamento"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" /> A aprovar
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {globals.pendingReview}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">itens submetidos</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            globals.missingDocs > 0 && "border-amber-500/40 bg-amber-500/5",
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <FileWarning className="h-3 w-3" /> Sem fatura
            </div>
            <p
              className={cn(
                "mt-1 text-xl font-bold tabular-nums",
                globals.missingDocs > 0 && "text-amber-600",
              )}
            >
              {globals.missingDocs}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">talões em falta</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerta de sessões acima do orçamento */}
      {globals.overBudget > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              {globals.overBudget} sessão(ões) acima do orçamento
            </p>
            <p className="text-xs text-muted-foreground">
              Reforça o caixa ou ajusta o orçamento.
            </p>
          </div>
        </div>
      )}

      {/* Distribuição por estado */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Receipt className="h-4 w-4 text-primary" /> Itens por estado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ITEM_STATUS_LABELS) as CamarimItemStatus[]).map((st) => (
              <Badge
                key={st}
                variant="outline"
                className={cn("border", ITEM_STATUS_VARIANTS[st])}
              >
                {ITEM_STATUS_LABELS[st]}: {statusTotals[st] ?? 0}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Progresso por sessão */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingBag className="h-4 w-4 text-primary" /> Progresso por sessão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionAggs.map((a) => (
            <div key={a.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(a.spent, a.currency)} /{" "}
                  {formatCurrency(a.budget, a.currency)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    a.pct >= 100
                      ? "bg-destructive"
                      : a.pct >= 80
                        ? "bg-amber-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${a.pct}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{a.itemCount} itens</span>
                {a.pendingReview > 0 && (
                  <Badge variant="outline" className="h-4 border-blue-500/30 bg-blue-500/10 px-1.5 text-[10px] text-blue-600">
                    {a.pendingReview} a aprovar
                  </Badge>
                )}
                {a.missingDocs > 0 && (
                  <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">
                    {a.missingDocs} sem fatura
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top fornecedores e categorias */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-primary" /> Top fornecedores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topSuppliers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            ) : (
              topSuppliers.map((s) => {
                const max = topSuppliers[0].total || 1;
                const w = (s.total / max) * 100;
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(s.total, globals.currency)}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="h-4 w-4 text-primary" /> Top categorias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem categorias atribuídas.</p>
            ) : (
              topCategories.map((c) => {
                const max = topCategories[0].total || 1;
                const w = (c.total / max) * 100;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(c.total, globals.currency)}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
