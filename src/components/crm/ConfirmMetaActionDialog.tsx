/**
 * ConfirmMetaActionDialog
 * ────────────────────────────────────────────────────────────────────────────
 * Guard de confirmação partilhado para qualquer escrita em Meta via
 * `crm-meta-entity-action`. Fluxo: abrir → dry_run (validação + impacto) →
 * mostrar resumo → utilizador confirma → escrita real.
 *
 * Faz-se via Provider + hook imperativo `useConfirmMetaAction()` exposto no
 * root da app, para que qualquer callsite possa pedir confirmação sem montar
 * o seu próprio dialog. Padrão inspirado em MetaPublishPanel (prepare → exec).
 *
 * Risk-first: usar SEMPRE em mudanças que GASTAM (subir verba) ou ATIVAM.
 * Pausar continua a usar `confirm()` nativo (menor risco — reduz gasto).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ── Tipos públicos ──────────────────────────────────────────────────────────
export type PendingMetaAction = {
  connection_id: string;
  entity_type: "campaign" | "adset" | "ad";
  external_id: string;
  ad_account_id?: string | null;
  action: "pause" | "activate" | "update";
  updates?: Record<string, unknown>;
  /** Label humano (ex.: "Adset «Frio interesses»") — fallback usa entity_name do dry-run. */
  label?: string;
  // Campos de audit (passados tal e qual à edge fn):
  diagnosis_id?: string | null;
  applied_action_index?: number;
  triggered_by?: "user_manual" | "cron_auto" | "ai_suggestion";
  reason_text?: string | null;
  measure_impact_requested?: boolean;
};

export type ConfirmMetaActionOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
};

type DryRunResult = {
  ok: boolean;
  dry_run?: boolean;
  entity_type?: string;
  external_id?: string;
  entity_name?: string | null;
  action?: string;
  action_kind?: string;
  before?: any;
  after?: any;
  blocked?: boolean;
  block_reason?: string | null;
  cap_eur?: number | null;
  attempted_eur?: number | null;
  error?: string;
  detail?: string;
  message?: string;
};

type Row = {
  request: PendingMetaAction;
  loading: boolean;
  dry?: DryRunResult | null;
  error?: string | null;
};

type CtxValue = {
  confirm: (
    actions: PendingMetaAction[],
    opts?: ConfirmMetaActionOptions,
  ) => Promise<{ ok: number; fail: number; aborted: boolean }>;
};

const Ctx = createContext<CtxValue | null>(null);

export function useConfirmMetaAction() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfirmMetaAction tem de estar dentro de <ConfirmMetaActionProvider>");
  return v;
}

