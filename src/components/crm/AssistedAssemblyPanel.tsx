// AssistedAssemblyPanel
// Camada 4 (PARTE 2) — UI da Montagem Assistida. Reutilizável nos fluxos de
// "Redesenhar campanha" e "Começar do zero". Abre em Sheet a tela cheia.
//
// PRINCÍPIO INVIOLÁVEL (P0):
//   - Todos os pesos (peso_pct) vêm exclusivamente do motor
//     (crm-assisted-assembly-compute). NUNCA recalculamos pesos no cliente.
//   - O LLM (crm-assisted-assembly-narrate) só escreve linguagem; nunca
//     produz números novos.
//   - Edições locais (remover adset / criativo) NÃO recalculam pesos: mostram
//     aviso e exigem "Voltar a montar" para reinvocar o motor.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, Check, Info, Loader2, Replace, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface AssistedAssemblyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | null;
  companyId: string | null;
  flow: "redesign" | "from_scratch";
  sourceCampaignId?: string | null;
  creativeIds: string[];
  /** Se passado, o painel CARREGA esta assembly da BD em vez de recomputar.
   *  Permite revisitar uma Síntese travada (ex.: ad98d128) e persistir
   *  aprovações/substituições/remoções directamente no registo. */
  initialAssemblyId?: string | null;
}

// Cor por tipo de gatilho — barra accent à esquerda do bloco de adset.
const TRIGGER_TYPE_ACCENT: Record<string, { bar: string; chip: string; label: string }> = {
  escassez: { bar: "bg-amber-500", chip: "bg-amber-500/10 text-amber-300 border-amber-500/40", label: "Escassez" },
  antecipacao: { bar: "bg-sky-500", chip: "bg-sky-500/10 text-sky-300 border-sky-500/40", label: "Antecipação" },
  narrativa: { bar: "bg-purple-500", chip: "bg-purple-500/10 text-purple-300 border-purple-500/40", label: "Narrativa" },
  calendario: { bar: "bg-slate-500", chip: "bg-slate-500/10 text-slate-300 border-slate-500/40", label: "Calendário" },
  generico: { bar: "bg-zinc-500", chip: "bg-zinc-500/10 text-zinc-300 border-zinc-500/40", label: "Genérico" },
};
const triggerAccent = (tipo: string) => TRIGGER_TYPE_ACCENT[tipo] ?? TRIGGER_TYPE_ACCENT.generico;

type AdsetOut = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  creative_ids: string[];
  /** Campo paralelo (extensão): subconjunto de creative_ids aprovados pelo Pedro.
   *  Camada 5 (crm-campaign-design-generate) NÃO lê este campo — fica retrocompatível. */
  approved_creative_ids?: string[];
  peso_pct: number;
  peso_origem: "roas" | "fallback_criativos" | "sintese_duelo" | string;
  roas_agregado: number | null;
  dias_dados: number;
  conversoes: number;
  fiavel: boolean;
  // Campos de extensão (Síntese do duelo)
  arquetipo?: string;
  funil?: string;
  orcamento_dia_eur?: number;
  interesses?: string[];
  gatilhos_extra?: string[];
};

type ExcluidoContradiz = { creative_id: string; name?: string | null };

type Narrativa = { trigger_id: string | null; trigger_nome: string; texto: string };

type CreativeMini = { id: string; name: string | null; thumbnail_url?: string | null };

