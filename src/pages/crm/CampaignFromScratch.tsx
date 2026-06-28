// CampaignFromScratch — sub-tarefa 8, Fase 3 (Parte 1 de 2).
// Formulário único + resultado na mesma página. Geração single-model via
// edge function crm-meta-campaign-from-scratch. PT-PT. Padrão visual MP Audience
// (cyan-500). A Parte 2 (duelo from-scratch) NÃO está aqui.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import StrategyPlanCard from "@/components/crm/StrategyPlanCard";

type SourceMode = "from_scratch_ref" | "from_scratch_blank";
type EventPick = "existing" | "manual";
type CampaignMoment = "lancamento" | "escassez" | "funil_completo" | "reta_final";

const MOMENT_OPTIONS: Array<{ value: CampaignMoment; label: string; desc: string }> = [
  { value: "lancamento", label: "Lançamento (1º lote)", desc: "Evento acabou de abrir. Funil curto: anunciar + começar a vender." },
  { value: "escassez", label: "Escassez (virada de lote)", desc: "Lote a esgotar, preço sobe. Conversão + retargeting com urgência; lookalike frio até 20%." },
  { value: "funil_completo", label: "Funil completo (padrão)", desc: "Awareness → consideração → conversão → retargeting. Comportamento clássico." },
  { value: "reta_final", label: "Reta final", desc: "Últimos dias. Sem prospeção fria; só conversão + retargeting pesado." },
];


interface EventRow {
  id: string;
  name: string;
  date: string | null;
}

interface ConnectionRow {
  id: string;
  status: string;
  platform: string;
  selected_ad_account_id: string | null;
  selected_ad_account_name?: string | null;
  selected_ad_account_currency?: string | null;
}

interface SnapshotRow {
  external_campaign_id: string;
  name: string | null;
  ad_account_id: string | null;
}

interface GenerationResult {
  strategy_id?: string;
  generated_plan: any;
  anchored_numbers?: any;
}

const MODEL = "google/gemini-2.5-flash";

function feasibilityNote(f: string | undefined | null): string | null {
  if (f === "impossible") {
    return "A meta de ROAS está acima do que a referência sustenta historicamente. Considera reduzir a meta ou rever a referência.";
  }
  if (f === "stretch") {
    return "A meta está um pouco acima do ROAS da referência — é ambiciosa mas não impossível. Espera precisar de otimização.";
  }
  if (f === "starting_structure") {
    return "Sem histórico para projetar: este plano é uma estrutura de arranque. Os números são metas, não projeções.";
  }
  return null;
}

