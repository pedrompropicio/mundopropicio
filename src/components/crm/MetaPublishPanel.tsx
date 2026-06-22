import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
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
import { Loader2, AlertTriangle, Save, Send, Info, ExternalLink, CheckCircle2 } from "lucide-react";
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
          // Após receber o plano, lê estado/meta_campaign_id da BD para o painel.
          try {
            const { data: row } = await (supabase as any)
              .schema("crm").from("meta_publish_plan")
              .select("estado, meta_campaign_id")
              .eq("id", (data as any).plan_id).maybeSingle();
            if (!cancel && row) {
              setEstadoPlano(row.estado ?? "rascunho");
              setMetaCampaignIdPub(row.meta_campaign_id ?? null);
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
      const payload = {
        objetivo,
        orcamento_total_cents: parseEuros(orcamentoEuros) || null,
        link_destino: linkDestino.trim() ? linkDestino.trim() : null,
        adsets: plano.adsets.map(({ _ajustado_a_mao, ...a }) => a),
      };
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
  }, [plano, objetivo, orcamentoEuros, linkDestino]);

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
  }, [orcamentoEuros]);

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
                        <div className="text-xs text-muted-foreground">CTA: {an.cta} · {an.creative_ids.length} peça(s)</div>
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
                  Vais criar <b>1 campanha em PAUSA</b> · <b>{plano.adsets.length}</b> adsets · <b>{totalAnuncios}</b> anúncios · orçamento total <b>{euros(totalCents)} €</b> · objetivo <b>{objetivo}</b>
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
                    const podePublicar =
                      !jaPublicado &&
                      !!objetivo &&
                      totalCents > 0 &&
                      totalAnuncios > 0 &&
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
          </div>
        )}

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
