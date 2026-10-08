/**
 * Aviso de divergência da conferência do portal de Produtores (D-ERP192).
 * Lê a MESMA detecção da vigia via RPC get_ticketing_divergences (isolada pela empresa activa).
 * Sem divergências não desenha nada. Sem email, push ou som.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Row {
  event_id: string;
  event_name: string;
  bilheteira: string;
  condicao: "e" | "g";
  our_qty: number | null;
  our_value: number | null;
  portal_qty: number | null;
  portal_value: number | null;
  diff_qty: number | null;
  diff_value: number | null;
  dias: number;
  last_read: string;
  sum_xlsx: number;
  sum_ours: number;
  sum_pdf: number;
}

const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-PT");
const eur = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function TicketingDivergenceIndicator() {
  const { companyId } = useCompany();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["ticketing_divergences", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticketing_divergences" as any);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  if (rows.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center text-warning hover:opacity-80"
        aria-label={`Divergência com o portal de Produtores (${rows.length})`}
        title="Divergência com o portal de Produtores"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Divergência com o portal de Produtores</DialogTitle>
            <DialogDescription>
              Conferência diária entre as nossas vendas e o portal de Produtores da Ticketline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {rows.map((r) => (
              <div key={r.event_id} className="rounded-md border border-border p-3">
                <div className="font-medium">
                  {r.event_name} — {r.bilheteira}
                </div>
                {r.condicao === "g" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    O Mapa de Ocupação (PDF) do portal está parado, enquanto o occupation.xlsx do mesmo
                    evento continua a mexer (últimos 3 dias: xlsx +{n(r.sum_xlsx)}, nossas +{n(r.sum_ours)},
                    PDF +{n(r.sum_pdf)}). <strong>É problema do fornecedor, não nosso</strong> — a nossa
                    captura está a funcionar.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    A variação diária do portal (xlsx) difere da nossa há 3 dias seguidos (xlsx +{n(r.sum_xlsx)},
                    nossas +{n(r.sum_ours)}). Pode faltar captura nossa.
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Nossa plataforma</dt>
                  <dd>{n(r.our_qty)} bilhetes · {eur(r.our_value)}</dd>
                  <dt className="text-muted-foreground">Portal (PDF)</dt>
                  <dd>{n(r.portal_qty)} bilhetes · {eur(r.portal_value)}</dd>
                  <dt className="text-muted-foreground">Diferença</dt>
                  <dd>{n(r.diff_qty)} bilhetes · {eur(r.diff_value)}</dd>
                  <dt className="text-muted-foreground">Dura há</dt>
                  <dd>{r.dias} dia{r.dias === 1 ? "" : "s"}</dd>
                  <dt className="text-muted-foreground">Última leitura</dt>
                  <dd>{ddmmyyyy(r.last_read)}</dd>
                </dl>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
