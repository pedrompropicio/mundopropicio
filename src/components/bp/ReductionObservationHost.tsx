import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setReductionObservationPrompter, type ReductionPromptInfo } from "@/lib/forecast-amount";

const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

/** #240 — diálogo curto que pede a observação ao reduzir uma linha de BP com realizado. */
export function ReductionObservationHost() {
  const [info, setInfo] = useState<ReductionPromptInfo | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    setReductionObservationPrompter(
      (i) =>
        new Promise((resolve) => {
          resolver.current = resolve;
          setText("");
          setInfo(i);
        }),
    );
    return () => setReductionObservationPrompter(null);
  }, []);

  const close = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setInfo(null);
  };

  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && close(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reduzir verba da linha</DialogTitle>
          <DialogDescription>
            {info?.description ?? "Linha de BP"}: {eur(info?.oldAmount ?? 0)} → {eur(info?.newAmount ?? 0)}. Esta linha
            já tem {eur(info?.realized ?? 0)} realizado — indica o motivo da redução.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Observação (obrigatória)" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>Cancelar</Button>
          <Button disabled={!text.trim()} onClick={() => close(text.trim())}>Reduzir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
