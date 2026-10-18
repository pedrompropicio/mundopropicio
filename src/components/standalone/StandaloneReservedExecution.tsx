import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { executeLegacyAttempt, resumeLegacyAttempt, type Context } from "@/lib/standalone-attempt-client";

/** Explicit authorization for a still-prepared reservation, never an unknown-result retry. */
export function StandaloneReservedExecution({ id, hash, context, onChecked }: {
  id: string; hash: string; context: Context; onChecked: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const flight = useRef(false);
  const scope = `${context.user_id}:${context.company_id}:${id}:${hash}`;
  useEffect(() => { epoch.current++; setFile(null); setMessage(""); setBusy(false); flight.current = false;
    return () => { epoch.current++; };
  }, [scope]);
  const execute = async () => {
    if (!file || flight.current) return;
    const generation = epoch.current;
    flight.current = true; setBusy(true);
    try {
      const out = await resumeLegacyAttempt("scanner_create", id, hash, context);
      if (generation !== epoch.current) return;
      if (out.attempt?.state !== "prepare") throw new Error("Consulta o resultado; esta reserva não permite uma nova execução.");
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
  return <div className="space-y-2">
    <Label htmlFor="reserved-document">Documento original da reserva</Label>
    <Input id="reserved-document" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy}
      onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(""); }} />
    <Button variant="outline" disabled={busy || !file} onClick={execute}>Autorizar execução da reserva preparada</Button>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
}