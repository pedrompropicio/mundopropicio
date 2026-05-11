import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Brain, Loader2, ArrowLeft, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const COUNTRY_OPTIONS = [
  { code: "PT", label: "Portugal" },
  { code: "BR", label: "Brasil" },
];

const LOADING_STEPS = [
  "A analisar evento…",
  "A buscar top performers…",
  "A consultar audiências…",
  "A pedir à IA…",
];

export default function CrmStrategyNew() {
  const navigate = useNavigate();
  const { active, isLoading: adAcctLoading } = useAdAccountSelection();

  const [name, setName] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [goalRevenue, setGoalRevenue] = useState<string>("");
  const [ticketAvg, setTicketAvg] = useState<string>("25");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [targetRoas, setTargetRoas] = useState<string>("4");
  const [countries, setCountries] = useState<string[]>(["PT", "BR"]);
  const [userNotes, setUserNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const { data: events } = useQuery({
    queryKey: ["events-future-for-strategies"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedEvent = useMemo(
    () => events?.find((e: any) => e.id === eventId) ?? null,
    [events, eventId],
  );

  const daysUntilEvent = useMemo(() => {
    if (!selectedEvent?.date) return null;
    const ms = new Date(selectedEvent.date).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 86400000));
  }, [selectedEvent]);

  const expectedPurchases = useMemo(() => {
    const g = parseFloat(goalRevenue);
    const t = parseFloat(ticketAvg);
    if (!g || !t || t <= 0) return null;
    return Math.ceil(g / t);
  }, [goalRevenue, ticketAvg]);

  const canSubmit =
    !!eventId &&
    !!parseFloat(goalRevenue) &&
    !!parseFloat(ticketAvg) &&
    !!active?.connection_id &&
    !!active?.ad_account_id &&
    !submitting;

  // rotate loading messages
  useEffect(() => {
    if (!submitting) return;
    setLoadingStep(0);
    const itv = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 4000);
    return () => clearInterval(itv);
  }, [submitting]);

  const toggleCountry = (code: string) => {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit || !active) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const payload = {
        event_id: eventId,
        connection_id: active.connection_id,
        ad_account_id: active.ad_account_id,
        goal_revenue_eur: parseFloat(goalRevenue),
        ticket_avg_eur: parseFloat(ticketAvg),
        total_budget_eur: totalBudget ? parseFloat(totalBudget) : undefined,
        target_roas: targetRoas ? parseFloat(targetRoas) : undefined,
        country_codes: countries.length ? countries : undefined,
        user_notes: userNotes || undefined,
        strategy_name: name || undefined,
      };

      const { data, error } = await supabase.functions.invoke(
        "crm-meta-campaign-strategy-generate",
        { body: payload },
      );

      if (error) {
        let detailedMsg = error.message ?? "Erro a invocar edge function";
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            if (typeof ctx.json === "function") {
              const cloned = ctx.clone ? ctx.clone() : ctx;
              const body = await cloned.json();
              const errCode = body?.error || "unknown";
              const errDetail = body?.message || body?.detail || "";
              const rawPrev = body?.raw_preview ? `\n\nGemini preview:\n${String(body.raw_preview).slice(0, 400)}` : "";
              detailedMsg = `[${errCode}]${errDetail ? "\n" + errDetail : ""}${rawPrev}`;
            } else if (typeof ctx.text === "function") {
              const cloned = ctx.clone ? ctx.clone() : ctx;
              const txt = await cloned.text();
              detailedMsg = `${detailedMsg}\n\nBody: ${txt.slice(0, 400)}`;
            }
          } catch {
            // ignore
          }
        }
        throw new Error(detailedMsg);
      }

      if ((data as any)?.error) {
        throw new Error(`[${(data as any).error}] ${(data as any).message || (data as any).detail || ""}`);
      }

      if (!(data as any)?.strategy_id) {
        throw new Error(`Resposta sem strategy_id: ${JSON.stringify(data).slice(0, 300)}`);
      }

      toast.success("Estratégia gerada!");
      navigate(`/audience/strategies/${(data as any).strategy_id}`);
    } catch (e: any) {
      const msg = e?.message ?? "Erro a gerar estratégia";
      setErrMsg(msg);
      toast.error("Erro ao gerar estratégia", { description: msg.slice(0, 200) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/audience/strategies")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <Brain className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Nova estratégia de campanha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A IA cria um plano completo por fases com base na meta, no contexto da ad account e no histórico Meta.
          </p>
        </div>
      </div>

      {!adAcctLoading && !active && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm">
          Não foi detetada uma ad account ativa. Configura uma em Conexões / Ad Accounts antes de gerar.
        </Card>
      )}

      <Card className="p-5 space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome da estratégia</Label>
          <Input
            id="name"
            placeholder={selectedEvent ? `Strategy ${selectedEvent.name}` : "(opcional — gerado automaticamente)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="event">Evento *</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger id="event">
              <SelectValue placeholder="Escolhe um evento futuro" />
            </SelectTrigger>
            <SelectContent>
              {events?.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} {e.date ? `· ${new Date(e.date).toLocaleDateString("pt-PT")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="goal">Meta de receita (€) *</Label>
            <Input id="goal" type="number" min={0} value={goalRevenue} onChange={(e) => setGoalRevenue(e.target.value)} placeholder="50000" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="avg">Ticket médio (€) *</Label>
            <Input id="avg" type="number" min={0} value={ticketAvg} onChange={(e) => setTicketAvg(e.target.value)} placeholder="25" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="budget">Verba total disponível (€)</Label>
            <Input id="budget" type="number" min={0} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} placeholder="calcular automaticamente" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="roas">ROAS alvo</Label>
            <Input id="roas" type="number" step="0.1" min={0} value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} placeholder="4" />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Países alvo</Label>
          <div className="flex flex-wrap gap-4">
            {COUNTRY_OPTIONS.map((c) => (
              <label key={c.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={countries.includes(c.code)} onCheckedChange={() => toggleCountry(c.code)} />
                {c.label} ({c.code})
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">Notas adicionais</Label>
          <Textarea id="notes" rows={3} value={userNotes} onChange={(e) => setUserNotes(e.target.value)} placeholder="Contexto extra para a IA (ex: público VIP, restrição de criativos, etc.)" />
        </div>
      </Card>

      {selectedEvent && (
        <Card className="p-5 bg-cyan-500/[0.03] border-cyan-500/20">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <h3 className="font-medium">Pré-visualização do contexto</h3>
              <div className="text-muted-foreground">
                <span className="text-foreground font-medium">{selectedEvent.name}</span>
                {selectedEvent.date && <> · {new Date(selectedEvent.date).toLocaleDateString("pt-PT")}</>}
                {daysUntilEvent !== null && <> · {daysUntilEvent} dias até o evento</>}
              </div>
              {expectedPurchases !== null && (
                <div className="text-muted-foreground">
                  Vendas necessárias: <span className="text-foreground font-medium">{expectedPurchases} ingressos</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A estratégia será gerada com base em: top performers da ad account ({active?.display_label || "—"}),
                custom audiences disponíveis e interesses do artista detetado no nome do evento.
              </p>
            </div>
          </div>
        </Card>
      )}

      {errMsg && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          <pre className="whitespace-pre-wrap font-mono text-xs">{errMsg}</pre>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/audience/strategies")} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-cyan-500 hover:bg-cyan-600 text-white min-w-[260px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {LOADING_STEPS[loadingStep]} (15-30s)
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" /> Gerar estratégia com IA
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
