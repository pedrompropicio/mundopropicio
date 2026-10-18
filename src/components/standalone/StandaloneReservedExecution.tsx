import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { executeLegacyAttempt, resumeLegacyAttempt, type Context } from "@/lib/standalone-attempt-client";

/** Explicit authorization for a still-prepared reservation, never an unknown-result retry. */
export function StandaloneReservedExecution({ id, hash, context, onChecked }: {
  id: string; hash: string; context: Context; onChecked: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{id:string;hash:string;user_id:string;company_id:string;operation:string;company_name?:string;actor_name?:string;payer_name?:string;envelope:{payload:Record<string, unknown>}} | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const flight = useRef(false);
  const scope = `${context.user_id}:${context.company_id}:${id}:${hash}`;
  useEffect(() => { epoch.current++; setSnapshot(null); setFile(null); setMessage(""); setBusy(false); flight.current = false;
    const generation = epoch.current;
    resumeLegacyAttempt("scanner_create", id, hash, context).then(out => {
      if (generation !== epoch.current) return;
      const bound = out.snapshot;
      if (!bound || bound.id !== id || bound.hash !== hash || bound.user_id !== context.user_id || bound.company_id !== context.company_id || bound.operation !== "scanner_create" || !bound.envelope?.payload || out.attempt?.state !== "prepare") {
        setMessage("Consulta o resultado; esta reserva não permite uma nova execução."); return;
      }
      setSnapshot(bound);
    }).catch(() => { if (generation === epoch.current) setMessage("Conferência pendente. Não repitas."); });
    return () => { epoch.current++; };
  }, [scope]);
  const execute = async () => {
    if (!file || !snapshot || flight.current) return;
    const generation = epoch.current;
    flight.current = true; setBusy(true);
    try {
      const out = await resumeLegacyAttempt("scanner_create", id, hash, context);
      if (generation !== epoch.current) return;
      if (out.attempt?.state !== "prepare" || JSON.stringify(out.snapshot) !== JSON.stringify(snapshot)) throw new Error("Consulta o resultado; esta reserva não permite uma nova execução.");
      const result = await executeLegacyAttempt("scanner_create", out.attempt, file, context);
      if (generation !== epoch.current) return;
      if (result.status !== "conferido") throw new Error("Resultado por confirmar. Consulta a tentativa; não repitas.");
      setMessage("Fatura registada e conferida."); onChecked();
    } catch (error) {
      if (generation === epoch.current) setMessage(error instanceof Error ? error.message : "Conferência pendente. Não repitas.");
    } finally {
      if (generation === epoch.current) { flight.current = false; setBusy(false); }
    }
  };
  const payload = snapshot?.envelope?.payload;
  const amount = (value: unknown) => typeof value === "number" ? value.toLocaleString("pt-PT", {style:"currency", currency:typeof payload?.currency === "string" ? payload.currency : "EUR"}) : "Não indicado";
  return <div className="space-y-2">
    {payload && <section aria-label="Dados confirmados da reserva" className="space-y-1 text-sm">
      <h3 className="font-semibold">Fatura Avulsa — autorização da reserva</h3>
      <p>Empresa: {snapshot?.company_name ?? "Empresa ativa"} · Autorizador: {snapshot?.actor_name ?? "Utilizador da sessão"} · Pagou: {snapshot?.payer_name ?? "Não indicado"}</p>
      <p>Fornecedor: {String(payload.supplier_name ?? "Não indicado")} · NIF: {String(payload.supplier_nif ?? "Não indicado")}</p>
      <p>Número: {String(payload.invoice_number ?? "Não indicado")} · Data: {String(payload.invoice_date ?? "Não indicada")}</p>
      <p>Total: {amount(payload.total_amount)} · IVA: {amount(payload.iva_amount)} · Moeda: {String(payload.currency)}</p>
      <p>Documento: {String(payload.file_name)} · Nota: {String(payload.notes ?? "Sem nota")}</p>
      <p>Efeito autorizado: uma Fatura Avulsa com documento e estes dados. Sem transação, BP, pagamento, conta ou reembolso.</p>
    </section>}
    <Label htmlFor="reserved-document">Documento original da reserva</Label>
    <Input id="reserved-document" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy}
      onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(""); }} />
    <Button variant="outline" disabled={busy || !file || !snapshot} onClick={execute}>Autorizar execução da reserva preparada</Button>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
}