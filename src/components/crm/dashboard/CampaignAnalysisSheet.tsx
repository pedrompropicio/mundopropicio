import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { printCampaignAnalysis } from "@/lib/audience-pdf";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { CampaignRedesignDialog } from "@/components/crm/dashboard/CampaignRedesignDialog";
import type { CampaignRow } from "@/components/crm/dashboard/types";
import type { PeriodState } from "@/lib/crm/period";

/**
 * Sheet de diagnóstico IA da campanha (crm-meta-campaign-analyze) +
 * histórico (meta_campaign_diagnoses), auditoria (meta_campaign_changes),
 * dialog de aplicação de acção e fluxo de re-design.
 * Extraído de Campaigns.tsx (Fase 1) — comportamento idêntico.
 */
export function CampaignAnalysisSheet({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  campaigns,
  currency,
  period,
  periodDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  campaignName: string;
  campaigns: CampaignRow[];
  currency: string;
  period: PeriodState;
  periodDays: number;
}) {
  const navigate = useNavigate();

  const [analyzeData, setAnalyzeData] = useState<any>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeHistory, setAnalyzeHistory] = useState<any[]>([]);
  const [analyzeTab, setAnalyzeTab] = useState<string>("resumo");

  // Audit trail meta_campaign_changes — tab "Mudanças" + apply-action dialog
  const [changes, setChanges] = useState<any[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyAction, setApplyAction] = useState<{ idx: number; action: any } | null>(null);
  const [applyMeasureImpact, setApplyMeasureImpact] = useState(false);
  const [applyActionType, setApplyActionType] = useState<"pause" | "activate">("pause");
  const [applyAutoDetected, setApplyAutoDetected] = useState(false);
  const [applyReason, setApplyReason] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [redesignDialogOpen, setRedesignDialogOpen] = useState(false);

  const loadHistory = useCallback(async (cid: string) => {
    try {
      const { data } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_diagnoses")
        .select("id, created_at, overall_score, severity, summary_text, period_from, period_to, ai_model, diagnosis_jsonb")
        .eq("external_campaign_id", cid)
        .order("created_at", { ascending: false })
        .limit(5);
      setAnalyzeHistory(data ?? []);
    } catch {
      setAnalyzeHistory([]);
    }
  }, []);

  const loadChanges = useCallback(async (cid: string) => {
    setChangesLoading(true);
    try {
      const { data } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_changes")
        .select("id, applied_at, change_type, reason_text, triggered_by, applied_action_index, measure_impact_requested, before_jsonb, after_jsonb, impact_measured_at, impact_metrics_jsonb")
        .eq("external_campaign_id", cid)
        .order("applied_at", { ascending: false })
        .limit(10);
      setChanges(data ?? []);
    } catch {
      setChanges([]);
    } finally {
      setChangesLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!campaignId) return;
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setAnalyzeData(null);
    setAnalyzeTab("resumo");
    void loadHistory(campaignId);
    void loadChanges(campaignId);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-analyze", {
        body: {
          campaign_id: campaignId,
          days_back: periodDays,
          from: format(period.from, "yyyy-MM-dd"),
          to: format(period.to, "yyyy-MM-dd"),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setAnalyzeData(data);
      void loadHistory(campaignId);
    } catch (e: any) {
      setAnalyzeError(e?.message || "Erro desconhecido");
    } finally {
      setAnalyzeLoading(false);
    }
  }, [campaignId, periodDays, period.from, period.to, loadHistory, loadChanges]);

  // Arranca o diagnóstico quando o sheet abre para uma campanha.
  useEffect(() => {
    if (!open || !campaignId) return;
    void runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId]);

  const reanalyzeCampaign = () => {
    if (campaignId) void runAnalysis();
  };

  const openApplyDialog = (idx: number, action: any, measureImpact: boolean) => {
    setApplyAction({ idx, action });
    setApplyMeasureImpact(measureImpact);
    // Auto-detect tipo de acção a partir do texto livre da IA (override no dialog).
    const txt = String(action?.action ?? "").toLowerCase();
    const isPause = /pausar|pause|stop|parar|desactivar|desativar/.test(txt);
    const isActivate = /ativar|activar|reativar|reactivar|activate|resume|retomar/.test(txt);
    setApplyActionType(isPause ? "pause" : isActivate ? "activate" : "pause");
    setApplyAutoDetected(isPause || isActivate);
    setApplyReason("");
    setApplyDialogOpen(true);
  };

  const submitApplyAction = async () => {
    if (!applyAction || !campaignId) return;
    const a = applyAction.action;
    const entityType: string = a?.target_type;
    const externalId: string = a?.target_external_id;
    if (!entityType || !externalId || !["campaign", "adset", "ad"].includes(entityType)) {
      toast.error("Acção inválida: target_type/target_external_id em falta.");
      return;
    }
    const camp = campaigns?.find((c) => c.external_campaign_id === campaignId);
    const connectionId = camp?.connection_id;
    if (!connectionId) {
      toast.error("Connection da campanha não encontrada.");
      return;
    }
    setApplyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: connectionId,
          entity_type: entityType,
          external_id: externalId,
          action: applyActionType,
          diagnosis_id: analyzeData?.diagnosis_id ?? null,
          applied_action_index: applyAction.idx + 1,
          triggered_by: "user_manual",
          reason_text: applyReason.trim() || null,
          measure_impact_requested: applyMeasureImpact,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      toast.success(
        applyActionType === "pause"
          ? (applyMeasureImpact ? "Entidade pausada. Medição de impacto agendada para D+7." : "Entidade pausada.")
          : (applyMeasureImpact ? "Entidade reactivada. Medição de impacto agendada para D+7." : "Entidade reactivada.")
      );
      setApplyDialogOpen(false);
      await loadChanges(campaignId);
    } catch (e: any) {
      toast.error(e?.message || "Falha a aplicar acção");
    } finally {
      setApplyLoading(false);
    }
  };

  const openRedesignDialog = () => {
    if (!campaignId) return;
    if (!analyzeData?.diagnosis_id) {
      toast.error("Faz primeiro um diagnóstico desta campanha.");
      return;
    }
    setRedesignDialogOpen(true);
  };

  const loadHistoricalDiagnosis = (h: any) => {
    // Reconstrói shape compatível com o sheet a partir do registo persistido
    setAnalyzeData({
      diagnosis_id: h.id,
      campaign: { name: campaignName, external_campaign_id: campaignId },
      period: { from: h.period_from, to: h.period_to },
      diagnosis: h.diagnosis_jsonb,
      severity: h.severity,
      overall_score: Number(h.overall_score) || 0,
      ai_model: h.ai_model,
      generated_at: h.created_at,
    });
    setAnalyzeTab("resumo");
  };

  const redesignLoading = false;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Diagnóstico IA da Campanha
            </SheetTitle>
            <SheetDescription>
              {analyzeData?.campaign?.name ?? campaignName ?? "A processar…"}
            </SheetDescription>
          </SheetHeader>

          {campaignId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 mb-1"
              onClick={() => navigate(`/audience/campaigns/${campaignId}`)}
            >
              Ver detalhe completo
            </Button>
          )}

          <div className="mt-6 space-y-6">
            {analyzeLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-sm text-muted-foreground">A analisar campanha + adsets + ads + criativos…</p>
                <p className="text-xs text-muted-foreground/70">Pode demorar 15-30s</p>
              </div>
            )}

            {analyzeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{analyzeError}</p>
              </div>
            )}

            {analyzeData && analyzeData.diagnosis && (() => {
              const d = analyzeData.diagnosis;
              const sev: string = analyzeData.severity ?? d.severity ?? "warning";
              const score: number = Number(analyzeData.overall_score ?? d.overall_score ?? 0);
              const sevColor =
                sev === "critical" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                sev === "warning" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
              const sevLabel = sev === "critical" ? "crítica" : sev === "warning" ? "atenção" : "saudável";
              const verdictColor = (v: string) =>
                v === "pause" ? "bg-red-500/15 text-red-400" :
                v === "scale" ? "bg-emerald-500/15 text-emerald-400" :
                v === "optimize" ? "bg-amber-500/15 text-amber-400" :
                "bg-muted text-muted-foreground";
              const prioColor = (p: string) =>
                p === "high" ? "bg-red-500/15 text-red-400" :
                p === "medium" ? "bg-amber-500/15 text-amber-400" :
                "bg-muted text-muted-foreground";

              return (
                <>
                  <div className={cn("rounded-lg border p-4 flex flex-col gap-4", sevColor)}>
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="text-3xl font-bold tabular-nums">{Math.round(score)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-current">
                            {sevLabel}
                          </span>
                        </div>
                        <p className="text-sm break-words">{d.summary_pt ?? ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-row gap-2 sm:flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={reanalyzeCampaign} disabled={analyzeLoading || redesignLoading} className="flex-1 sm:flex-initial sm:w-auto">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-analisar
                      </Button>
                      {analyzeData?.diagnosis_id && (() => {
                        const drawerCampaign = campaigns?.find((cc) => cc.external_campaign_id === campaignId);
                        const drawerIsReplaced = drawerCampaign?.replaced_by_strategy_id != null;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={openRedesignDialog}
                              disabled={analyzeLoading || redesignLoading || drawerIsReplaced}
                              className="flex-1 sm:flex-initial sm:w-auto border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                              title={drawerIsReplaced ? "Campanha já substituída" : "Re-design rápido (defaults da IA)"}
                            >
                              {redesignLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                              Re-desenhar<span className="hidden sm:inline">&nbsp;(rápido)</span>
                            </Button>
                            {!drawerIsReplaced && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  onOpenChange(false);
                                  navigate(`/audience/strategies/redesign/${campaignId}`);
                                }}
                                disabled={analyzeLoading || redesignLoading}
                                className="flex-1 sm:flex-initial sm:w-auto border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                title="Wizard 4 passos com revisão manual do inventário"
                              >
                                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                Com herança<span className="hidden sm:inline">&nbsp;(wizard)</span>
                              </Button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <Tabs value={analyzeTab} onValueChange={setAnalyzeTab}>
                    <TabsList className="grid grid-cols-4 w-full">
                      <TabsTrigger value="resumo">Resumo</TabsTrigger>
                      <TabsTrigger value="detalhe">Detalhe</TabsTrigger>
                      <TabsTrigger value="historico">Histórico ({analyzeHistory.length})</TabsTrigger>
                      <TabsTrigger value="mudancas">Mudanças ({changes.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="resumo" className="space-y-5 mt-4">
                      {d.landing_concern?.suspected && (
                        <button
                          type="button"
                          onClick={() => { onOpenChange(false); navigate(`/audience/audit/campaign/${campaignId}`); }}
                          className="w-full text-left rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 hover:bg-amber-500/20 transition-colors flex items-start gap-2"
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-300">⚠️ Possível problema na landing page — Investigar</p>
                            {d.landing_concern.evidence && (
                              <p className="text-xs text-amber-200/80 mt-0.5">{d.landing_concern.evidence}</p>
                            )}
                          </div>
                          <span className="text-[10px] uppercase font-bold text-amber-300 self-center">Auditar →</span>
                        </button>
                      )}
                      {Array.isArray(d.top_3_actions) && d.top_3_actions.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Top 3 ações prioritárias
                          </h4>
                          <div className="grid gap-2">
                            {d.top_3_actions.map((a: any, i: number) => {
                              const canApply = ["campaign","adset","ad"].includes(a?.target_type) && !!a?.target_external_id;
                              return (
                                <div key={i} className="rounded-lg border border-border bg-card p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                                      #{i + 1}
                                    </span>
                                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      {a.target_type}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/70 truncate">{a.target_external_id}</span>
                                  </div>
                                  <p className="text-sm font-medium">{a.action}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{a.rationale}</p>
                                  {a.expected_impact && (
                                    <p className="text-xs text-cyan-400/80 mt-1">→ {a.expected_impact}</p>
                                  )}
                                  {canApply && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => openApplyDialog(i, a, false)}
                                      >
                                        Aplicar agora
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px] border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                        onClick={() => openApplyDialog(i, a, true)}
                                      >
                                        Aplicar e medir 7d
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {d.campaign_diagnosis && (
                        <>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Pontos fortes
                            </h4>
                            <ul className="space-y-1.5">
                              {(d.campaign_diagnosis.strengths ?? []).map((s: string, i: number) => (
                                <li key={i} className="text-sm flex gap-2">
                                  <span className="text-emerald-400 mt-0.5">•</span><span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-orange-400" /> Pontos fracos
                            </h4>
                            <ul className="space-y-1.5">
                              {(d.campaign_diagnosis.weaknesses ?? []).map((w: string, i: number) => (
                                <li key={i} className="text-sm flex gap-2">
                                  <span className="text-orange-400 mt-0.5">•</span><span>{w}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {d.campaign_diagnosis.key_metrics_analysis && (
                            <div className="rounded-lg border border-border bg-card p-3">
                              <p className="text-xs uppercase text-muted-foreground mb-1">Análise de métricas</p>
                              <p className="text-sm whitespace-pre-line">{d.campaign_diagnosis.key_metrics_analysis}</p>
                            </div>
                          )}
                        </>
                      )}

                      {d.creative_insights && (
                        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                          <p className="text-xs uppercase text-cyan-400 mb-1">Cruzamento criativos × performance</p>
                          <p className="text-sm whitespace-pre-line">{d.creative_insights}</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="detalhe" className="space-y-6 mt-4">
                      {Array.isArray(d.adset_breakdown) && d.adset_breakdown.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Adsets ({d.adset_breakdown.length})
                          </h4>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Verdict</TableHead>
                                  <TableHead>Prioridade</TableHead>
                                  <TableHead>Razão / ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {d.adset_breakdown.map((a: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium align-top max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", verdictColor(a.verdict))}>
                                        {a.verdict}
                                      </span>
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", prioColor(a.priority))}>
                                        {a.priority}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-xs align-top">
                                      <p className="text-foreground">{a.reason}</p>
                                      {Array.isArray(a.suggested_actions) && a.suggested_actions.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                          {a.suggested_actions.map((s: string, j: number) => (
                                            <li key={j}>→ {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {Array.isArray(d.ad_breakdown) && d.ad_breakdown.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Ads ({d.ad_breakdown.length})
                          </h4>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Score criativo</TableHead>
                                  <TableHead>Verdict</TableHead>
                                  <TableHead>Razão / ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {d.ad_breakdown.map((a: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium align-top max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                                    <TableCell className="text-xs align-top tabular-nums">
                                      {a.creative_score != null ? Math.round(a.creative_score) : "—"}
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", verdictColor(a.verdict))}>
                                        {a.verdict}
                                      </span>
                                      <div className="mt-0.5">
                                        <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", prioColor(a.priority))}>
                                          {a.priority}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs align-top">
                                      <p className="text-foreground">{a.reason}</p>
                                      {Array.isArray(a.suggested_actions) && a.suggested_actions.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                          {a.suggested_actions.map((s: string, j: number) => (
                                            <li key={j}>→ {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="historico" className="mt-4">
                      {analyzeHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem diagnósticos anteriores para esta campanha.</p>
                      ) : (
                        <div className="space-y-2">
                          {analyzeHistory.map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => loadHistoricalDiagnosis(h)}
                              className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 p-3 transition"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded",
                                  h.severity === "critical" ? "bg-red-500/15 text-red-400" :
                                  h.severity === "warning" ? "bg-amber-500/15 text-amber-400" :
                                  "bg-emerald-500/15 text-emerald-400"
                                )}>
                                  {h.severity === "critical" ? "crítica" : h.severity === "warning" ? "atenção" : "saudável"}
                                </span>
                                <span className="text-xs font-bold tabular-nums">{Math.round(Number(h.overall_score) || 0)}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(h.created_at).toLocaleString("pt-PT")}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{h.summary_text}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                {h.period_from} → {h.period_to} · {h.ai_model}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="mudancas" className="mt-4">
                      {changesLoading ? (
                        <div className="py-8 flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : changes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem mudanças registadas para esta campanha (mostra as últimas 10).</p>
                      ) : (
                        <div className="space-y-2">
                          {changes.map((c) => {
                            const impact = c.impact_metrics_jsonb?.delta;
                            return (
                              <div key={c.id} className="rounded-lg border border-border bg-card p-3 text-xs">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                                    {c.change_type}
                                  </span>
                                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {c.triggered_by}
                                  </span>
                                  {c.applied_action_index != null && (
                                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      acção #{c.applied_action_index}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                    {new Date(c.applied_at).toLocaleString("pt-PT")}
                                  </span>
                                </div>
                                {c.reason_text && (
                                  <p className="text-foreground mb-1">{c.reason_text}</p>
                                )}
                                <div className="text-[10px] text-muted-foreground/80 font-mono">
                                  {c.before_jsonb?.status ?? "?"} → {c.after_jsonb?.status ?? "?"}
                                  {c.before_jsonb?.daily_budget_cents !== c.after_jsonb?.daily_budget_cents && (
                                    <> · budget {formatMoney(c.before_jsonb?.daily_budget_cents ?? 0, currency, { fromCents: true })} → {formatMoney(c.after_jsonb?.daily_budget_cents ?? 0, currency, { fromCents: true })}</>
                                  )}
                                </div>
                                {impact ? (
                                  <p className="text-emerald-400 mt-1">
                                    Impacto D+7: ΔROAS {(impact.roas_abs ?? 0).toFixed(2)}x · ΔSpend {formatMoney(impact.spend_eur ?? 0, currency)} · ΔPurchases {impact.purchases_abs ?? 0}
                                  </p>
                                ) : c.measure_impact_requested ? (
                                  <p className="text-muted-foreground/70 mt-1">A aguardar medição de impacto (D+7)…</p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="pt-4 border-t border-border flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      Gerado {new Date(analyzeData.generated_at).toLocaleString("pt-PT")}
                      {analyzeData.counts && (
                        <> · {analyzeData.counts.adsets ?? 0} adsets · {analyzeData.counts.ads ?? 0} ads · {analyzeData.counts.creatives_analyzed ?? 0}/{analyzeData.counts.creatives_total ?? 0} criativos analisados</>
                      )}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printCampaignAnalysis(analyzeData)}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar acção #{(applyAction?.idx ?? 0) + 1}</DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">{applyAction?.action?.action}</span>
              <span className="block text-[10px] text-muted-foreground/80">
                Target: {applyAction?.action?.target_type} · {applyAction?.action?.target_external_id}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Tipo de mudança</Label>
              <div className="mt-2 flex gap-2">
                <Button
                  variant={applyActionType === "pause" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplyActionType("pause")}
                  disabled={applyLoading}
                >
                  Pausar
                </Button>
                <Button
                  variant={applyActionType === "activate" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplyActionType("activate")}
                  disabled={applyLoading}
                >
                  Reactivar
                </Button>
              </div>
              {!applyAutoDetected && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Não foi possível identificar o tipo de acção automaticamente — escolhe acima.
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/80 mt-1">
                Mudanças mais complexas (verba, end_time, targeting) ainda passam pela tabela de campanhas / re-design.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="apply-measure" className="text-sm">Medir impacto em D+7</Label>
              <Switch
                id="apply-measure"
                checked={applyMeasureImpact}
                onCheckedChange={setApplyMeasureImpact}
                disabled={applyLoading}
              />
            </div>
            <div>
              <Label htmlFor="apply-reason" className="text-xs uppercase text-muted-foreground">Razão (opcional)</Label>
              <Input
                id="apply-reason"
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                placeholder="ex: ROAS abaixo do floor por 3 dias consecutivos"
                disabled={applyLoading}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApplyDialogOpen(false)} disabled={applyLoading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submitApplyAction} disabled={applyLoading}>
              {applyLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignRedesignDialog
        open={redesignDialogOpen}
        onOpenChange={setRedesignDialogOpen}
        campaignId={campaignId}
        diagnosisId={analyzeData?.diagnosis_id ?? null}
        campaigns={campaigns}
        currency={currency}
        periodDays={periodDays}
      />
    </>
  );
}
