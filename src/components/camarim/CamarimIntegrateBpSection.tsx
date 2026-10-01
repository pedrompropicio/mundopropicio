/**
 * D16 + DR-2026-09-02-D2 — linha de BP e excesso DENTRO do modal
 * "Integrar sessão no sistema financeiro".
 *
 * Substitui os diálogos encadeados (LinkBpLineDialog / RaiseBudgetDialog) que
 * abriam ATRÁS do AlertDialog (z-[200] vs Dialog z-50) e deixavam só o fundo
 * escuro visível. Tudo é resolvido no mesmo ecrã; os Selects daqui usam
 * z-[210] para ficarem acima do AlertDialog (escada de z-index).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/camarim-helpers";
import { computeBpFit, lineLabel, proposeBpLine, round2, type CamarimBpLine } from "@/lib/camarim-integrate";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export interface CamarimBpSelection {
  forecastId: string | null;
  budgetRaise: { new_amount: number; observation: string } | null;
  /** null = pronto; string = motivo pelo qual o botão fica desativado. */
  blockReason: string | null;
}

interface Props {
  eventId: string;
  eventName: string;
  categoryId: string;
  sessionBase: number;
  currency: string;
  canRaise: boolean;
  /** Mínimo imposto pelo servidor (422 budget_excess), se for maior que o calculado aqui. */
  serverSuggested?: { forecastId: string; amount: number } | null;
  onChange: (s: CamarimBpSelection) => void;
}