export default function CampaignFromScratch() {
  const navigate = useNavigate();
  const { companyId } = useCompany();

  // ── Form state ───────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<SourceMode>("from_scratch_ref");
  const [eventPick, setEventPick] = useState<EventPick>("existing");
  const [campaignMoment, setCampaignMoment] = useState<CampaignMoment>("funil_completo");

  const [eventId, setEventId] = useState<string>("");

  const [emName, setEmName] = useState("");
  const [emDate, setEmDate] = useState("");
  const [emLocation, setEmLocation] = useState("");
  const [emTickets, setEmTickets] = useState<string>("");
  const [emGoal, setEmGoal] = useState<string>("");

  const [referenceCampaignId, setReferenceCampaignId] = useState<string>("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [targetRoas, setTargetRoas] = useState<string>("8");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [countriesRaw, setCountriesRaw] = useState<string>("PT");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // ── Eventos ──────────────────────────────────────────────────
  const eventsQ = useQuery({
    queryKey: ["from-scratch-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date")
        .order("date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  // ── Conexões Meta ativas ─────────────────────────────────────
  const connectionsQ = useQuery({
    queryKey: ["from-scratch-meta-connections", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, status, platform, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency")
        .eq("platform", "meta")
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
  });

  // Auto-seleciona se houver apenas 1 conexão
  useEffect(() => {
    const arr = connectionsQ.data ?? [];
    if (!connectionId && arr.length === 1) setConnectionId(arr[0].id);
  }, [connectionsQ.data, connectionId]);

  const selectedConn = useMemo(
    () => (connectionsQ.data ?? []).find((c) => c.id === connectionId) ?? null,
    [connectionsQ.data, connectionId],
  );

  // ── Snapshots (referências) — filtrados pelo ad account da conexão ─
  const snapshotsQ = useQuery({
    queryKey: ["from-scratch-snapshots", selectedConn?.selected_ad_account_id],
    enabled: sourceMode === "from_scratch_ref" && !!selectedConn?.selected_ad_account_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("external_campaign_id, name, ad_account_id")
        .eq("ad_account_id", selectedConn!.selected_ad_account_id)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SnapshotRow[];
    },
  });

  // ── Validação ────────────────────────────────────────────────
  function validate(): string | null {
    if (!connectionId && (connectionsQ.data?.length ?? 0) > 1) {
      return "Escolhe uma conexão Meta.";
    }
    if (!connectionId && (connectionsQ.data?.length ?? 0) === 0) {
      return "Não há conexões Meta ativas. Cria uma em Conexões.";
    }
    if (eventPick === "existing" && !eventId) return "Escolhe um evento.";
    if (eventPick === "manual") {
      if (!emName.trim()) return "Nome do evento é obrigatório.";
      if (!emDate) return "Data do evento é obrigatória.";
    }
    if (sourceMode === "from_scratch_ref" && !referenceCampaignId) {
      return "Escolhe uma campanha de referência.";
    }
    const tr = Number(targetRoas);
    if (!Number.isFinite(tr) || tr <= 0) return "Meta de ROAS tem de ser > 0.";
    return null;
  }

  // ── Submit ───────────────────────────────────────────────────
  async function handleSubmit() {
    const err = validate();
    if (err) { toast.error(err); return; }

    const countries = countriesRaw
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const body: any = {
      source_mode: sourceMode,
      target_roas: Number(targetRoas),
      country_codes: countries.length ? countries : ["PT"],
      model: MODEL,
      dry_run: false,
      campaign_moment: campaignMoment,
    };

    if (connectionId) body.connection_id = connectionId;
    if (totalBudget.trim()) body.total_budget_eur = Number(totalBudget);
    if (sourceMode === "from_scratch_ref") body.reference_campaign_id = referenceCampaignId;

    if (eventPick === "existing") {
      body.event_id = eventId;
    } else {
      body.event_manual = {
        name: emName.trim(),
        date: emDate,
        location: emLocation.trim() || null,
        tickets_total: emTickets.trim() ? Number(emTickets) : null,
        goal_revenue_eur: emGoal.trim() ? Number(emGoal) : null,
      };
    }

    setSubmitting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-meta-campaign-from-scratch",
        { body },
      );
      if (error) {
        let detail = error.message;
        let parsed: any = null;
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            parsed = b;
            detail = b?.detail || b?.message || b?.error || detail;
          } catch {}
        }
        if (parsed?.error === "multiple_meta_connections") {
          toast.error("Várias conexões Meta — escolhe uma no campo \"Conexão Meta\".");
        } else {
          toast.error("Falha ao gerar plano", { description: detail });
        }
        return;
      }
      const r = data as GenerationResult;
      if (!r?.generated_plan) {
        toast.error("Resposta sem plano gerado");
        return;
      }
      setResult(r);
      toast.success("Plano gerado");
    } catch (e: any) {
      toast.error("Erro inesperado", { description: e?.message ?? String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────
  const conns = connectionsQ.data ?? [];
  const showConnectionPicker = conns.length > 1;
  const an = result?.anchored_numbers;
  const feasibility: string | undefined = result?.generated_plan?.summary?.feasibility;
  const note = feasibilityNote(feasibility);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cyan-400" />
          Criar campanha do zero
        </h1>
        <p className="text-sm text-muted-foreground">
          Desenha um plano de campanha para um evento — com referência histórica ou sem.
          O modelo só escreve linguagem; os números são ancorados em dados reais.
        </p>
      </div>

      {/* ── FORMULÁRIO ── */}
      <Card className="p-5 space-y-6 border-cyan-500/20">
        {/* Modo */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Modo</Label>
          <RadioGroup
            value={sourceMode}
            onValueChange={(v) => setSourceMode(v as SourceMode)}
            className="flex flex-col sm:flex-row gap-3"
          >
            <label className="flex items-start gap-2 rounded-md border border-border p-3 flex-1 cursor-pointer hover:border-cyan-500/40">
              <RadioGroupItem value="from_scratch_ref" id="m-ref" />
              <div>
                <div className="text-sm font-medium">Com referência</div>
                <div className="text-xs text-muted-foreground">
                  Ancora ROAS e estrutura numa campanha real anterior.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-border p-3 flex-1 cursor-pointer hover:border-cyan-500/40">
              <RadioGroupItem value="from_scratch_blank" id="m-blank" />
              <div>
                <div className="text-sm font-medium">Sem referência / evento novo</div>
                <div className="text-xs text-muted-foreground">
                  Estrutura de arranque. Sem projeção; a meta é tua.
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Evento */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Evento</Label>
          <RadioGroup
            value={eventPick}
            onValueChange={(v) => setEventPick(v as EventPick)}
            className="flex gap-3"
          >
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <RadioGroupItem value="existing" id="ev-existing" />
              Evento existente
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <RadioGroupItem value="manual" id="ev-manual" />
              À mão
            </label>
          </RadioGroup>

          {eventPick === "existing" ? (
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder={eventsQ.isLoading ? "A carregar…" : "Escolhe um evento"} />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {(eventsQ.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.date ? ` — ${e.date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input value={emName} onChange={(e) => setEmName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={emDate} onChange={(e) => setEmDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Local</Label>
                <Input value={emLocation} onChange={(e) => setEmLocation(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Bilhetes (total)</Label>
                <Input type="number" min="0" value={emTickets} onChange={(e) => setEmTickets(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Receita objetivo (€)</Label>
                <Input type="number" min="0" step="0.01" value={emGoal} onChange={(e) => setEmGoal(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Momento da campanha */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Momento da campanha</Label>
          <Select value={campaignMoment} onValueChange={(v) => setCampaignMoment(v as CampaignMoment)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {MOMENT_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-[11px] text-muted-foreground">{m.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Decide a forma do plano (que fases entram, com que tom). Não muda o ROAS projetado nem o anchoring.
          </p>
        </div>

        {/* Conexão Meta */}

        {showConnectionPicker && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Conexão Meta</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolhe a conexão" />
              </SelectTrigger>
              <SelectContent>
                {conns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.selected_ad_account_name ?? c.selected_ad_account_id ?? "Ad account ?"}
                    {c.selected_ad_account_currency ? ` · ${c.selected_ad_account_currency}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!showConnectionPicker && selectedConn && (
          <div className="text-xs text-muted-foreground">
            Conexão Meta: <span className="text-foreground">{selectedConn.selected_ad_account_name ?? selectedConn.selected_ad_account_id}</span>
          </div>
        )}

        {/* Referência (só com_ref) */}
        {sourceMode === "from_scratch_ref" && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Campanha de referência</Label>
            <Select
              value={referenceCampaignId}
              onValueChange={setReferenceCampaignId}
              disabled={!selectedConn?.selected_ad_account_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !selectedConn?.selected_ad_account_id
                    ? "Escolhe primeiro a conexão"
                    : snapshotsQ.isLoading ? "A carregar…" : "Escolhe uma referência"
                } />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {(snapshotsQ.data ?? []).map((s) => (
                  <SelectItem key={s.external_campaign_id} value={s.external_campaign_id}>
                    {s.name ?? "(sem nome)"} — {s.external_campaign_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Meta de ROAS / budget / países */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Meta de ROAS *</Label>
            <Input
              type="number" min="0.1" step="0.1"
              value={targetRoas}
              onChange={(e) => setTargetRoas(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">A tua meta de negócio.</p>
          </div>
          <div>
            <Label className="text-xs">Budget total (€)</Label>
            <Input
              type="number" min="0" step="1"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div>
            <Label className="text-xs">Países (ISO2)</Label>
            <Input
              value={countriesRaw}
              onChange={(e) => setCountriesRaw(e.target.value)}
              placeholder="PT, BR"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Separa por vírgula.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> A desenhar a campanha…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Gerar plano</>
            )}
          </Button>
          {submitting && (
            <span className="text-xs text-muted-foreground">
              Isto pode demorar até 1 minuto.
            </span>
          )}
        </div>
      </Card>

      {/* ── RESULTADO ── */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Plano gerado</h2>
            {result.strategy_id && (
              <Button
                variant="outline"
                onClick={() => navigate(`/audience/strategies/${result.strategy_id}`)}
              >
                Ver estratégia gravada <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>

          {/* Anchored numbers + nota explicativa */}
          {an && (
            <Card className="p-4 border-cyan-500/30 bg-cyan-500/[0.04] space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Números ancorados
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {an.expected_overall_roas != null && (
                  <Badge variant="outline">
                    ROAS ancorado: {Number(an.expected_overall_roas).toFixed(2)}x
                  </Badge>
                )}
                {feasibility && (
                  <Badge variant="outline">Viabilidade: {feasibility}</Badge>
                )}
                {an.reference_roas != null && (
                  <Badge variant="outline">
                    ROAS referência: {Number(an.reference_roas).toFixed(2)}x
                  </Badge>
                )}
              </div>
              {note && (
                <div className="flex items-start gap-2 text-xs text-amber-200/90 pt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                  <span>{note}</span>
                </div>
              )}
            </Card>
          )}

          <StrategyPlanCard plan={result.generated_plan} />
        </div>
      )}
    </div>
  );
}
