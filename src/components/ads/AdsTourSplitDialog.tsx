/**
 * #293 — Repartir uma linha de campanha (evento = Master de turnê) por Master + cidades.
 * Sugestão pelo gasto por conjunto no mês da fatura; valores editáveis; grava só
 * depois de confirmação humana e só se a soma bater ao cêntimo com a linha do PDF.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import { suggestTourSplit, splitSumMatches, type SplitPart } from "@/lib/ads-tour-split";

interface Props {
  lineId: string | null;
  amount: number;
  hasSplit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdsTourSplitDialog({ lineId, amount, hasSplit, onClose, onSaved }: Props) {
  const [parts, setParts] = useState<SplitPart[]>([]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ads-tour-split-suggestion", lineId],
    enabled: !!lineId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ads_invoice_line_tour_suggestion", { _line_id: lineId });
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!data?.master) return;
    setParts(suggestTourSplit(Number(data.line.amount), data.master, data.cities ?? [], data.adsets ?? []));
  }, [data]);

  const save = useMutation({
    mutationFn: async (p: SplitPart[] | null) => {
      const { error } = await (supabase as any).rpc("ads_invoice_line_set_tour_split", {
        _line_id: lineId,
        _parts: p ? p.map((x) => ({ event_id: x.event_id, amount: x.amount, source: x.source })) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Repartição gravada."); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível gravar a repartição."),
  });

  const sum = Math.round(parts.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  const ok = splitSumMatches(parts, amount);
  const totalSpend = parts.reduce((s, p) => s + p.spend, 0);

  return (
    <Dialog open={!!lineId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Repartir pela turnê</DialogTitle>
          <DialogDescription>
            Sugestão pelo gasto por conjunto em {data?.month ?? "…"}: conjuntos com uma cidade vão à cidade;
            Portugal, várias cidades ou sem cidade ficam no Master (partilhado). O valor da fatura manda.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">A calcular sugestão…</p>}
        {error && <p className="text-sm text-destructive">{(error as any).message}</p>}
        {!isLoading && !error && (
          <>
            {totalSpend === 0 && (
              <p className="text-sm text-muted-foreground">Sem gasto por conjunto neste mês: a sugestão deixa tudo no Master.</p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead className="text-right">Gasto conjuntos</TableHead>
                  <TableHead className="text-right w-40">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p, i) => (
                  <TableRow key={p.event_id}>
                    <TableCell>{p.label}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(p.spend)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-right"
                        aria-label={`Valor ${p.label}`}
                        value={p.amount}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value) * 100) / 100;
                          setParts((ps) => ps.map((x, j) => (j === i ? { ...x, amount: v, source: "manual" } : x)));
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Soma / linha da fatura</TableCell>
                  <TableCell />
                  <TableCell className={`text-right font-semibold tabular-nums ${ok ? "" : "text-destructive"}`}>
                    {formatCurrency(sum)} / {formatCurrency(amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {!ok && <p className="text-sm text-destructive">A soma das partes tem de ser igual ao valor da linha, ao cêntimo.</p>}
          </>
        )}
        <DialogFooter className="gap-2">
          {hasSplit && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Remover repartição
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok || save.isPending || parts.length === 0} onClick={() => save.mutate(parts)}>
            Confirmar repartição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
