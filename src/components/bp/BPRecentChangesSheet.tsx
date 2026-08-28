import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/mock-data";
import { formatLisbonDateTime } from "@/lib/date-lisbon";
import { AlertTriangle, Trash2, Plus, Pencil } from "lucide-react";

type ChangeField = { field: string; label: string; before: string | null; after: string | null };

type BPChange = {
  changed_at: string;
  action: "create" | "update" | "delete" | string;
  author: string;
  forecast_id: string;
  description: string | null;
  forecast_type: string | null;
  changes: ChangeField[] | null;
};

const PERIODS = [7, 30, 90] as const;

/** Campos monetários — formatados em EUR pt-PT, sem abreviar nem arredondar. */
const MONEY_FIELDS = new Set(["amount"]);

function fmtValue(field: string, raw: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (MONEY_FIELDS.has(field)) {
    const n = Number(raw);
    return Number.isFinite(n) ? formatCurrency(n) : raw;
  }
  if (raw === "true") return "Sim";
  if (raw === "false") return "Não";
  return raw;
}

function amountOf(c: BPChange): { before: number | null; after: number | null } {
  const f = (c.changes ?? []).find((x) => x.field === "amount");
  const num = (v: string | null) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return { before: num(f?.before ?? null), after: num(f?.after ?? null) };
}

/** Alterações que motivaram esta vista: eliminações e quedas de valor > 0 para 0. */
function isCritical(c: BPChange): boolean {
  if (c.action === "delete") return true;
  const { before, after } = amountOf(c);
  return before !== null && before > 0 && after === 0;
}

export function BPRecentChangesSheet({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [days, setDays] = useState<number>(30);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["bp-recent-changes", eventId, days],
    enabled: open && !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_bp_changes" as any, {
        p_event_id: eventId,
        p_days: days,
      });
      if (error) throw error;
      return (data ?? []) as BPChange[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Alterações recentes</SheetTitle>
          <SheetDescription>
            Registo de criações, edições e eliminações de linhas do Business Plan deste evento.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                days === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Sem alterações no período.
            </p>
          )}
          {rows.map((c, i) => {
            const critical = isCritical(c);
            const Icon = c.action === "delete" ? Trash2 : c.action === "create" ? Plus : Pencil;
            return (
              <div
                key={`${c.forecast_id}-${c.changed_at}-${i}`}
                className={`rounded-lg border p-3 ${
                  critical ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Icon className={`h-3.5 w-3.5 ${critical ? "text-destructive" : "text-muted-foreground"}`} />
                    <span className={critical ? "text-destructive font-semibold" : ""}>
                      {c.action === "delete" ? "Eliminada" : c.action === "create" ? "Criada" : "Alterada"}
                    </span>
                    <span className="text-foreground">«{c.description || "sem descrição"}»</span>
                  </div>
                  {critical && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                </div>

                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatLisbonDateTime(c.changed_at)} · {c.author}
                  {c.forecast_type ? ` · ${c.forecast_type === "income" ? "Receita" : "Despesa"}` : ""}
                </p>

                <ul className="mt-2 space-y-0.5">
                  {(c.changes ?? []).map((f) => (
                    <li key={f.field} className="text-xs">
                      <span className="text-muted-foreground">{f.label}: </span>
                      {c.action === "create" ? (
                        <span className="font-mono">{fmtValue(f.field, f.after)}</span>
                      ) : c.action === "delete" ? (
                        <span className="font-mono">{fmtValue(f.field, f.before)}</span>
                      ) : (
                        <span className="font-mono">
                          {fmtValue(f.field, f.before)} → <span className={critical ? "text-destructive font-semibold" : ""}>{fmtValue(f.field, f.after)}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default BPRecentChangesSheet;
