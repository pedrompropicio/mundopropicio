/**
 * Drill-down da linha "Comuns" — lista transações sem event_id em contas
 * líquidas. Ferramenta de correção de disciplina de dados: pernas de
 * transferência por classificar, despesas comuns sem vínculo, etc.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/mock-data";
import { ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  dateFrom: string | null;
  dateTo: string | null;
}

export function CommonsDrillSheet({ open, onClose, companyId, dateFrom, dateTo }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["treasury-commons", companyId, dateFrom, dateTo],
    enabled: open,
    queryFn: async () => {
      const { data: accs, error: aErr } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .in("type", ["bank", "cash", "prepaid_card"]);
      if (aErr) throw aErr;
      const accMap = Object.fromEntries((accs ?? []).map((a: any) => [a.id, a.name]));
      const ids = Object.keys(accMap);
      if (ids.length === 0) return [];
      let q = supabase
        .from("transactions")
        .select("id, type, amount, paid_amount, payment_date, description, status, account_id, category_id, account_categories(code,name)")
        .is("event_id", null)
        .in("account_id", ids)
        .order("payment_date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (dateFrom) q = q.gte("payment_date", dateFrom);
      if (dateTo) q = q.lte("payment_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, account_name: accMap[r.account_id] }));
    },
  });

  const total = rows.reduce((s: number, r: any) => {
    const v = r.type === "income" ? Number(r.paid_amount || 0) : -Number(r.paid_amount || 0);
    return s + v;
  }, 0);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Comuns — transações sem evento</SheetTitle>
          <SheetDescription className="text-xs">
            Transações em contas líquidas <em>sem</em> <code>event_id</code>. Inclui pernas de
            transferência por classificar — corrigir aqui melhora a precisão da Tesouraria.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{rows.length} transação(ões)</span>
          <span className={`font-mono font-semibold ${total < 0 ? "text-red-400" : total > 0 ? "text-emerald-500" : ""}`}>
            Σ {formatCurrency(total)}
          </span>
        </div>

        <div className="mt-3 rounded-md border overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Descrição</th>
                <th className="text-left p-2 hidden sm:table-cell">Conta</th>
                <th className="text-left p-2 hidden md:table-cell">Categoria</th>
                <th className="text-right p-2">Valor</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">A carregar…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Nada para mostrar.</td></tr>
              )}
              {rows.map((r: any) => {
                const v = r.type === "income" ? Number(r.paid_amount || 0) : -Number(r.paid_amount || 0);
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap">{r.payment_date ?? "—"}</td>
                    <td className="p-2 truncate max-w-[220px]" title={r.description}>{r.description ?? "—"}</td>
                    <td className="p-2 hidden sm:table-cell text-muted-foreground">{r.account_name}</td>
                    <td className="p-2 hidden md:table-cell text-muted-foreground">
                      {r.account_categories?.code ?? "—"}
                    </td>
                    <td className={`p-2 text-right font-mono ${v < 0 ? "text-red-400" : v > 0 ? "text-emerald-500" : ""}`}>
                      {formatCurrency(v)}
                    </td>
                    <td className="p-2">
                      <Link to={`/transacoes?id=${r.id}`} className="text-primary hover:underline" title="Abrir em Transações">
                        <ExternalLink className="h-3 w-3 inline" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">
          Limite: 500 linhas. Para correções em lote, abre cada transação em /transacoes e
          atribui evento (ou marca como transferência conforme apropriado).
        </p>
      </SheetContent>
    </Sheet>
  );
}