// ── Provider ────────────────────────────────────────────────────────────────
export function ConfirmMetaActionProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmMetaActionOptions>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const resolverRef = useRef<((r: { ok: number; fail: number; aborted: boolean }) => void) | null>(null);

  const runDryRuns = useCallback(async (actions: PendingMetaAction[]) => {
    setRows(actions.map((a) => ({ request: a, loading: true, dry: null, error: null })));
    const results = await Promise.all(
      actions.map(async (a): Promise<Row> => {
        try {
          const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
            body: { ...a, dry_run: true },
          });
          if (error) {
            // Tenta extrair detalhe do body.
            let detail = error.message;
            const ctx = (error as any).context;
            if (ctx) {
              try {
                const b = await (ctx.clone ? ctx.clone() : ctx).json();
                detail = b?.detail || b?.message || b?.error || detail;
              } catch {/* noop */}
            }
            return { request: a, loading: false, dry: null, error: detail };
          }
          return { request: a, loading: false, dry: data as DryRunResult, error: null };
        } catch (e: any) {
          return { request: a, loading: false, dry: null, error: e?.message ?? String(e) };
        }
      }),
    );
    setRows(results);
  }, []);

  const confirm = useCallback<CtxValue["confirm"]>((actions, options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpts(options ?? {});
      setOpen(true);
      void runDryRuns(actions);
    });
  }, [runDryRuns]);

  function close(aborted: boolean, result?: { ok: number; fail: number }) {
    const out = { ok: result?.ok ?? 0, fail: result?.fail ?? 0, aborted };
    setOpen(false);
    setApplying(false);
    setRows([]);
    if (resolverRef.current) {
      resolverRef.current(out);
      resolverRef.current = null;
    }
  }

  async function apply() {
    const executable = rows.filter((r) => r.dry && !r.dry.blocked && !r.error);
    if (executable.length === 0) {
      toast.error("Nada para aplicar — tudo bloqueado ou em erro.");
      return;
    }
    setApplying(true);
    let okCount = 0;
    let failCount = 0;
    for (const r of executable) {
      try {
        const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
          body: { ...r.request, dry_run: false },
        });
        if (error) {
          let detail = error.message;
          const ctx = (error as any).context;
          if (ctx) {
            try {
              const b = await (ctx.clone ? ctx.clone() : ctx).json();
              detail = b?.detail || b?.message || b?.error || detail;
            } catch {/* noop */}
          }
          throw new Error(detail);
        }
        if ((data as any)?.ok === false) {
          throw new Error((data as any)?.detail ?? (data as any)?.error ?? "Falha");
        }
        okCount++;
      } catch (e: any) {
        failCount++;
        toast.error(`Falha: ${r.dry?.entity_name ?? r.request.label ?? r.request.external_id}`, {
          description: e?.message ?? String(e),
        });
      }
    }
    if (okCount > 0) toast.success(`${okCount} acção(ões) aplicada(s) no Meta`);
    close(false, { ok: okCount, fail: failCount });
  }

  const anyLoading = rows.some((r) => r.loading);
  const anyExecutable = rows.some((r) => r.dry && !r.dry.blocked && !r.error);

  const value = useMemo<CtxValue>(() => ({ confirm }), [confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v && !applying) close(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Confirmar acção no Meta"}</DialogTitle>
            <DialogDescription>
              {opts.description ?? "Revê o impacto antes de aplicar. Esta operação escreve directamente no Meta."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto space-y-2 py-1">
            {rows.length === 0 && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> A validar acções…
              </div>
            )}
            {rows.map((r, i) => (
              <RowItem key={i} row={r} />
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(true)} disabled={applying}>
              Cancelar
            </Button>
            <Button
              onClick={apply}
              disabled={applying || anyLoading || !anyExecutable}
              variant="default"
            >
              {applying && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {opts.confirmLabel ?? "Confirmar e aplicar no Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

// ── Row renderer ────────────────────────────────────────────────────────────
function RowItem({ row }: { row: Row }) {
  const { request, loading, dry, error } = row;
  const label = request.label ?? dry?.entity_name ?? request.external_id;

  if (loading) {
    return (
      <div className="rounded-md border p-2 text-xs flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-muted-foreground">A validar “{label}”…</span>
      </div>
    );
  }
  if (error || !dry) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-destructive">
          <XCircle className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-destructive/80 mt-0.5">{error ?? "Sem resposta"}</div>
      </div>
    );
  }

  const blocked = dry.blocked === true;
  const kind = dry.action_kind ?? dry.action ?? request.action;
  const summary = describeImpact(dry, request);

  return (
    <div
      className={[
        "rounded-md border p-2 text-xs",
        blocked ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/30",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium flex items-center gap-1.5">
          {blocked ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          <span className="truncate">{label}</span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {request.entity_type}
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {kind}
          </Badge>
        </div>
        {blocked && (
          <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
            BLOQUEADO
          </Badge>
        )}
      </div>
      <div className="mt-1 text-foreground/90">{summary}</div>
      {blocked && dry.block_reason === "budget_cap_exceeded" && (
        <div className="mt-1 text-destructive">
          Excede limite: €{dry.attempted_eur?.toFixed(2)} &gt; €{dry.cap_eur?.toFixed(2)}/dia.
        </div>
      )}
      {blocked && dry.block_reason === "no_budget_authority" && (
        <div className="mt-1 text-destructive">
          Sem autoridade para alterar verba.
        </div>
      )}
    </div>
  );
}

function fmtMoneyCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents as number)) return "—";
  return `€${(Number(cents) / 100).toFixed(2)}`;
}

function describeImpact(dry: DryRunResult, req: PendingMetaAction): string {
  const kind = dry.action_kind ?? dry.action ?? req.action;
  const b = dry.before ?? {};
  const a = dry.after ?? {};
  if (kind === "pause") return `Pausar — status ${b.status ?? "?"} → PAUSED`;
  if (kind === "activate") return `Activar — status ${b.status ?? "?"} → ACTIVE (vai começar a gastar)`;
  if (kind === "budget") {
    const beforeC = b.daily_budget_cents ?? b.lifetime_budget_cents;
    const afterC = a.daily_budget_cents ?? a.lifetime_budget_cents;
    let delta = "";
    if (typeof beforeC === "number" && typeof afterC === "number" && beforeC > 0) {
      const pct = ((afterC - beforeC) / beforeC) * 100;
      const sign = pct >= 0 ? "+" : "";
      delta = ` (${sign}${pct.toFixed(1)}%)`;
    }
    return `Verba ${fmtMoneyCents(beforeC)} → ${fmtMoneyCents(afterC)}${delta}`;
  }
  if (kind === "name") return `Nome “${b.name ?? "?"}” → “${a.name ?? "?"}”`;
  if (kind === "bid") return `Estratégia/ROAS floor → ${a.bid_strategy ?? "?"}`;
  if (kind === "end_time") return `Definir end_time`;
  return `Acção: ${kind}`;
}