export function AssistedAssemblyPanel({
  open, onOpenChange, eventId, companyId, flow, sourceCampaignId, creativeIds,
  initialAssemblyId,
}: AssistedAssemblyPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assemblyId, setAssemblyId] = useState<string | null>(null);
  const [adsets, setAdsets] = useState<AdsetOut[]>([]);
  const [excluidos, setExcluidos] = useState<ExcluidoContradiz[]>([]);
  const [narrativas, setNarrativas] = useState<Narrativa[]>([]);
  const [creativesById, setCreativesById] = useState<Map<string, CreativeMini>>(new Map());
  // Edição local — guarda IDs removidos para sinalizar "Montagem editada".
  const [removedAdsetKeys, setRemovedAdsetKeys] = useState<Set<string>>(new Set());
  const [removedCreativeIds, setRemovedCreativeIds] = useState<Set<string>>(new Set());
  // Catálogo de criativos da company (para o seletor de substituição).
  const [companyCreatives, setCompanyCreatives] = useState<CreativeMini[]>([]);
  // Indicador de gravação por par adset+slot.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const adsetKey = (a: AdsetOut) => `${a.trigger_id ?? "generic"}::${a.trigger_nome}`;
  const edited = removedAdsetKeys.size > 0 || removedCreativeIds.size > 0;

  // Reset state quando o Sheet fecha
  useEffect(() => {
    if (!open) {
      setAssemblyId(null); setAdsets([]); setExcluidos([]); setNarrativas([]);
      setRemovedAdsetKeys(new Set()); setRemovedCreativeIds(new Set());
      setError(null); setCompanyCreatives([]);
    }
  }, [open]);

  // Carrega catálogo de criativos da company (para Substituir)
  useEffect(() => {
    if (!open || !companyId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("id, name, thumbnail_url")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[assembly-panel] fetch company creatives failed", error);
        return;
      }
      setCompanyCreatives((data ?? []) as CreativeMini[]);
    })();
  }, [open, companyId]);

  // Carrega assembly existente quando initialAssemblyId é passada
  useEffect(() => {
    if (!open || !initialAssemblyId) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data, error } = await (supabase as any)
          .schema("crm")
          .from("assisted_assembly")
          .select("id, adsets, snapshot")
          .eq("id", initialAssemblyId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Assembly não encontrada");
        const _adsets: AdsetOut[] = (data.adsets ?? []) as AdsetOut[];
        const ids = new Set<string>();
        _adsets.forEach((a) => (a.creative_ids || []).forEach((id) => ids.add(id)));
        const names = await fetchCreativeNames([...ids]);
        setAssemblyId(data.id);
        setAdsets(_adsets);
        setCreativesById(names);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAssemblyId]);


  async function fetchCreativeNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, CreativeMini>();
    const { data, error } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .select("id, name")
      .in("id", ids);
    if (error) {
      console.warn("[assembly-panel] fetch creative names failed", error);
      return new Map<string, CreativeMini>();
    }
    const m = new Map<string, CreativeMini>();
    (data ?? []).forEach((r: any) => m.set(r.id, { id: r.id, name: r.name }));
    return m;
  }

  async function runAssembly() {
    if (!eventId || !companyId) {
      toast.error("Falta evento ou empresa", { description: "Associa esta campanha a um evento antes de montar." });
      return;
    }
    if (!creativeIds || creativeIds.length === 0) {
      toast.error("Sem criativos para montar.");
      return;
    }
    setLoading(true);
    setError(null);
    setRemovedAdsetKeys(new Set());
    setRemovedCreativeIds(new Set());
    try {
      // 1) Motor — calcula adsets e pesos (determinístico)
      const computeRes = await supabase.functions.invoke("crm-assisted-assembly-compute", {
        body: {
          company_id: companyId,
          event_id: eventId,
          flow,
          source_campaign_id: sourceCampaignId ?? null,
          creative_ids: creativeIds,
        },
      });
      if (computeRes.error) throw new Error(computeRes.error.message || "Falha no motor");
      const computeData: any = computeRes.data;
      if (!computeData?.assembly_id) throw new Error(computeData?.message || computeData?.error || "Resposta inválida do motor");

      const _adsets: AdsetOut[] = computeData.adsets ?? [];
      const _excluidos: ExcluidoContradiz[] = computeData.excluidos_contradiz ?? [];

      // Buscar nomes de criativos (para chips + lista de excluídos)
      const allIds = new Set<string>();
      _adsets.forEach((a) => a.creative_ids.forEach((id) => allIds.add(id)));
      _excluidos.forEach((e) => allIds.add(e.creative_id));
      const namesMap = await fetchCreativeNames([...allIds]);

      setAssemblyId(computeData.assembly_id);
      setAdsets(_adsets);
      setExcluidos(_excluidos);
      setCreativesById(namesMap);
      setNarrativas([]); // limpa enquanto narra

      // 2) Linguagem — LLM por adset (só cita números do input)
      const narrateRes = await supabase.functions.invoke("crm-assisted-assembly-narrate", {
        body: { company_id: companyId, assembly_id: computeData.assembly_id },
      });
      if (narrateRes.error) throw new Error(narrateRes.error.message || "Falha na narrativa");
      const narrateData: any = narrateRes.data;
      setNarrativas(narrateData?.narrativas ?? []);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      toast.error("Falha ao montar", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  function removeAdset(a: AdsetOut) {
    setRemovedAdsetKeys((prev) => new Set(prev).add(adsetKey(a)));
  }
  function removeCreative(creativeId: string) {
    setRemovedCreativeIds((prev) => new Set(prev).add(creativeId));
  }

  // Vista filtrada por remoções locais
  const visibleAdsets = useMemo(() => {
    return adsets
      .filter((a) => !removedAdsetKeys.has(adsetKey(a)))
      .map((a) => ({ ...a, creative_ids: a.creative_ids.filter((id) => !removedCreativeIds.has(id)) }))
      .filter((a) => a.creative_ids.length > 0);
  }, [adsets, removedAdsetKeys, removedCreativeIds]);

  // Narrativa por chave de adset
  const narrByKey = useMemo(() => {
    const m = new Map<string, string>();
    narrativas.forEach((n) => m.set(`${n.trigger_id ?? "generic"}::${n.trigger_nome}`, n.texto));
    return m;
  }, [narrativas]);

  const hasResult = adsets.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-5">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Montagem Assistida — {flow === "redesign" ? "Redesenho" : "Do zero"}
            </SheetTitle>
            <SheetDescription>
              O assistente agrupa os criativos por gatilho estratégico e propõe proporções de investimento. Os números vêm do motor; a linguagem é gerada pelo modelo.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Acção principal */}
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-sm text-muted-foreground">
              {!hasResult
                ? `${creativeIds.length} criativo(s) prontos para montar.`
                : `Montagem gerada com ${adsets.length} adset(s).`}
              {edited && (
                <span className="block mt-1 text-amber-300 font-medium">
                  Montagem editada — volta a montar para recalcular as proporções.
                </span>
              )}
            </div>
            <Button onClick={runAssembly} disabled={loading || !eventId || !companyId} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {hasResult ? "Voltar a montar" : "Montar com assistente"}
            </Button>
          </Card>

          {error && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
              {error}
            </Card>
          )}

          {/* Aviso de excluídos por contradição (🔴) */}
          {excluidos.length > 0 && (
            <Card className="p-4 border-red-500/40 bg-red-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300">
                    {excluidos.length} criativo(s) deixado(s) de fora por contradizerem os gatilhos activos (🔴). Revê-os antes de incluir.
                  </p>
                  <ul className="mt-2 text-xs text-red-200/80 space-y-0.5">
                    {excluidos.map((e) => (
                      <li key={e.creative_id}>
                        · {creativesById.get(e.creative_id)?.name ?? e.creative_id.slice(0, 8)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Barra de proporção (usa exclusivamente peso_pct vindo do motor) */}
          {hasResult && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Proporção de investimento</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    As proporções somam 100% e vêm do motor (cálculo determinístico). Edições locais não recalculam — para recalcular, "Voltar a montar".
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Mostra TODAS as proporções originais (não as visíveis) para fidelidade ao motor */}
              <div className="w-full h-3 rounded-full overflow-hidden flex border border-border/60">
                {adsets.map((a) => {
                  const ac = triggerAccent(a.trigger_tipo);
                  return (
                    <div
                      key={adsetKey(a)}
                      className={cn("h-full", ac.bar)}
                      style={{ width: `${a.peso_pct}%` }}
                      title={`${a.trigger_nome} — ${a.peso_pct}%`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {adsets.map((a) => {
                  const ac = triggerAccent(a.trigger_tipo);
                  return (
                    <span key={adsetKey(a)} className={cn("inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border", ac.chip)}>
                      <span className={cn("inline-block h-2 w-2 rounded-sm", ac.bar)} />
                      {a.trigger_nome} · {a.peso_pct}%
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground italic">
                Proporção sobre a verba que definires · tu aplicas o valor.
              </p>
            </Card>
          )}

          {/* Adsets */}
          {hasResult && visibleAdsets.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              Removeste todos os adsets/criativos. "Voltar a montar" para recalcular.
            </Card>
          )}

          {visibleAdsets.map((a) => {
            const ac = triggerAccent(a.trigger_tipo);
            const narr = narrByKey.get(adsetKey(a));
            const n_criativos = a.creative_ids.length;
            return (
              <Card key={adsetKey(a)} className="overflow-hidden">
                <div className="flex">
                  <div className={cn("w-1.5 shrink-0", ac.bar)} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold">{a.trigger_nome}</h3>
                          <Badge variant="outline" className={cn("text-[10px] border", ac.chip)}>{ac.label}</Badge>
                          {a.peso_origem === "roas" ? (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                              performance · ROAS {a.roas_agregado}x
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-300">
                              sem dados suficientes
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">· {n_criativos} criativo(s)</span>
                        </div>
                        <div className="mt-1 text-xl font-bold tabular-nums">{a.peso_pct}%</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeAdset(a)} title="Remover adset" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {narr ? (
                      <p className="mt-2 text-sm text-foreground/90">{narr}</p>
                    ) : loading ? (
                      <p className="mt-2 text-xs text-muted-foreground italic flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> a gerar explicação…
                      </p>
                    ) : null}

                    <Separator className="my-3" />

                    <div className="flex flex-wrap gap-1.5">
                      {a.creative_ids.map((cid) => {
                        const name = creativesById.get(cid)?.name ?? cid.slice(0, 8);
                        return (
                          <span key={cid} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/30">
                            {name}
                            <button
                              type="button"
                              onClick={() => removeCreative(cid)}
                              className="opacity-60 hover:opacity-100 hover:text-destructive"
                              title="Remover criativo"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
