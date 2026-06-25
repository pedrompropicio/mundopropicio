import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { DatePicker } from "@/components/ui/date-picker";

/** Componente padrão: data (DatePicker pt) + hora (HH:mm). Trabalha em "YYYY-MM-DDTHH:mm". */
function DateTimeField({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const [datePart, timePart] = (() => {
    if (!value) return ["", ""];
    const [d, t] = value.split("T");
    return [d || "", (t || "").slice(0, 5)];
  })();
  const setDate = (d: string) => {
    if (!d) {
      onChange("");
      return;
    }
    onChange(`${d}T${timePart || "00:00"}`);
  };
  const setTime = (t: string) => {
    if (!datePart) return;
    onChange(`${datePart}T${t || "00:00"}`);
  };
  return (
    <div className="flex items-center gap-2">
      <DatePicker id={id} value={datePart} onChange={setDate} className="flex-1" />
      <Input
        type="time"
        value={timePart}
        onChange={(e) => setTime(e.target.value)}
        className="h-10 w-[7.5rem] tabular-nums"
      />
    </div>
  );
}
import { Loader2, AlertTriangle, Save, Send, Info, ExternalLink, CheckCircle2, Lightbulb, RefreshCw, Zap, PauseCircle, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OBJETIVO_LABELS_PT, labelCta, labelObjetivo } from "@/lib/meta-labels";

type PublicoSugerido = {
  resumo: string;
  idade_min: number;
  idade_max: number;
  geo: string[];
  interesses: string[];
  baseado_em: string;
};

type Anuncio = {
  creative_ids: string[];
  headline: string;
  corpo: string;
  cta: string;
  origem_variacao_idx: number;
};

type AdsetPlano = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  peso_pct: number;
  orcamento_cents: number;
  publico_sugerido: PublicoSugerido;
  publico_custom_audience_id: string | null;
  anuncios: Anuncio[];
  link_destino?: string | null;
  _ajustado_a_mao?: boolean; // local-only
};

type PlanoResposta = {
  plan_id: string;
  design_id: string;
  link_destino?: string | null;
  adsets: AdsetPlano[];
  totais: { adsets: number; anuncios_elegiveis: number; variacoes_excluidas: number };
  estado?: string;
  meta_campaign_id?: string | null;
  ad_account_numeric?: string | null;
};

const OBJETIVOS = (Object.keys(OBJETIVO_LABELS_PT) as Array<keyof typeof OBJETIVO_LABELS_PT>).map(
  (value) => ({ value, label: OBJETIVO_LABELS_PT[value] }),
);

