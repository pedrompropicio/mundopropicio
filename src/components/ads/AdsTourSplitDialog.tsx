/**
 * #293 — Repartir uma linha de campanha (evento = Master de turnê) por Master + cidades.
 * Sugestão pelo gasto por conjunto no mês da fatura; valores editáveis; grava só
 * depois de confirmação humana e só se a soma bater ao cêntimo com a linha do PDF.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import { decimalFromDatabase, dispatchDecision } from "@/lib/ads-invoice-generation";
import { suggestTourSplit, splitSumMatches, type SplitPart } from "@/lib/ads-tour-split";

interface Props {
  invoiceId: string;
  expectedRevision: number;
  scope: string;
  lineId: string | null;
  amount: number;
  hasSplit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdsTourSplitDialog({ lineId, amount, hasSplit, invoiceId, expectedRevision, scope, onClose, onSaved }: Props) {
  const contextKey=`${scope}:${lineId ?? ''}`;
  const latest=useRef(contextKey);latest.current=contextKey;
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [parts, setParts] = useState<SplitPart[]>([]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ads-tour-split-suggestion", scope, invoiceId, lineId],
    enabled: !!lineId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ads_invoice_line_tour_suggestion", { _line_id: lineId });
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    setParts([]);
    if (!data?.master) return;
    setParts(suggestTourSplit(Number(data.line.amount), data.master, data.cities ?? [], data.adsets ?? []));
  }, [data]);

  const save = useMutation({
    onMutate:()=>contextKey,
    mutationFn: async (p: SplitPart[] | null) => {
      const requestScope=contextKey;
      await dispatchDecision(supabase as any,invoiceId,'set_split',{
        expected_revision:expectedRevision,line_id:lineId,
        parts:p ? p.filter(x=>x.amount!==0).map(x=>({event_id:x.event_id,amount:decimalFromDatabase(x.amount),source:x.source})) : [],
      });
      if (!mounted.current || latest.current!==requestScope) throw new Error('A empresa mudou. Reabra a fatura.');
    },
    onSuccess: (_data,_variables,requestScope) => { if(!mounted.current||latest.current!==requestScope)return;toast.success("Repartição gravada."); onSaved(); onClose(); },
    onError: (e: any,_variables,requestScope) => {if(mounted.current&&latest.current===requestScope)toast.error(e?.message ?? "Não foi possível gravar a repartição.");},
  });

  const sum = Math.round(parts.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  const ok = splitSumMatches(parts, amount);
  const totalSpend = parts.reduce((s, p) => s + p.spend, 0);

  return (
    <Dialog open={!!lineId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="manual-modal-shell max-w-2xl">
        <DialogHeader className="manual-modal-header">
          <DialogTitle>Repartir pela turnê</DialogTitle>
          <DialogDescription>
            Sugestão pelo gasto por conjunto em {data?.month ?? "…"}: conjuntos com uma cidade vão à cidade;
            Portugal, várias cidades ou sem cidade ficam no Master (partilhado). O valor da fatura manda.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
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
                          const v = Number(e.target.value);
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
        </div>
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
