import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { DataEntryAdapter, DataEntryContext, TicketlineExecution } from "@/lib/data-entry-client";

type Action = { id: string; label: string; depends_on: string[]; kind?: string };
/**
 * #333 fase12e — execução por ação autorizada. Só mostra resultados devolvidos pelo servidor depois de conferidos;
 * resultado incerto bloqueia a repetição até se ler o estado gravado (retoma só leitura).
 */
export default function TicketlineExecutionPanel({ adapter, context, authorizationId, actions, available }: {
  adapter: DataEntryAdapter; context: DataEntryContext; authorizationId: string; actions: Action[]; available: boolean;
}) {
  const [done, setDone] = useState<Record<string, TicketlineExecution>>({});
  const [uncertain, setUncertain] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!adapter.ticketlineExecutionStatus) return;
    const r = await adapter.ticketlineExecutionStatus({ authorization_id: authorizationId }, context);
    setDone(Object.fromEntries(r.executions.map(x => [x.action_id, x])));
    setUncertain(new Set());
  }, [adapter, authorizationId, context]);
  useEffect(() => { if (available) refresh().catch(() => undefined); }, [available, refresh]);

  const execute = async (id: string) => {
    if (!adapter.ticketlineExecute) return;
    setBusy(id); setMsg(m => ({ ...m, [id]: "" }));
    try {
      const r = await adapter.ticketlineExecute({ authorization_id: authorizationId, action_id: id }, context);
      setDone(d => ({ ...d, [id]: r }));
    } catch (e) {
      const text = e instanceof Error ? e.message : "Indisponível.";
      if (/incerto/i.test(text) || e instanceof TypeError || !(e instanceof Error)) setUncertain(u => new Set(u).add(id));
      setMsg(m => ({ ...m, [id]: text }));
    } finally { setBusy(null); }
  };
  const verify = async (id: string) => {
    setBusy(id);
    try { await refresh(); setMsg(m => ({ ...m, [id]: "Estado lido do servidor." })); }
    catch (e) { setMsg(m => ({ ...m, [id]: e instanceof Error ? e.message : "Indisponível." })); }
    finally { setBusy(null); }
  };

  return (
    <section aria-label="Execução autorizada" className="min-w-0 space-y-2 rounded border border-border p-2">
      <div className="font-semibold">Execução das ações autorizadas</div>
      {!available && <p className="text-muted-foreground">Execução indisponível neste ambiente: o executor ainda não está ativo. Nada foi executado.</p>}
      <ul className="space-y-2">
        {actions.map(a => {
          const r = done[a.id];
          const depsOk = a.depends_on.every(d => done[d]);
          const human = a.id === "a3";
          return (
            <li key={a.id} className="min-w-0 space-y-1 rounded border border-border/60 p-1.5">
              <div className="break-words">{a.label}</div>
              {r ? (
                <div className="space-y-0.5">
                  <div className="text-primary">Conferido{r.replayed ? " (já tinha sido executado)" : ""}{summary(a.id, r.result)}</div>
                  <div className="flex flex-wrap gap-2">{r.links?.map(l => <Link key={l.href + l.label} to={l.href} className="underline">{l.label}</Link>)}</div>
                </div>
              ) : available ? (
                <div className="flex flex-wrap items-center gap-2">
                  {human && <span className="text-muted-foreground">Passo humano: confirme o fecho em <Link to="/bilheteiras" className="underline">Bilheteiras → Fechos</Link>; depois confira aqui.</span>}
                  {uncertain.has(a.id)
                    ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => verify(a.id)}>Verificar resultado</Button>
                    : <Button size="sm" variant="outline" disabled={busy !== null || !depsOk} onClick={() => execute(a.id)}>{human ? "Conferir fecho" : a.id === "a4" ? "Conferir pendentes" : "Executar"}</Button>}
                  {!depsOk && <span className="text-muted-foreground">Aguarda: {a.depends_on.filter(d => !done[d]).join(", ")}</span>}
                </div>
              ) : null}
              {msg[a.id] && <p role="status" className="break-words text-muted-foreground">{msg[a.id]}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
function summary(id: string, r: Record<string, unknown>): string {
  if (id === "a1") return ` · ${r.lines ?? "?"} linha(s) em rascunho`;
  if (id === "a2") return " · apuramento confirmado";
  if (id === "a4") return ` · ${r.pending_expenses ?? 0} despesa(s) pendente(s), nada criado`;
  if (id === "a3") return " · fecho confirmado no modal";
  if (id === "a5") return r.already_liquidated ? " · já estava liquidado, nada alterado" : " · transferência do fecho liquidada";
  return "";
}
