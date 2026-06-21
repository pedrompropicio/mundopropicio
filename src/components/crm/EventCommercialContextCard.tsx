import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  History,
  ChevronDown,
  Loader2,
  Save,
  AlertCircle,
} from "lucide-react";

// Tipos
interface CommercialContext {
  id: string;
  company_id: string;
  event_id: string;
  lote_atual: string | null;
  virada_iminente: boolean;
  virada_data: string | null;
  preco_atual: number | null;
  moeda: string | null;
  angulo_fase: string | null;
  notas: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface LogEntry {
  id: string;
  changed_by: string | null;
  changed_at: string;
  old_state: any;
  new_state: any;
}

interface Props {
  eventId: string | null;
  companyId: string | null;
}

const HISTORY_LIMIT = 10;

export function EventCommercialContextCard({ eventId, companyId }: Props) {
  const qc = useQueryClient();

  // Estado vazio: sem evento ligado
  if (!eventId) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Contexto Comercial do Evento
        </h2>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
          <p>
            Campanha sem evento associado — associe um evento para definir o contexto comercial.
          </p>
        </div>
      </Card>
    );
  }

  if (!companyId) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Contexto Comercial do Evento
        </h2>
        <p className="text-sm text-muted-foreground">A carregar empresa…</p>
      </Card>
    );
  }

  // Estado actual
  const { data: ctx, isLoading: loadingCtx } = useQuery({
    queryKey: ["event-commercial-context", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("event_commercial_context")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as CommercialContext | null;
    },
  });

  // Histórico
  const { data: history } = useQuery({
    queryKey: ["event-commercial-context-log", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("event_commercial_context_log")
        .select("id, changed_by, changed_at, old_state, new_state")
        .eq("event_id", eventId)
        .order("changed_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return (data ?? []) as LogEntry[];
    },
  });

  // Form state
  const [loteAtual, setLoteAtual] = useState("");
  const [viradaIminente, setViradaIminente] = useState(false);
  const [viradaData, setViradaData] = useState("");
  const [precoAtual, setPrecoAtual] = useState("");
  const [moeda, setMoeda] = useState("EUR");
  const [anguloFase, setAnguloFase] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (ctx) {
      setLoteAtual(ctx.lote_atual ?? "");
      setViradaIminente(ctx.virada_iminente);
      setViradaData(ctx.virada_data ?? "");
      setPrecoAtual(ctx.preco_atual != null ? String(ctx.preco_atual) : "");
      setMoeda(ctx.moeda ?? "EUR");
      setAnguloFase(ctx.angulo_fase ?? "");
      setNotas(ctx.notas ?? "");
    }
  }, [ctx?.id, ctx?.updated_at]);

  const dirty = useMemo(() => {
    if (!ctx) {
      return (
        loteAtual !== "" || viradaIminente || viradaData !== "" ||
        precoAtual !== "" || (moeda !== "EUR" && moeda !== "") ||
        anguloFase !== "" || notas !== ""
      );
    }
    return (
      (ctx.lote_atual ?? "") !== loteAtual ||
      ctx.virada_iminente !== viradaIminente ||
      (ctx.virada_data ?? "") !== viradaData ||
      (ctx.preco_atual != null ? String(ctx.preco_atual) : "") !== precoAtual ||
      (ctx.moeda ?? "EUR") !== (moeda || "EUR") ||
      (ctx.angulo_fase ?? "") !== anguloFase ||
      (ctx.notas ?? "") !== notas
    );
  }, [ctx, loteAtual, viradaIminente, viradaData, precoAtual, moeda, anguloFase, notas]);

  async function handleSave() {
    if (!eventId || !companyId) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      const payload = {
        company_id: companyId,
        event_id: eventId,
        lote_atual: loteAtual.trim() || null,
        virada_iminente: viradaIminente,
        virada_data: viradaIminente && viradaData ? viradaData : null,
        preco_atual: precoAtual ? Number(precoAtual) : null,
        moeda: moeda.trim().toUpperCase() || null,
        angulo_fase: anguloFase.trim() || null,
        notas: notas.trim() || null,
        updated_by: userId,
      };

      const { error } = await (supabase as any)
        .schema("crm")
        .from("event_commercial_context")
        .upsert(payload, { onConflict: "event_id" });

      if (error) throw error;
      toast.success("Contexto comercial guardado.");
      qc.invalidateQueries({ queryKey: ["event-commercial-context", eventId] });
      qc.invalidateQueries({ queryKey: ["event-commercial-context-log", eventId] });
    } catch (e: any) {
      toast.error(`Erro ao guardar: ${e?.message ?? "desconhecido"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Contexto Comercial do Evento
        </h2>
        {ctx?.updated_at && (
          <span className="text-[11px] text-muted-foreground">
            Última actualização {formatDistanceToNow(new Date(ctx.updated_at), { addSuffix: true, locale: pt })}
          </span>
        )}
      </div>

      {loadingCtx ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="lote_atual">Lote actual</Label>
            <Input
              id="lote_atual"
              value={loteAtual}
              onChange={(e) => setLoteAtual(e.target.value)}
              placeholder='ex.: "Lote 2 de 3"'
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preco_atual">Preço actual</Label>
            <div className="flex gap-2">
              <Input
                id="preco_atual"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={precoAtual}
                onChange={(e) => setPrecoAtual(e.target.value)}
                placeholder="ex.: 25.00"
                className="flex-1"
              />
              <Input
                aria-label="Moeda"
                value={moeda}
                onChange={(e) => setMoeda(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="EUR"
                className="w-20"
              />
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="virada_iminente" className="cursor-pointer">
                Virada de lote iminente
              </Label>
              <Switch
                id="virada_iminente"
                checked={viradaIminente}
                onCheckedChange={(v) => {
                  setViradaIminente(v);
                  if (!v) setViradaData("");
                }}
              />
            </div>
            {viradaIminente && (
              <div className="pt-2">
                <Label htmlFor="virada_data" className="text-xs text-muted-foreground">
                  Data da próxima virada
                </Label>
                <Input
                  id="virada_data"
                  type="date"
                  value={viradaData}
                  onChange={(e) => setViradaData(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="angulo_fase">Ângulo da fase</Label>
            <Input
              id="angulo_fase"
              value={anguloFase}
              onChange={(e) => setAnguloFase(e.target.value)}
              placeholder='ex.: "esgotamento gradual, sem urgência de data"'
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Contexto livre…"
              rows={3}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> A guardar…</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Guardar</>
          )}
        </Button>
      </div>

      {/* Histórico */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-1 border-t border-border/50 pt-3"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico ({history?.length ?? 0})
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {!history || history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem alterações registadas.</p>
          ) : (
            <ol className="space-y-2">
              {history.map((h) => {
                const diffs = computeDiffs(h.old_state, h.new_state);
                return (
                  <li key={h.id} className="text-xs border-l-2 border-border/60 pl-3 py-1">
                    <div className="text-muted-foreground">
                      {format(new Date(h.changed_at), "dd MMM yyyy HH:mm", { locale: pt })}
                      {h.changed_by ? <> · <span className="font-mono text-[10px]">{h.changed_by.slice(0, 8)}</span></> : null}
                      {!h.old_state && (
                        <Badge variant="outline" className="ml-2 text-[9px]">criação</Badge>
                      )}
                    </div>
                    {diffs.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {diffs.map((d) => (
                          <li key={d.field} className="text-foreground/80">
                            <span className="text-muted-foreground">{d.field}:</span>{" "}
                            <span className="line-through text-muted-foreground/70">{d.from}</span>{" "}
                            → <span className="font-medium">{d.to}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

const TRACKED_FIELDS = [
  "lote_atual",
  "virada_iminente",
  "virada_data",
  "preco_atual",
  "moeda",
  "angulo_fase",
  "notas",
] as const;

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function computeDiffs(oldState: any, newState: any) {
  const diffs: { field: string; from: string; to: string }[] = [];
  for (const f of TRACKED_FIELDS) {
    const o = oldState?.[f];
    const n = newState?.[f];
    if ((o ?? null) !== (n ?? null)) {
      diffs.push({ field: f, from: fmt(o), to: fmt(n) });
    }
  }
  return diffs;
}