function isValidHttpsUrl(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  if (!s.startsWith("https://")) return false;
  try { new URL(s); return true; } catch { return false; }
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseEuros(v: string): number {
  const n = Number(String(v).replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const floor = pesos.map((p) => Math.floor((total * p) / soma));
  let resto = total - floor.reduce((a, b) => a + b, 0);
  const order = pesos.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p).map((x) => x.i);
  for (const idx of order) {
    if (resto <= 0) break;
    floor[idx] += 1;
    resto -= 1;
  }
  return floor;
}

// "YYYY-MM-DDTHH:mm" (local) ⇄ ISO UTC
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v); // interpretado como hora local
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function fmtJanela(startLocal: string, endLocal: string): string {
  const fmt = (s: string) => {
    if (!s) return "";
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  if (startLocal && endLocal) return `De ${fmt(startLocal)} a ${fmt(endLocal)}`;
  if (startLocal) return `A partir de ${fmt(startLocal)} (sem fim)`;
  if (endLocal) return `Até ${fmt(endLocal)} (sem início)`;
  return "Sem janela definida";
}


export function MetaPublishPanel({
  open, onOpenChange, companyId, designId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string | null;
  designId: string | null;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoResposta | null>(null);
  const [objetivo, setObjetivo] = useState<string>("OUTCOME_SALES");
  const [orcamentoEuros, setOrcamentoEuros] = useState<string>("");
  const [linkDestino, setLinkDestino] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(""); // datetime-local
  const [endTime, setEndTime] = useState<string>("");     // datetime-local

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // FASE 2 — publicação real
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunPayloads, setDryRunPayloads] = useState<any | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any | null>(null);
  const [publishError, setPublishError] = useState<any | null>(null);
  const [estadoPlano, setEstadoPlano] = useState<string>("rascunho");
  const [metaCampaignIdPub, setMetaCampaignIdPub] = useState<string | null>(null);
  const [adAccountNumeric, setAdAccountNumeric] = useState<string | null>(null);

  // FASE 3 — Ativação / kill switch
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateAck, setActivateAck] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [activateError, setActivateError] = useState<{ msg: string; resultado?: any[] } | null>(null);
  const [activateResult, setActivateResult] = useState<{ resultado: any[]; estado: string } | null>(null);

  async function chamarActivate(acao: "ativar" | "pausar") {
    if (!plano || !companyId) return;
    const isAtivar = acao === "ativar";
    if (isAtivar) setActivating(true); else setPausing(true);
    setActivateError(null);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("crm-meta-publish-activate", {
        body: { company_id: companyId, plan_id: plano.plan_id, acao },
      });
      if (invErr) {
        setActivateError({ msg: (invErr as any).message ?? "Falha de rede." });
      } else if ((data as any)?.ok === true) {
        setActivateResult({ resultado: (data as any).resultado ?? [], estado: (data as any).estado });
        setEstadoPlano((data as any).estado);
        if (isAtivar) {
          setActivateOpen(false);
          setActivateAck(false);
          toast({ title: "Campanha ATIVA no Meta", description: "Começou a publicar." });
        } else {
          setPauseOpen(false);
          toast({ title: "Campanha em pausa", description: "Parou de gastar." });
        }
      } else {
        setActivateError({
          msg: (data as any)?.error_user_msg ?? "O Meta rejeitou a operação.",
          resultado: (data as any)?.resultado,
        });
      }
    } catch (e: any) {
      setActivateError({ msg: e?.message ?? "Falha de rede." });
    } finally {
      if (isAtivar) setActivating(false); else setPausing(false);
    }
  }

  // Recomendações vivas da Meta (leitura — nunca escreve no Meta)
  type RecomendacaoUI = {
    tipo: string | null;
    titulo: string | null;
    corpo: string | null;
    lift_estimate: string | null;
    url: string | null;
    aplicavel: boolean;
    acao_sugerida: { campo: string; valor: string } | null;
  };
  type RecosResposta = {
    ok: boolean;
    conta: RecomendacaoUI[];
    campanha: RecomendacaoUI[];
    adsets: Array<{ adset_id: string; nome: string | null; recomendacoes: RecomendacaoUI[] }>;
    erros?: { conta: any; campanha: any; adsets: any };
    gerado_em?: string;
  };
  const [recosLoading, setRecosLoading] = useState(false);
  const [recos, setRecos] = useState<RecosResposta | null>(null);
  const [recosErro, setRecosErro] = useState<string | null>(null);

  async function carregarRecomendacoes() {
    if (!companyId) return;
    setRecosLoading(true);
    setRecosErro(null);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("crm-meta-recommendations", {
        body: {
          company_id: companyId,
          campaign_external_id: metaCampaignIdPub ?? undefined,
        },
      });
      if (invErr) {
        setRecosErro((invErr as any).message ?? "Não foi possível obter recomendações agora.");
      } else if ((data as any)?.error) {
        setRecosErro(`${(data as any).error}: ${(data as any).message ?? (data as any).detail ?? ""}`);
      } else {
        setRecos(data as RecosResposta);
      }
    } catch (e: any) {
      setRecosErro(e?.message ?? "Não foi possível obter recomendações agora.");
    } finally {
      setRecosLoading(false);
    }
  }

  // Carrega recomendações quando o plano fica disponível (ou quando muda o id da campanha publicada)
  useEffect(() => {
    if (!plano || !companyId) return;
    void carregarRecomendacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano?.plan_id, companyId, metaCampaignIdPub]);

  function aplicarRecomendacaoAoPlano(r: RecomendacaoUI) {
    if (!r.aplicavel || !r.acao_sugerida) return;
    if (r.acao_sugerida.campo === "objetivo") {
      setObjetivo(r.acao_sugerida.valor);
      toast({
        title: "Objetivo alterado no plano",
        description: "Mudámos o objetivo para Conversões só no plano local. Revê e publica quando quiseres — nada foi enviado ao Meta.",
      });
    }
  }

  // Load plano when opening
  useEffect(() => {
    if (!open || !companyId || !designId) return;
    let cancel = false;
    setLoading(true); setError(null); setPlano(null);
    (async () => {
      try {
        const { data, error: invErr } = await supabase.functions.invoke("crm-meta-publish-prepare", {
          body: { company_id: companyId, design_id: designId },
        });
        if (cancel) return;
        if (invErr) {
          setError((invErr as any).message ?? "Falha ao preparar plano.");
        } else if (data?.error) {
          setError(`${data.error}: ${data.message ?? data.detail ?? ""}`);
        } else {
          setPlano(data as PlanoResposta);
          setLinkDestino(((data as any)?.link_destino as string | null) ?? "");
          // Após receber o plano, lê estado/meta_campaign_id/orcamento da BD para o painel.
          try {
            const { data: row } = await (supabase as any)
              .schema("crm").from("meta_publish_plan")
              .select("estado, meta_campaign_id, start_time, end_time, orcamento_total_cents")
              .eq("id", (data as any).plan_id).maybeSingle();
            if (!cancel && row) {
              setEstadoPlano(row.estado ?? "rascunho");
              setMetaCampaignIdPub(row.meta_campaign_id ?? null);
              setStartTime(isoToLocalInput(row.start_time));
              setEndTime(isoToLocalInput(row.end_time));
              // Hidrata orçamento total: (i) BD orcamento_total_cents; (ii) soma adsets; (iii) vazio.
              const adsetsResp = ((data as any)?.adsets ?? []) as AdsetPlano[];
              const somaAdsets = adsetsResp.reduce((s, a) => s + (Number(a.orcamento_cents) || 0), 0);
              const totalCents = Number(row.orcamento_total_cents) > 0
                ? Number(row.orcamento_total_cents)
                : (somaAdsets > 0 ? somaAdsets : 0);
              if (totalCents > 0) {
                setOrcamentoEuros((totalCents / 100).toFixed(2));
              }
            }
          } catch { /* ignore */ }

        }
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? "Falha de rede.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, companyId, designId]);

  // Auto-save (debounce 800ms)
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!plano) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setSaveState("saving");
    debounceRef.current = window.setTimeout(async () => {
      const startIso = localInputToIso(startTime);
      const endIso = localInputToIso(endTime);
      // Validação: se ambos definidos, fim > início. Senão NÃO grava janela inválida.
      const janelaInvalida = !!(startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime());
      const payload: Record<string, unknown> = {
        objetivo,
        orcamento_total_cents: parseEuros(orcamentoEuros) || null,
        link_destino: linkDestino.trim() ? linkDestino.trim() : null,
        adsets: plano.adsets.map(({ _ajustado_a_mao, ...a }) => a),
      };
      if (!janelaInvalida) {
        payload.start_time = startIso;
        payload.end_time = endIso;
      }
      const { error: upErr } = await (supabase as any)
        .schema("crm").from("meta_publish_plan")
        .update(payload).eq("id", plano.plan_id);
      if (upErr) {
        setSaveState("idle");
        toast({ title: "Erro a guardar", description: upErr.message, variant: "destructive" });
      } else {
        setSaveState("saved");
      }
    }, 800);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano, objetivo, orcamentoEuros, linkDestino, startTime, endTime]);


  // Quando o orçamento total muda, reparte (mas só nos adsets que NÃO foram ajustados à mão)
  useEffect(() => {
    if (!plano) return;
    const total = parseEuros(orcamentoEuros);
    if (total <= 0) return;
    const idxAuto: number[] = [];
    plano.adsets.forEach((a, i) => { if (!a._ajustado_a_mao) idxAuto.push(i); });
    if (idxAuto.length === 0) return;
    // Soma já comprometida nos ajustados à mão
    const fixoTot = plano.adsets.reduce((s, a) => s + (a._ajustado_a_mao ? (a.orcamento_cents || 0) : 0), 0);
    const restante = Math.max(0, total - fixoTot);
    const pesosAuto = idxAuto.map((i) => plano.adsets[i].peso_pct || 0);
    const parts = repartir(restante, pesosAuto);
    setPlano((p) => {
      if (!p) return p;
      const next = p.adsets.map((a) => ({ ...a }));
      idxAuto.forEach((i, k) => { next[i].orcamento_cents = parts[k] ?? 0; });
      return { ...p, adsets: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoEuros, plano?.plan_id]);

  const somaAdsetsCents = useMemo(
    () => (plano?.adsets ?? []).reduce((s, a) => s + (a.orcamento_cents || 0), 0),
    [plano]
  );
  const totalCents = parseEuros(orcamentoEuros);
  const totalAnuncios = useMemo(
    () => (plano?.adsets ?? []).reduce((s, a) => s + a.anuncios.length, 0),
    [plano]
  );

  function updateAdset(i: number, mut: (a: AdsetPlano) => void, marcarAjustado = false) {
    setPlano((p) => {
      if (!p) return p;
      const next = p.adsets.map((a) => ({ ...a, publico_sugerido: { ...a.publico_sugerido } }));
      mut(next[i]);
      if (marcarAjustado) next[i]._ajustado_a_mao = true;
      return { ...p, adsets: next };
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Preparar publicação no Meta</SheetTitle>
          <SheetDescription>
            Esta fase prepara e revê o plano. A criação real no Meta chega na próxima fase.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> A preparar plano…
          </div>
        )}

        {error && (
          <Card className="p-4 mt-4 border-destructive/50 bg-destructive/5 text-sm">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" /> Erro
            </div>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </Card>
        )}

        {plano && (
          <div className="space-y-4 mt-4">
            {/* Cabeçalho global */}
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Objetivo da campanha</label>
                  <Select value={objetivo} onValueChange={setObjetivo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OBJETIVOS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Orçamento total (€)</label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={orcamentoEuros}
                    onChange={(e) => setOrcamentoEuros(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Link de destino (página de bilhetes)</label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={linkDestino}
                  onChange={(e) => setLinkDestino(e.target.value)}
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  Para onde o anúncio leva ao clicar.
                  {linkDestino.trim() && !isValidHttpsUrl(linkDestino.trim()) && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">URL inválido (tem de começar por https://).</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Início da campanha (opcional)</label>
                  <DateTimeField value={startTime} onChange={setStartTime} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fim da campanha (opcional)</label>
                  <DateTimeField value={endTime} onChange={setEndTime} />
                </div>
                <div className="md:col-span-2 text-[11px] text-muted-foreground">
                  Com data de fim definida, o orçamento de cada adset passa a ser <b>total para toda a janela</b> (lifetime). Sem fim, mantém-se diário.
                  {(() => {
                    const sIso = localInputToIso(startTime);
                    const eIso = localInputToIso(endTime);
                    if (sIso && eIso && new Date(eIso).getTime() <= new Date(sIso).getTime()) {
                      return <span className="ml-2 text-amber-600 dark:text-amber-400">A data de fim tem de ser depois do início.</span>;
                    }
                    if (eIso && !sIso) {
                      return <span className="ml-2 text-amber-600 dark:text-amber-400">Para usar data de fim tens de definir também o início (exigência do Meta para lifetime budget).</span>;
                    }
                    return null;
                  })()}
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Info className="h-3 w-3" />
                Os pesos vêm da Montagem Assistida e não são tocados pela UI. O orçamento é repartido em código por esses pesos.
              </div>
              <div className="text-xs">
                Estado:{" "}
                {saveState === "saving" && <span className="text-muted-foreground">A guardar…</span>}
                {saveState === "saved" && <span className="text-emerald-600 dark:text-emerald-400">Guardado</span>}
                {saveState === "idle" && <span className="text-muted-foreground">—</span>}
              </div>
            </Card>

            {/* Recomendações vivas da Meta — leitura. "Aplicar" mexe SÓ no plano local, NUNCA no Meta. */}
            <Card className="p-4 space-y-3 border-amber-500/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <h3 className="font-semibold">Recomendações da Meta</h3>
                  {recos?.gerado_em && (
                    <span className="text-[11px] text-muted-foreground">
                      atualizado {new Date(recos.gerado_em).toLocaleTimeString("pt-PT")}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recosLoading}
                  onClick={() => void carregarRecomendacoes()}
                >
                  {recosLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Atualizar
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Vêm da Meta. "Aplicar ao plano" só muda este plano local — nada é enviado ao Meta até carregares em publicar.
              </p>

              {recosErro && (
                <div className="text-xs text-muted-foreground border rounded p-2">
                  Não foi possível obter recomendações agora. <span className="opacity-60">({recosErro})</span>
                </div>
              )}

              {recosLoading && !recos && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> A consultar a Meta…
                </div>
              )}

              {recos && (
                <>
                  {/* Conta */}
                  {recos.conta.length === 0 ? (
                    <p className="text-xs text-muted-foreground">A Meta não tem recomendações para a conta de momento.</p>
                  ) : (
                    <div className="space-y-2">
                      {recos.conta.map((r, idx) => (
                        <div key={`conta-${idx}`} className="border rounded-md p-3 bg-muted/30 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              {r.titulo && <div className="font-medium">💡 {r.titulo}</div>}
                              {r.corpo && <div className="text-muted-foreground text-xs whitespace-pre-wrap">{r.corpo}</div>}
                              {r.lift_estimate && (
                                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  {r.lift_estimate}
                                </div>
                              )}
                              {r.url && (
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-muted-foreground underline inline-flex items-center gap-1"
                                >
                                  Ver no Ads Manager <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            {r.aplicavel && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => aplicarRecomendacaoAoPlano(r)}
                              >
                                Aplicar ao plano
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Campanha + adsets (só aparece se houver) */}
                  {(recos.campanha.length > 0 || recos.adsets.length > 0) && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="text-xs font-medium">Específicas desta campanha</div>
                      {recos.campanha.map((r, idx) => (
                        <div key={`camp-${idx}`} className="border rounded-md p-2 bg-muted/20 text-xs">
                          {r.titulo && <div className="font-medium">💡 {r.titulo}</div>}
                          {r.corpo && <div className="text-muted-foreground whitespace-pre-wrap">{r.corpo}</div>}
                          {r.lift_estimate && (
                            <div className="font-medium text-emerald-600 dark:text-emerald-400">{r.lift_estimate}</div>
                          )}
                        </div>
                      ))}
                      {recos.adsets.map((g) => (
                        <div key={g.adset_id} className="border rounded-md p-2 bg-muted/20 text-xs space-y-1">
                          <div className="font-medium">Adset: {g.nome ?? g.adset_id}</div>
                          {g.recomendacoes.map((r, idx) => (
                            <div key={idx} className="pl-2">
                              {r.titulo && <div>💡 {r.titulo}</div>}
                              {r.corpo && <div className="text-muted-foreground whitespace-pre-wrap">{r.corpo}</div>}
                              {r.lift_estimate && (
                                <div className="text-emerald-600 dark:text-emerald-400">{r.lift_estimate}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Adsets */}
            {plano.adsets.map((a, i) => {
              const semElegiveis = a.anuncios.length === 0;
              return (
                <Card key={i} className={"p-4 space-y-3 " + (semElegiveis ? "border-amber-500/50" : "")}>
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{a.trigger_nome || "Adset"}</h3>
                      <Badge variant="outline">{a.trigger_tipo || "—"}</Badge>
                      <Badge>{a.peso_pct}% investimento sugerido</Badge>
                      {a._ajustado_a_mao && <Badge variant="secondary">ajustado à mão</Badge>}
                    </div>
                  </div>

                  {/* Orçamento */}
                  <div>
                    <label className="text-xs text-muted-foreground">Orçamento deste adset (€)</label>
                    <Input
                      inputMode="decimal"
                      value={euros(a.orcamento_cents || 0)}
                      onChange={(e) => {
                        const cents = parseEuros(e.target.value);
                        updateAdset(i, (x) => { x.orcamento_cents = cents; }, true);
                      }}
                    />
                  </div>

                  {/* Link específico (override do link do plano) */}
                  <div>
                    <label className="text-xs text-muted-foreground">Link específico deste adset (opcional)</label>
                    <Input
                      type="url"
                      placeholder="https://... (deixa vazio para usar o link do topo)"
                      value={a.link_destino ?? ""}
                      onChange={(e) => updateAdset(i, (x) => {
                        const v = e.target.value.trim();
                        x.link_destino = v ? v : null;
                      })}
                    />
                    {a.link_destino && !isValidHttpsUrl(a.link_destino) && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">URL inválido (tem de começar por https://).</div>
                    )}
                  </div>

                  {/* Público */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Público sugerido</div>
                    {a.publico_sugerido?.resumo && (
                      <p className="text-sm text-muted-foreground">{a.publico_sugerido.resumo}</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Idade mín.</label>
                        <Input
                          type="number" min={13} max={65}
                          value={a.publico_sugerido?.idade_min ?? 18}
                          onChange={(e) => updateAdset(i, (x) => { x.publico_sugerido.idade_min = Number(e.target.value) || 18; })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Idade máx.</label>
                        <Input
                          type="number" min={13} max={65}
                          value={a.publico_sugerido?.idade_max ?? 65}
                          onChange={(e) => updateAdset(i, (x) => { x.publico_sugerido.idade_max = Number(e.target.value) || 65; })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">Geo (vírgula)</label>
                        <Input
                          value={(a.publico_sugerido?.geo ?? []).join(", ")}
                          onChange={(e) => updateAdset(i, (x) => {
                            x.publico_sugerido.geo = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Interesses (um por linha ou vírgula)</label>
                      <Textarea
                        rows={2}
                        value={(a.publico_sugerido?.interesses ?? []).join(", ")}
                        onChange={(e) => updateAdset(i, (x) => {
                          x.publico_sugerido.interesses = e.target.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
                        })}
                      />
                    </div>
                    {a.publico_sugerido?.baseado_em && (
                      <p className="text-xs text-muted-foreground">
                        Sugerido a partir de: {a.publico_sugerido.baseado_em}
                      </p>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground">Custom Audience ID (opcional)</label>
                      <Input
                        placeholder="será validado na publicação"
                        value={a.publico_custom_audience_id ?? ""}
                        onChange={(e) => updateAdset(i, (x) => { x.publico_custom_audience_id = e.target.value || null; })}
                      />
                    </div>
                  </div>

                  {/* Anúncios */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Anúncios <Badge variant="outline">{a.anuncios.length}</Badge>
                      <span className="text-xs text-muted-foreground">Só variações coerentes são publicadas.</span>
                    </div>
                    {semElegiveis && (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Sem anúncios elegíveis (nenhuma variação do desenho ficou 🟢 coerente).
                      </p>
                    )}
                    {a.anuncios.map((an, k) => (
                      <div key={k} className="border rounded-md p-3 text-sm space-y-1 bg-muted/30">
                        <div className="font-medium">{an.headline}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap">{an.corpo}</div>
                        <div className="text-xs text-muted-foreground">CTA: {labelCta(an.cta)} · {an.creative_ids.length} peça(s)</div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}

            {/* Resumo final */}
            <Card className="p-4 sticky bottom-0 bg-background/95 backdrop-blur border-primary/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  Vais criar <b>1 campanha em PAUSA</b> · <b>{plano.adsets.length}</b> adsets · <b>{totalAnuncios}</b> anúncios · orçamento total <b>{euros(totalCents)} €</b> · objetivo <b>{labelObjetivo(objetivo)}</b>
                  <div className="text-xs text-muted-foreground mt-1">
                    Janela: <b>{fmtJanela(startTime, endTime)}</b>{endTime ? <> · orçamento <b>lifetime</b> (total da janela)</> : <> · orçamento <b>diário</b></>}
                  </div>
                  {totalCents > 0 && Math.abs(somaAdsetsCents - totalCents) > 1 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      (soma dos adsets = {euros(somaAdsetsCents)} € — não bate)
                    </span>
                  )}
                  {plano.totais.variacoes_excluidas > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {plano.totais.variacoes_excluidas} variações não-coerentes foram excluídas.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const jaPublicado = estadoPlano === "publicado";
                    const linkTopoOk = isValidHttpsUrl(linkDestino.trim());
                    const sIso = localInputToIso(startTime);
                    const eIso = localInputToIso(endTime);
                    const janelaInvalida = !!(sIso && eIso && new Date(eIso).getTime() <= new Date(sIso).getTime());
                    const faltaStartParaLifetime = !!eIso && !sIso;
                    const podePublicar =
                      !jaPublicado &&
                      !!objetivo &&
                      totalCents > 0 &&
                      totalAnuncios > 0 &&
                      linkTopoOk &&
                      !janelaInvalida &&
                      !faltaStartParaLifetime &&
                      !!plano.plan_id &&
                      !!companyId;
                    const tooltipMsg = jaPublicado
                      ? "Plano já publicado no Meta (em pausa)."
                      : !objetivo
                        ? "Escolhe um objetivo."
                        : totalCents <= 0
                          ? "Define um orçamento total."
                          : totalAnuncios === 0
                            ? "Nenhum anúncio elegível (variações coerentes)."
                            : !linkTopoOk
                              ? "Falta o link de destino."
                              : janelaInvalida
                                ? "Fim da campanha tem de ser depois do início."
                                : faltaStartParaLifetime
                                  ? "Para usar data de fim, define também a de início."
                                  : "Pronto a publicar — fica tudo em pausa.";

                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>
                              <Button
                                disabled={!podePublicar}
                                onClick={() => {
                                  setPublishResult(null);
                                  setPublishError(null);
                                  setDryRunPayloads(null);
                                  setConfirmOpen(true);
                                }}
                              >
                                {jaPublicado ? (
                                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Publicado (em pausa)</>
                                ) : (
                                  <><Send className="h-4 w-4 mr-1" /> Publicar no Meta (em pausa)</>
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{tooltipMsg}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Save className="h-3 w-3" /> Nada fica ativo — campanha, adsets e anúncios nascem em PAUSA. A ativação faz-se à parte (Ads Manager / fase seguinte).
              </p>
              {estadoPlano === "publicado" && metaCampaignIdPub && (
                <p className="text-xs mt-2">
                  <a
                    className="underline inline-flex items-center gap-1"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountNumeric ?? ""}&selected_campaign_ids=${metaCampaignIdPub}`}
                  >
                    Abrir campanha no Ads Manager <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              )}
            </Card>

            {/* ── FASE 3 — Ativação / Kill switch ─────────────────────────── */}
            {(estadoPlano === "publicado" || estadoPlano === "pausado" || estadoPlano === "ativo") && metaCampaignIdPub && (
              <Card className={`p-4 border-2 ${estadoPlano === "ativo" ? "border-emerald-500/60 bg-emerald-500/5" : "border-amber-500/60 bg-amber-500/5"}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {estadoPlano === "ativo" ? (
                        <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> <span className="font-semibold text-emerald-700 dark:text-emerald-400">Campanha ATIVA — está a gastar</span></>
                      ) : estadoPlano === "pausado" ? (
                        <><PauseCircle className="h-5 w-5 text-amber-600" /> <span className="font-semibold text-amber-700 dark:text-amber-400">Em pausa</span></>
                      ) : (
                        <><PauseCircle className="h-5 w-5 text-amber-600" /> <span className="font-semibold text-amber-700 dark:text-amber-400">Publicada em PAUSA</span></>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Campanha: <code>{metaCampaignIdPub}</code>
                    </div>
                    <div className="text-xs">
                      Orçamento total <b>{euros(totalCents)} €/dia</b> · {plano.adsets.length} adsets · {totalAnuncios} anúncios
                    </div>
                    <a
                      className="text-xs underline inline-flex items-center gap-1"
                      target="_blank" rel="noreferrer"
                      href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountNumeric ?? ""}&selected_campaign_ids=${metaCampaignIdPub}`}
                    >
                      Abrir no Ads Manager <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex flex-col items-stretch gap-2">
                    {estadoPlano === "ativo" ? (
                      <Button
                        variant="outline"
                        className="border-amber-600 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                        onClick={() => { setActivateError(null); setPauseOpen(true); }}
                        disabled={pausing}
                      >
                        {pausing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PauseCircle className="h-4 w-4 mr-1" />}
                        Pausar campanha
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        onClick={() => { setActivateAck(false); setActivateError(null); setActivateOpen(true); }}
                        disabled={activating}
                      >
                        {activating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                        {estadoPlano === "pausado" ? "Reativar campanha — começa a gastar" : "Ativar campanha — começa a gastar"}
                      </Button>
                    )}
                  </div>
                </div>

                {activateError && (
                  <div className="mt-3 border border-destructive/50 bg-destructive/5 rounded p-3 text-sm">
                    <div className="flex items-center gap-2 text-destructive font-medium">
                      <AlertTriangle className="h-4 w-4" /> {activateError.msg}
                    </div>
                    {Array.isArray(activateError.resultado) && activateError.resultado.length > 0 && (
                      <ul className="mt-2 text-xs space-y-0.5">
                        {activateError.resultado.map((r: any, i: number) => (
                          <li key={i}>
                            <b>{r.nivel}</b> <code>{r.id}</code> → <span className={r.status === "failed" ? "text-destructive" : ""}>{r.status}</span>
                            {r.detalhe ? ` — ${r.detalhe}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activateResult && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Última operação: {activateResult.resultado.length} flips · estado <b>{activateResult.estado}</b>.
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* FASE 3 — Modal de ATIVAÇÃO com checkbox obrigatória */}
        <Dialog open={activateOpen} onOpenChange={(v) => { if (!activating) { setActivateOpen(v); if (!v) setActivateAck(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ativar campanha no Meta</DialogTitle>
              <DialogDescription>
                Campanha <code>{metaCampaignIdPub}</code> · {plano?.adsets.length ?? 0} adsets · orçamento <b>{euros(totalCents)} €/dia</b>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Atenção
                </div>
                <p className="mt-1">Isto ATIVA a campanha no Meta agora e vai começar a gastar dinheiro.</p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={activateAck} onCheckedChange={(v) => setActivateAck(v === true)} />
                <span>Compreendo que a campanha vai começar a gastar.</span>
              </label>
              {activateError && (
                <div className="border border-destructive/50 bg-destructive/5 rounded p-3 text-xs">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertTriangle className="h-4 w-4" /> {activateError.msg}
                  </div>
                  {Array.isArray(activateError.resultado) && activateError.resultado.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {activateError.resultado.map((r: any, i: number) => (
                        <li key={i}>
                          <b>{r.nivel}</b> <code>{r.id}</code> → {r.status}{r.detalhe ? ` — ${r.detalhe}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" disabled={activating} onClick={() => setActivateOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!activateAck || activating}
                onClick={() => chamarActivate("ativar")}
              >
                {activating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                Ativar agora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* FASE 3 — Kill switch: confirmação simples para PAUSAR */}
        <AlertDialog open={pauseOpen} onOpenChange={(v) => { if (!pausing) setPauseOpen(v); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pausar a campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                A campanha <code>{metaCampaignIdPub}</code> vai parar de publicar e deixa de gastar. Podes reativar a qualquer momento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {activateError && (
              <div className="border border-destructive/50 bg-destructive/5 rounded p-3 text-xs">
                <div className="flex items-center gap-2 text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4" /> {activateError.msg}
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pausing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pausing}
                onClick={(e) => { e.preventDefault(); void chamarActivate("pausar"); }}
              >
                {pausing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PauseCircle className="h-4 w-4 mr-1" />}
                Pausar agora
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>



        {/* Confirmação em 2 passos — Publicação no Meta */}
        <Dialog open={confirmOpen} onOpenChange={(v) => { if (!publishing) setConfirmOpen(v); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Confirmar criação no Meta</DialogTitle>
              <DialogDescription>
                Vais criar no Meta: <b>1 campanha EM PAUSA</b>, <b>{plano?.adsets.length ?? 0} adsets</b>{" "}
                (orçamento total {euros(totalCents)} €), <b>{totalAnuncios} anúncios</b>.
                Nada será ativado — fica tudo em pausa.
              </DialogDescription>
            </DialogHeader>

            {dryRunPayloads && (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground mb-1">Payloads (dry-run, não enviado ao Meta):</div>
                <pre className="text-[10px] bg-muted/40 p-3 rounded max-h-80 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(dryRunPayloads, null, 2)}
                </pre>
              </div>
            )}

            {publishError && (
              <div className="mt-2 border border-destructive/50 bg-destructive/5 rounded p-3 text-sm">
                <div className="flex items-center gap-2 text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4" /> Falhou no passo: {publishError.passo ?? "?"}
                </div>
                <pre className="text-[10px] mt-1 whitespace-pre-wrap break-all">
{JSON.stringify(publishError, null, 2)}
                </pre>
              </div>
            )}

            {publishResult && (
              <div className="mt-2 border border-emerald-500/40 bg-emerald-500/5 rounded p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Criado no Meta (em pausa)
                </div>
                <div>Campanha: <code className="text-xs">{publishResult.meta_campaign_id}</code></div>
                <div className="text-xs text-muted-foreground">
                  {publishResult.adsets?.length ?? 0} adsets · {(publishResult.adsets ?? []).reduce((s: number, a: any) => s + (a.ads?.length ?? 0), 0)} anúncios criados.
                </div>
                <a
                  className="text-xs underline inline-flex items-center gap-1"
                  target="_blank" rel="noreferrer"
                  href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${publishResult.ad_account_numeric ?? ""}&selected_campaign_ids=${publishResult.meta_campaign_id}`}
                >
                  Abrir no Ads Manager <ExternalLink className="h-3 w-3" />
                </a>
                {Array.isArray(publishResult.avisos) && publishResult.avisos.length > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    Avisos: {publishResult.avisos.length} (ver consola).
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                disabled={publishing || dryRunLoading}
                onClick={async () => {
                  if (!plano || !companyId) return;
                  setDryRunLoading(true);
                  setPublishError(null);
                  try {
                    const { data, error: invErr } = await supabase.functions.invoke("crm-meta-publish-execute", {
                      body: { company_id: companyId, plan_id: plano.plan_id, dry_run: true },
                    });
                    if (invErr) {
                      setPublishError({ passo: "dry_run", error: { message: (invErr as any).message } });
                    } else if ((data as any)?.error) {
                      setPublishError({ passo: "dry_run", error: data });
                    } else {
                      setDryRunPayloads(data);
                    }
                  } catch (e: any) {
                    setPublishError({ passo: "dry_run", error: { message: e?.message } });
                  } finally {
                    setDryRunLoading(false);
                  }
                }}
              >
                {dryRunLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Ver payloads (dry-run)
              </Button>
              <Button
                variant="ghost"
                disabled={publishing}
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={publishing || estadoPlano === "publicado" || !!publishResult}
                onClick={async () => {
                  if (!plano || !companyId) return;
                  setPublishing(true);
                  setPublishError(null);
                  setPublishResult(null);
                  try {
                    const { data, error: invErr } = await supabase.functions.invoke("crm-meta-publish-execute", {
                      body: { company_id: companyId, plan_id: plano.plan_id, dry_run: false },
                    });
                    if (invErr) {
                      setPublishError({ passo: "invoke", error: { message: (invErr as any).message } });
                    } else if ((data as any)?.ok === true) {
                      setPublishResult(data);
                      setEstadoPlano("publicado");
                      setMetaCampaignIdPub((data as any).meta_campaign_id ?? null);
                      setAdAccountNumeric((data as any).ad_account_numeric ?? null);
                      toast({ title: "Publicado no Meta (em pausa)", description: `Campanha ${(data as any).meta_campaign_id}` });
                    } else {
                      setPublishError(data);
                    }
                  } catch (e: any) {
                    setPublishError({ passo: "invoke", error: { message: e?.message } });
                  } finally {
                    setPublishing(false);
                  }
                }}
              >
                {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Confirmar e criar no Meta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
