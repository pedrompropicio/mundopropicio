/**
 * D-ERP246 (#85) — "Pagas pelo sócio": fonte única = transactions.paying_partner_id.
 * Mostra por sócio total, IVA (por sede, computePartnerRebill) e cria a devolução
 * como transação TRANSITÓRIA fora do resultado (rubrica 10.3), nunca custo novo.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mustWrite } from "@/lib/must-write";
import { computePartnerRebill, REBILL_REGIME_LABEL } from "@/lib/partner-rebill-vat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PaidByPartnerPanel({ eventId, eventName }: { eventId: string; eventName: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["paid-by-partner", eventId],
    queryFn: async () => {
      const [{ data: ev, error: e1 }, { data: txs, error: e2 }, { data: refunds, error: e3 }] = await Promise.all([
        supabase.from("events").select("company_id, cities(country)").eq("id", eventId).single(),
        supabase
          .from("transactions")
          .select("id, amount, iva_rate, paying_partner_id, event_partners:event_partners!transactions_paying_partner_id_fkey(id, supplier_id, suppliers(name, country))")
          .eq("event_id", eventId)
          .eq("type", "expense")
          .not("paying_partner_id", "is", null)
          .is("reversed_at", null)
          .limit(1000),
        supabase
          .from("transactions")
          .select("id, amount, supplier_id")
          .eq("event_id", eventId)
          .eq("transitory_reason", "devolucao_socio" as any)
          .is("reversed_at", null)
          .limit(1000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return { ev: ev as any, txs: (txs ?? []) as any[], refunds: (refunds ?? []) as any[] };
    },
  });

  if (!data || data.txs.length === 0) return null;
  const servicePlace = (data.ev?.cities?.country as string | null) ?? "PT";
  const groups = new Map<string, { supplierId: string; name: string; country: string; txs: any[] }>();
  for (const t of data.txs) {
    const ep = t.event_partners;
    const g = groups.get(t.paying_partner_id) ?? {
      supplierId: ep?.supplier_id,
      name: ep?.suppliers?.name ?? "Sócio",
      country: ep?.suppliers?.country ?? "PT",
      txs: [],
    };
    g.txs.push(t);
    groups.set(t.paying_partner_id, g);
  }

  const generate = async (partnerId: string, g: { supplierId: string; name: string }, aDevolver: number) => {
    setBusy(partnerId);
    try {
      const cat = await mustWrite<any>(
        supabase.from("account_categories").select("id").eq("company_id", data.ev.company_id).eq("code", "10.3").limit(1) as any,
        "Rubrica 10.3",
        { expectRows: true },
      );
      await mustWrite(
        supabase
          .from("transactions")
          .insert({
            description: `Devolução ao sócio ${g.name} — despesas pagas (${eventName})`,
            type: "expense",
            amount: aDevolver,
            iva_rate: 0,
            event_id: eventId,
            category_id: cat[0].id,
            supplier_id: g.supplierId,
            date: todayLocal(),
            status: "pending",
            is_transitory: true,
            transitory_reason: "devolucao_socio",
            exclude_from_result: true,
            payment_method: "transfer",
          } as any)
          .select("id") as any,
        "Gerar devolução",
        { expectRows: true },
      );
      toast.success("Devolução criada (pendente, fora do resultado).");
      qc.invalidateQueries({ queryKey: ["paid-by-partner", eventId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pagas pelo sócio</CardTitle>
        <p className="text-xs text-muted-foreground">
          O custo já está no BP do evento; aqui só a dívida ao sócio. Regras por confirmar (D-ERP246).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...groups.entries()].map(([pid, g]) => {
          const r = computePartnerRebill(g.txs, g.country, servicePlace);
          const done = data.refunds.filter((x) => x.supplier_id === g.supplierId).reduce((s, x) => s + Number(x.amount), 0);
          const falta = Math.round((r.aDevolver - done) * 100) / 100;
          return (
            <div key={pid} className="rounded-md border border-border/60 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{g.name} <Badge variant="outline">{g.country}</Badge></span>
                <span className="text-xs text-muted-foreground">{REBILL_REGIME_LABEL[r.regime]}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>{g.txs.length} despesas</div>
                <div>Base {eur(r.base)}</div>
                <div>IVA faturado {eur(r.ivaFaturado)}</div>
                <div>IVA autoliquidado {eur(r.ivaAutoliquidado)}</div>
                <div className="font-semibold">A devolver {eur(r.aDevolver)}</div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Já gerado {eur(done)} · falta {eur(falta)}</span>
                <Button size="sm" disabled={falta < 0.01 || busy === pid} onClick={() => generate(pid, g, falta)}>
                  Gerar devolução
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
