/**
 * Bridge "Onde está o dinheiro" — drill-down por evento.
 *
 * Decomposição (MVP, sem PDF, sem recalcular DRE):
 *   Realizado de caixa (pool)              ← RPC get_event_cash_position
 *   + Comprometido (approved não pago)     ← RPC
 *   − Retido na bilheteira (liq. condic.)  ← helper ticket-office-retained
 *   − Pago por sócios externos (a regularizar) ← partner_paid_expenses
 *   = Disponibilidade real do evento
 *
 * Informativo: participação % da empresa (100 − Σ sócios externos). Sem
 * reservas automáticas. Cada linha tem link para a vista correspondente do
 * evento (DRE, BP, Acerto de Sócios) — não recalcula nada.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/mock-data";
import { ArrowRight, Info } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  retained: number; // já calculado no parent
  poolRow: {
    realized: number; committed: number; pending: number;
    event_name: string; is_sub: boolean;
  } | null;
}

export function TreasuryBridgeSheet({ open, onClose, eventId, retained, poolRow }: Props) {
  // Dados do evento + sócios externos + extras pagos por sócios não liquidados
  const { data: ev } = useQuery({
    queryKey: ["treasury-bridge-event", eventId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, parent_event_id, event_partners(percentage)")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: paidByPartners = 0 } = useQuery({
    queryKey: ["treasury-bridge-paid-by-partners", eventId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("amount")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    },
  });

  const externalPct = (ev?.event_partners ?? []).reduce(
    (s: number, p: any) => s + Number(p.percentage || 0), 0,
  );
  const housePct = Math.max(0, 100 - externalPct);

  const realized = poolRow?.realized ?? 0;
  const committed = poolRow?.committed ?? 0;
  const pending = poolRow?.pending ?? 0;
  const poolAvailability = realized + committed - paidByPartners;
  const totalPotential = poolAvailability + retained;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{poolRow?.event_name ?? "Evento"}</SheetTitle>
          <SheetDescription className="text-xs">
            Onde está o dinheiro — decomposição de tesouraria
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2 text-sm">
          <BridgeRow
            label="Realizado de caixa (pool)"
            value={realized}
            hint="Saídas/entradas pagas em contas líquidas (bank/cash/prepaid_card)."
          />
          <BridgeRow
            label="+ Comprometido (aprovado por pagar)"
            value={committed}
            muted
            hint="Timing — já decidido, ainda não saiu."
          />
          <BridgeRow
            label="− Retido na bilheteira"
            value={-retained}
            tag="liquidez condicionada"
            hint="Depende de repasse bilheteira/sala (withholds_revenue)."
            link={{ to: "/bilheteiras", label: "ver bilheteiras" }}
          />
          <BridgeRow
            label="− Pago por sócios externos (a regularizar)"
            value={-paidByPartners}
            hint="Despesas suportadas por sócios — pendentes de acerto."
            link={{ to: `/eventos/${eventId}`, label: "ver Acerto de Sócios" }}
          />
          <div className="border-t pt-2 mt-2 flex items-center justify-between font-semibold">
            <span>= Disponibilidade real do evento</span>
            <span className={`font-mono ${availability >= 0 ? "text-emerald-500" : "text-red-400"}`}>
              {formatCurrency(availability)}
            </span>
          </div>

          {pending !== 0 && (
            <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-2">
              <Info className="h-3 w-3 mt-px shrink-0" />
              Pendente ({formatCurrency(pending)}) não está incluído — menor certeza, ainda não aprovado.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Participação Mundo Propício</span>
            <Badge variant="outline">{housePct.toFixed(2)}%</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sócios externos (Σ)</span>
            <Badge variant="outline">{externalPct.toFixed(2)}%</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1">
            Informativo — sem reservas automáticas. O resultado contabilístico do evento
            está na aba DRE; este ecrã trata de <em>disponibilidade de caixa</em>.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <Link to={`/eventos/${eventId}`} className="text-xs flex items-center gap-1 text-primary hover:underline">
            Abrir evento <ArrowRight className="h-3 w-3" />
          </Link>
          <Link to={`/relatorios/dre?event=${eventId}`} className="text-xs flex items-center gap-1 text-primary hover:underline">
            Ver DRE do evento <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BridgeRow({ label, value, muted, tag, hint, link }: {
  label: string; value: number; muted?: boolean; tag?: string; hint?: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
          {tag && <Badge variant="outline" className="text-[9px] py-0">{tag}</Badge>}
        </div>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
        {link && (
          <Link to={link.to} className="text-[10px] text-primary hover:underline">
            {link.label} →
          </Link>
        )}
      </div>
      <span className={`font-mono text-xs ${muted ? "text-muted-foreground" : value < 0 ? "text-red-400" : value > 0 ? "text-emerald-500" : ""}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
