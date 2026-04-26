import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Link2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  useOrphanTransactions,
  useRelinkOrphanTransactions,
  type OrphanMatchReason,
  type OrphanTransactionRow,
} from "@/hooks/useBPVersions";
import { formatInCurrency } from "@/lib/currency";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

const reasonMeta: Record<
  OrphanMatchReason,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; tone: string }
> = {
  strong_match: { label: "Forte", variant: "default", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  category_match: { label: "Categoria", variant: "secondary", tone: "" },
  weak_match: { label: "Fraco", variant: "outline", tone: "text-warning border-warning/40" },
  no_match: { label: "Sem afinidade", variant: "outline", tone: "text-muted-foreground" },
  no_candidate: { label: "Sem candidato", variant: "outline", tone: "text-muted-foreground" },
};

export function OrphanTransactionsReviewModal({ open, onOpenChange, eventId }: Props) {
  const { data: orphans = [], isLoading, refetch, isFetching } = useOrphanTransactions(
    open ? eventId : null
  );
  const relink = useRelinkOrphanTransactions(eventId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pre-select strong/category matches when data arrives
  useEffect(() => {
    if (!open || orphans.length === 0) return;
    const auto = new Set<string>();
    for (const o of orphans) {
      if (o.best_forecast_id && (o.match_reason === "strong_match" || o.match_reason === "category_match")) {
        auto.add(o.transaction_id);
      }
    }
    setSelected(auto);
  }, [open, orphans]);

  const summary = useMemo(() => {
    const s = { strong: 0, category: 0, weak: 0, none: 0 };
    for (const o of orphans) {
      if (o.match_reason === "strong_match") s.strong++;
      else if (o.match_reason === "category_match") s.category++;
      else if (o.match_reason === "weak_match") s.weak++;
      else s.none++;
    }
    return s;
  }, [orphans]);

  const linkable = orphans.filter((o) => o.best_forecast_id);
  const allSelected = linkable.length > 0 && linkable.every((o) => selected.has(o.transaction_id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(linkable.map((o) => o.transaction_id)));
    }
  };

  const toggleOne = (txId: string) => {
    const next = new Set(selected);
    if (next.has(txId)) next.delete(txId);
    else next.add(txId);
    setSelected(next);
  };

  const selectStrongOnly = () => {
    const next = new Set<string>();
    for (const o of orphans) {
      if (o.best_forecast_id && o.match_reason === "strong_match") next.add(o.transaction_id);
    }
    setSelected(next);
  };

  const handleApply = () => {
    const pairs = orphans
      .filter((o) => selected.has(o.transaction_id) && o.best_forecast_id)
      .map((o) => ({ transaction_id: o.transaction_id, forecast_id: o.best_forecast_id! }));
    if (pairs.length === 0) return;
    relink.mutate(pairs, {
      onSuccess: () => {
        setSelected(new Set());
        refetch();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Transações órfãs do BP
          </DialogTitle>
          <DialogDescription>
            Após uma promoção/reversão de cenário, transações podem perder a ligação ao Business Plan.
            Reveja as sugestões de revinculação abaixo.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Total: {orphans.length}</Badge>
          <Badge className={reasonMeta.strong_match.tone}>Forte: {summary.strong}</Badge>
          <Badge variant="secondary">Categoria: {summary.category}</Badge>
          <Badge variant="outline" className="text-warning border-warning/40">Fraco: {summary.weak}</Badge>
          <Badge variant="outline" className="text-muted-foreground">Sem candidato: {summary.none}</Badge>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectStrongOnly}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Apenas correspondências fortes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionada(s) de {linkable.length} possíveis
          </span>
        </div>

        <ScrollArea className="h-[420px] rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={linkable.length === 0}
                  />
                </TableHead>
                <TableHead>Transação</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Sugestão (BP)</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : orphans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Sem transações órfãs neste evento. ✅
                  </TableCell>
                </TableRow>
              ) : (
                orphans.map((o) => (
                  <OrphanRow
                    key={o.transaction_id}
                    row={o}
                    selected={selected.has(o.transaction_id)}
                    onToggle={() => toggleOne(o.transaction_id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={relink.isPending}>
            Fechar
          </Button>
          <Button
            onClick={handleApply}
            disabled={selected.size === 0 || relink.isPending}
          >
            {relink.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-1.5" />
            )}
            Revincular {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrphanRow({
  row,
  selected,
  onToggle,
}: {
  row: OrphanTransactionRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = reasonMeta[row.match_reason] ?? reasonMeta.no_match;
  const linkable = !!row.best_forecast_id;

  return (
    <TableRow className={selected ? "bg-muted/30" : ""}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggle} disabled={!linkable} />
      </TableCell>
      <TableCell>
        <div className="font-medium text-sm">{row.tx_description ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {row.tx_date ? format(parseISO(row.tx_date), "dd MMM yyyy", { locale: pt }) : "—"}
          {row.tx_status && <span className="ml-2">· {row.tx_status}</span>}
        </div>
      </TableCell>
      <TableCell className="text-xs">{row.tx_category_name ?? "—"}</TableCell>
      <TableCell className="text-right font-mono text-sm">
        {formatInCurrency(row.tx_amount, "EUR")}
      </TableCell>
      <TableCell>
        {row.best_forecast_id ? (
          <div className="space-y-0.5">
            <div className="text-sm">{row.best_forecast_description ?? "—"}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.best_forecast_amount != null ? formatInCurrency(row.best_forecast_amount, "EUR") : "—"}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">sem candidato</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Badge variant={meta.variant} className={meta.tone}>
          {meta.label}
          {linkable && <span className="ml-1 opacity-70">· {row.match_score}</span>}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
