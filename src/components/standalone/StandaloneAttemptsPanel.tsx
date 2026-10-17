import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listLegacyAttempts, confirmNewIntent, canConfirmNewIntent, reviewMessage, type AttemptSummary, type Context } from "@/lib/standalone-attempt-client";

const STATE_LABEL: Record<string, string> = {
  prepare: "Preparada", authorized: "Autorizada", inprogress: "Em curso (por confirmar)",
  completed: "Concluída", review: "Em revisão",
};
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-PT"); };

/** Descoberta paginada das tentativas do próprio utilizador + confirmação explícita de nova intenção. */
export function StandaloneAttemptsPanel({ operation, context, onSelect }: {
  operation: "scanner_create" | "accountant_edit"; context: Context; onSelect: (a: AttemptSummary | null) => void;
}) {
  const [items, setItems] = useState<AttemptSummary[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);

  const load = async () => {
    const g = ++gen.current; setBusy(true); setMessage(null);
    const all: AttemptSummary[] = []; let after: string | null = null;
    try {
      do { const page = await listLegacyAttempts(operation, context, after); if (g !== gen.current) return; all.push(...page.items); after = page.next; } while (after);
      setItems(all);
    } catch { if (g === gen.current) { setItems(null); setMessage("Consulta de tentativas indisponível neste ambiente."); } }
    finally { if (g === gen.current) setBusy(false); }
  };
  const sorted = [...(items ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = sorted.find((a) => a.id === selected) ?? null;
  const latest = current !== null && sorted[0]?.id === current.id;
  const allowNew = operation === "scanner_create" && current !== null && canConfirmNewIntent(current, latest);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>Procurar as minhas tentativas</Button>
        {items && <span className="text-xs text-muted-foreground">{items.length} encontrada(s)</span>}
      </div>
      {items && items.length > 0 && (
        <select aria-label="Tentativa a consultar" className="w-full rounded-md border border-input bg-background p-2 text-sm" value={selected}
          onChange={(e) => { setSelected(e.target.value); setConfirming(false); onSelect(sorted.find((a) => a.id === e.target.value) ?? null); }}>
          <option value="">Selecionar tentativa</option>
          {sorted.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.reference ?? "Sem número"} — {STATE_LABEL[a.state] ?? a.state} — {fmt(a.created_at)}</option>)}
        </select>
      )}
      {current?.state === "review" && <Alert><AlertDescription>{reviewMessage(current.review_reason)}</AlertDescription></Alert>}
      {current && ["prepare", "authorized", "inprogress"].includes(current.state) && <p className="text-xs text-warning">Resultado por confirmar: consulta a tentativa; não é possível iniciar nova gravação.</p>}
      {allowNew && !confirming && <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Registar outra fatura com os mesmos dados…</Button>}
      {allowNew && confirming && current && (
        <div className="space-y-2 rounded-md bg-muted p-2 text-sm">
          <p>Confirmas que <strong>{current.name}</strong> ({current.reference ?? "sem número"}, {fmt(current.created_at)}) é uma <strong>fatura nova e distinta</strong>, e não uma repetição? A confirmação fica registada em teu nome. Duplicados fortes continuam bloqueados.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={async () => {
              const g = gen.current; setBusy(true);
              try { await confirmNewIntent(current, context); if (g === gen.current) { setMessage("Nova intenção registada."); setConfirming(false); } }
              catch { if (g === gen.current) setMessage("Não foi possível registar a nova intenção. Nada foi gravado."); }
              finally { if (g === gen.current) setBusy(false); }
            }}>Confirmar nova fatura</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