export function CamarimIntegrateBpSection({
  eventId, eventName, categoryId, sessionBase, currency, canRaise, serverSuggested, onChange,
}: Props) {
  const { data: lines = [], isLoading, error } = useQuery({
    queryKey: ["camarim-integrate-bp-lines", eventId, categoryId],
    queryFn: async (): Promise<CamarimBpLine[]> => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select("id, description, specification, amount, status")
        .eq("event_id", eventId)
        .eq("category_id", categoryId)
        .eq("type", "expense")
        .is("version_id", null)
        .order("description"));
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = rows.map((r) => r.id);
      const realized = new Map<string, number>();
      if (ids.length > 0) {
        const { data: tx, error: txErr } = await fetchAllPagedQuery(supabase
          .from("transactions")
          .select("forecast_id, amount, is_transitory, exclude_from_result, reversed_at, is_hidden")
          .in("forecast_id", ids)
          .in("status", ["approved", "paid"]));
        if (txErr) throw txErr;
        ((tx ?? []) as any[])
          .filter((r) => r.is_transitory !== true && r.exclude_from_result !== true && r.reversed_at == null && r.is_hidden !== true)
          .forEach((r) => realized.set(r.forecast_id, (realized.get(r.forecast_id) ?? 0) + Number(r.amount ?? 0)));
      }
      return rows.map((r) => ({
        id: r.id,
        description: r.description,
        specification: r.specification,
        amount: Number(r.amount ?? 0),
        status: r.status ?? null,
        realized: round2(realized.get(r.id) ?? 0),
      }));
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newAmount, setNewAmount] = useState("");
  const [observation, setObservation] = useState("");

  useEffect(() => {
    if (!selectedId && lines.length > 0) setSelectedId(proposeBpLine(lines));
  }, [lines, selectedId]);

  const selected = lines.find((l) => l.id === selectedId) ?? null;
  const fit = useMemo(() => (selected ? computeBpFit(selected, sessionBase) : null), [selected, sessionBase]);
  const minAmount = useMemo(() => {
    if (!fit) return 0;
    const srv = serverSuggested && serverSuggested.forecastId === selectedId ? serverSuggested.amount : 0;
    return round2(Math.max(fit.suggestedAmount, srv));
  }, [fit, serverSuggested, selectedId]);
  const needsRaise = !!fit && (!fit.fits || minAmount > fit.previsto);

  // Pré-preenche o valor mínimo quando a linha/mínimo muda.
  useEffect(() => {
    if (needsRaise) setNewAmount(minAmount.toFixed(2));
  }, [needsRaise, minAmount]);

  useEffect(() => {
    let blockReason: string | null = null;
    let budgetRaise: CamarimBpSelection["budgetRaise"] = null;
    if (isLoading) blockReason = "A carregar as linhas de BP…";
    else if (error) blockReason = `Não foi possível ler as linhas de BP: ${(error as any).message ?? error}`;
    else if (lines.length === 0) blockReason = "O evento não tem nenhuma linha de BP 2.6.04 — Camarins. Cria a linha no BP antes de integrar.";
    else if (!selected) blockReason = "Escolhe a linha de BP da sessão.";
    else if (needsRaise) {
      const v = round2(Number(String(newAmount).replace(",", ".")));
      if (!canRaise) blockReason = "Precisa de alguém com permissão para elevar verbas de BP — pede ao Pedro.";
      else if (!Number.isFinite(v) || v < minAmount) blockReason = `A nova verba tem de ser pelo menos ${formatCurrency(minAmount, currency)}.`;
      else if (!observation.trim()) blockReason = "Escreve a observação obrigatória para elevar a verba.";
      else budgetRaise = { new_amount: v, observation: observation.trim() };
    }
    onChange({ forecastId: selected?.id ?? null, budgetRaise, blockReason });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error, lines.length, selected?.id, needsRaise, newAmount, observation, canRaise, minAmount]);

  return (
    <div className="space-y-3 rounded-md border border-border p-3" data-testid="camarim-bp-section">
      <div>
        <Label className="text-xs font-semibold">Linha de BP (2.6.04 — Camarins) · {eventName}</Label>
        <p className="text-[11px] text-muted-foreground">Uma sessão, uma linha de BP: todas as transações da sessão nascem nesta linha.</p>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">A carregar linhas…</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-destructive">Sem linhas 2.6.04 neste evento. Cria a linha no BP do evento e volta a abrir este ecrã.</p>
      ) : (
        <Select value={selectedId ?? undefined} onValueChange={(v) => { setSelectedId(v); setObservation(""); }}>
          <SelectTrigger className="h-9" aria-label="Linha de BP"><SelectValue placeholder="Escolher linha…" /></SelectTrigger>
          <SelectContent className="z-[210]">
            {lines.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {lineLabel(l)} — disp. {formatCurrency(round2(l.amount - l.realized), currency)}
                {l.status && l.status !== "approved" ? ` (${l.status})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {fit && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ["Previsto", fit.previsto],
            ["Utilizado", fit.utilizado],
            ["Disponível", fit.disponivel],
            ["Esta sessão", fit.estaSessao],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-muted/30 p-2">
              <div className="text-muted-foreground">{k}</div>
              <div className="font-semibold tabular-nums">{formatCurrency(v as number, currency)}</div>
            </div>
          ))}
        </div>
      )}

      {fit && !needsRaise && (
        <p className="text-xs font-medium text-emerald-600" data-testid="bp-fits">Cabe na verba da linha.</p>
      )}

      {fit && needsRaise && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3" data-testid="bp-raise-block">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Excede a verba em {formatCurrency(round2(minAmount - fit.previsto), currency)} — Elevar a verba da linha
          </p>
          <p className="text-[11px] text-muted-foreground">
            Aprovar implica elevar a linha (DR-2026-09-02-D2). Mínimo: {formatCurrency(minAmount, currency)}. O previsto original não muda.
          </p>
          {!canRaise ? (
            <p className="text-xs font-medium text-destructive" data-testid="bp-no-permission">
              Precisa de alguém com permissão para elevar verbas de BP — pede ao Pedro.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
              <div>
                <Label className="text-[11px]">Nova verba</Label>
                <Input
                  aria-label="Nova verba"
                  inputMode="decimal"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className={cn("h-8", round2(Number(newAmount.replace(",", "."))) < minAmount && "border-destructive")}
                />
              </div>
              <div>
                <Label className="text-[11px]">Observação (obrigatória)</Label>
                <Textarea
                  aria-label="Observação"
                  rows={2}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Porque é que a linha precisa de mais verba"
                  className="text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
