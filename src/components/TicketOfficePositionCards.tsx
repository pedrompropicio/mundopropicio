import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/mock-data";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeTicketOfficeBalance } from "@/lib/ticket-office-balance";
import { ticketOfficePosition } from "@/lib/ticket-office-position";

export function TicketOfficePositionCards({ officeId }: { officeId: string }) {
  const [detail, setDetail] = useState<"events" | "calendar" | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ticket-office-position", officeId],
    queryFn: async () => {
      const [sales, transactions, assignments, settlements, statements, balances] = await Promise.all([
        supabase.rpc("get_ticket_office_sales", { p_account_id: officeId }),
        fetchAllPagedQuery(supabase.from("transactions").select("account_id,type,paid_amount,status,event_id,reversed_at,is_hidden").eq("account_id", officeId)),
        fetchAllPagedQuery(supabase.from("event_ticket_office_assignments").select("event_id,events(id,name)").eq("financial_account_id", officeId)),
        fetchAllPagedQuery(supabase.from("ticket_office_settlements").select("event_id").eq("financial_account_id", officeId)),
        (supabase as any).from("ticket_office_statements").select("id,number,document_total,ticket_office_statement_lines!ticket_office_statement_lines_statement_id_fkey(id,event_id,line_type,description,amount,transaction_id)").eq("financial_account_id", officeId).order("statement_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.rpc("ticket_office_balances", { _account_ids: [officeId] }),
      ]);
      for (const result of [sales, transactions, assignments, settlements, statements, balances]) {
        if (result.error) throw result.error;
      }
      const retained = balances.data?.find((row) => row.account_id === officeId)?.balance;
      if (retained == null) return null;
      const latest = statements.data?.[0];
      const allLines = (statements.data ?? []).flatMap((statement: any) => statement.ticket_office_statement_lines ?? []);
      const assigned = assignments.data ?? [];
      const eventIds = [...new Set(assigned.map((row: any) => row.event_id))];
      const { byEvent } = computeTicketOfficeBalance({
        officeId, assignedEventIds: eventIds,
        sales: (sales.data ?? []).map((row) => ({ event_id: row.event_id, financial_account_id: officeId, total_value: Number(row.revenue), quantity: 0, unit_price: 0 })),
        transactions: transactions.data ?? [], advances: [],
      });
      const events = eventIds.map((id) => ({ id, name: (assigned.find((row: any) => row.event_id === id) as any)?.events?.name ?? id, balance: byEvent[id] ?? 0 }));
      const invoiceIds = [...new Set<string>(allLines.filter((line: any) => line.line_type === "ticketline_invoice" && line.transaction_id).map((line: any) => String(line.transaction_id)))];
      const calendarItems: { id: string; description: string; amount: number }[] = [];
      for (let offset = 0; offset < invoiceIds.length; offset += 100) {
        const result = await supabase.from("transactions").select("id,description,account_id").in("id", invoiceIds.slice(offset, offset + 100)).is("account_id", null).limit(100);
        if (result.error) throw result.error;
        for (const transaction of result.data ?? []) {
          const line = allLines.find((item: any) => item.transaction_id === transaction.id);
          calendarItems.push({ id: transaction.id, description: transaction.description ?? line.description, amount: Math.abs(Number(line.amount)) });
        }
      }
      for (const line of latest?.ticket_office_statement_lines ?? []) {
        if (line.line_type === "venue_settlement") calendarItems.push({ id: line.id, description: /f[oó]rum braga/i.test(line.description ?? "") ? `${line.description} — Deive Leonardo — Braga; a regularizar quando o fecho for confirmado e a InvestBraga devolver os 258,85 €.` : `${line.description} — a regularizar quando o fecho for confirmado e a sala efectuar a devolução.`, amount: -Number(line.amount ?? 0) });
      }
      return { ...ticketOfficePosition(events, (settlements.data ?? []).map((row) => row.event_id), allLines.map((line: any) => line.event_id).filter(Boolean), Number(latest?.document_total ?? 0), Number(retained)), latest, calendarItems };
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar posição…</p>;
  if (error) return <p className="text-sm text-destructive">Não foi possível consultar a posição da bilheteira.</p>;
  if (!data) return null;
  return (
    <section className="space-y-3" aria-label="Posição da bilheteira">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold">Valor por apurar</p>
          <p className="text-2xl font-mono font-bold break-words">{formatCurrency(data.openTotal)}</p>
          <p className="text-xs text-muted-foreground">O que está por receber da bilheteira; um evento já liquidado em dinheiro entra a zero mesmo sem fecho.</p>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setDetail(detail === "events" ? null : "events")} aria-expanded={detail === "events"}>{data.openEvents.length} eventos</Button>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold">Já adiantado</p>
          <p className="text-2xl font-mono font-bold break-words">{formatCurrency(data.advanced)}</p>
          <p className="text-xs text-muted-foreground">{data.position < 0 ? "Dinheiro que a bilheteira já repassou a mais do que os eventos apurados renderam, como adiantamento sobre os eventos seguintes." : data.position > 0 ? "A posição do último apuramento é positiva: este valor está a entregar à MP, não é um adiantamento." : "O último apuramento não tem valor adiantado nem por entregar."}</p>
          {data.latest && <p className="text-xs text-muted-foreground">Apuramento {data.latest.number}</p>}
        </div>
        <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-2">
          <p className="text-sm font-semibold">Saldo retido</p>
          <p className="text-2xl font-mono font-bold text-primary break-words">{formatCurrency(data.retained)}</p>
          <p className="text-xs text-muted-foreground">Dinheiro verdadeiro que a bilheteira tem da MP, a favor da MP. O já adiantado está incluído neste saldo.</p>
          {Math.abs(data.calendarDifference) >= 0.01 && <Button variant="link" className="h-auto p-0 text-left text-xs text-muted-foreground whitespace-normal" onClick={() => setDetail(detail === "calendar" ? null : "calendar")} aria-expanded={detail === "calendar"}>
            Diferença de calendário: {formatCurrency(data.calendarDifference)} — movimentos que a bilheteira já fez mas que o nosso registo ainda não reflecte, e eventos à espera do seu apuramento. Neste momento, é a bilheteira local da sala em eventos ainda sem fecho confirmado.
          </Button>}

        </div>
      </div>
      {detail === "events" && <ul className="space-y-2 text-sm">{data.openEvents.map((event) => <li key={event.id} className="flex justify-between gap-4"><Link className="hover:underline" to={`/eventos/${event.id}`}>{event.name}</Link><span className="font-mono whitespace-nowrap">{formatCurrency(event.balance)}</span></li>)}</ul>}
      {detail === "calendar" && Math.abs(data.calendarDifference) >= 0.01 && <div className="space-y-2 text-sm text-muted-foreground"><ul className="space-y-2">{data.calendarItems.map((item) => <li key={item.id} className="flex justify-between gap-4"><span>{item.description}</span><span className="font-mono whitespace-nowrap">{formatCurrency(item.amount)}</span></li>)}</ul><Link className="hover:underline" to={`/relatorios/bilheteiras?conta=${officeId}`}>Ver movimentos da bilheteira</Link></div>}
      <p className="text-xs text-muted-foreground">Valor por apurar {data.position > 0 ? "+ posição a entregar" : "− já adiantado"} {Math.abs(data.calendarDifference) >= 0.01 ? "+ diferença de calendário =" : "="} saldo retido.</p>
    </section>
  );
}