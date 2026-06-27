// DuelView — DR-2026-06-27d.
// Mostra o estado de uma run de duelo (audience_duel_runs) e os 2 candidatos
// lado a lado à medida que ficam prontos. Inclui árbitro determinístico
// client-side (só sinaliza — nunca escolhe pelo humano) e botão de seleção.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Loader2, Trophy, Sparkles, AlertTriangle, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import StrategyPlanCard from "@/components/crm/StrategyPlanCard";

type StatusResp = {
  status_run: string | null;
  gemini_model: string | null;
  gpt_model: string | null;
  gemini_finished_at: string | null;
  gpt_finished_at: string | null;
  gemini_candidate_id: string | null;
  gpt_candidate_id: string | null;
  gemini_error: string | null;
  gpt_error: string | null;
  created_at: string;
};

type DerivedState = "running" | "partial" | "done" | "error" | "mixed" | "timeout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveState(s: StatusResp | undefined | null): DerivedState {
  if (!s) return "running";
  const gFin = !!s.gemini_finished_at;
  const pFin = !!s.gpt_finished_at;
  const gErr = !!s.gemini_error;
  const pErr = !!s.gpt_error;
  const gOk = !!s.gemini_candidate_id;
  const pOk = !!s.gpt_candidate_id;

  // 1) ambos com erro
  if (gErr && pErr) return "error";
  // 2) um candidato + outro com erro explícito
  if ((gOk && pErr) || (pOk && gErr)) return "mixed";
  // 3) ambos prontos
  if (gOk && pOk) return "done";

  // 4) timeout: >5min sem ambos finished_at — antes de partial/running
  const startedMs = new Date(s.created_at).getTime();
  const ageMs = Number.isNaN(startedMs) ? 0 : Date.now() - startedMs;
  if (ageMs > 5 * 60_000 && !(gFin && pFin)) {
    // exatamente 1 candidato existe e o outro está órfão (sem error, sem finished_at)
    if ((gOk && !pOk) || (pOk && !gOk)) return "mixed";
    // 0 candidatos, ambos órfãos
    return "timeout";
  }

  // 5) parcial: pelo menos um finished_at sem condição terminal
  if (gFin || pFin) return "partial";
  // 6) ainda a correr
  return "running";
}

// ── Árbitro determinístico (apenas sinal, nunca escolhe) ────────────────────
// score 0-100 baseado em sinais objetivos do generated_plan.
function scorePlan(plan: any, targetRoas: number): { score: number; parts: Record<string, number> } {
  if (!plan || typeof plan !== "object") return { score: 0, parts: {} };

  const summary = plan.summary ?? {};
  const recCamps: any[] = Array.isArray(plan.recommended_campaigns) ? plan.recommended_campaigns : [];
  const phases: any[] = Array.isArray(plan.phases) ? plan.phases : [];
  const risks: any[] = Array.isArray(plan.risks_and_warnings) ? plan.risks_and_warnings : [];
  const warns: any[] = Array.isArray(plan._normalization_warnings)
    ? plan._normalization_warnings
    : [];

  // 1) Aderência ao target ROAS (×30)
  const expR = Number(summary.expected_overall_roas);
  const t = Math.max(targetRoas, 0.1);
  const adherence = Number.isFinite(expR) && expR > 0 ? Math.min(1, expR / t) : 0;
  const adherenceP = adherence * 30;

  // 2) Feasibility (×15)
  const feasMap: Record<string, number> = { high: 1, medium: 0.7, low: 0.4, impossible: 0 };
  const feasP = (feasMap[summary.feasibility] ?? 0.3) * 15;

  // 3) % adsets com custom_audience UUID real (×20)
  let totalAdsets = 0;
  let realAud = 0;
  for (const c of recCamps) {
    for (const a of c?.adsets ?? []) {
      totalAdsets++;
      const arr = a?.targeting_json?.custom_audiences;
      if (Array.isArray(arr) && arr.length > 0) {
        const allReal = arr.every((x: any) => typeof x?.id === "string" && UUID_RE.test(x.id));
        if (allReal) realAud++;
      }
    }
  }
  const audRatio = totalAdsets > 0 ? realAud / totalAdsets : 0;
  const audP = audRatio * 20;

  // 4) Cobertura de fases com criativos (×20)
  let phasesWithCreative = 0;
  for (const p of phases) {
    const phaseId = p?.id;
    if (!phaseId) continue;
    const hasCreative = recCamps.some(
      (c) =>
        c?.phase_id === phaseId &&
        (c?.adsets ?? []).some((a: any) => Array.isArray(a?.ads) && a.ads.length > 0)
    );
    if (hasCreative) phasesWithCreative++;
  }
  const coverage = phases.length > 0 ? phasesWithCreative / phases.length : 0;
  const coverageP = coverage * 20;

  // 5) Penalização por _normalization_warnings (×10)
  const warnP = Math.max(0, 10 - Math.min(10, warns.length * 2));

  // 6) Inverso de riscos de severidade alta (×5)
  const highRisks = risks.filter(
    (r: any) => String(r?.severity ?? "").toLowerCase() === "high"
  ).length;
  const riskP = Math.max(0, 5 - Math.min(5, highRisks * 2.5));

  const total = Math.round(adherenceP + feasP + audP + coverageP + warnP + riskP);
  return {
    score: Math.max(0, Math.min(100, total)),
    parts: {
      adherence: Math.round(adherenceP * 10) / 10,
      feasibility: Math.round(feasP * 10) / 10,
      audiences: Math.round(audP * 10) / 10,
      coverage: Math.round(coverageP * 10) / 10,
      warnings: Math.round(warnP * 10) / 10,
      risks: Math.round(riskP * 10) / 10,
    },
  };
}

function ModelHeader({
  label,
  state,
  error,
}: {
  label: string;
  state: "pending" | "ready" | "error";
  error?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold">{label}</h2>
      {state === "pending" && (
        <Badge variant="outline" className="text-[10px] uppercase border-blue-500/40 text-blue-300">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> A gerar…
        </Badge>
      )}
      {state === "ready" && (
        <Badge variant="outline" className="text-[10px] uppercase border-emerald-500/40 text-emerald-300">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Pronto
        </Badge>
      )}
      {state === "error" && (
        <Badge variant="outline" className="text-[10px] uppercase border-red-500/40 text-red-300" title={error ?? undefined}>
          <XCircle className="h-3 w-3 mr-1" /> Erro
        </Badge>
      )}
    </div>
  );
}

export default function DuelView() {
  const { duel_id } = useParams<{ duel_id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selecting, setSelecting] = useState<string | null>(null);

  // Polling do estado
  const { data: status } = useQuery<StatusResp>({
    queryKey: ["duel-status", duel_id],
    enabled: !!duel_id,
    refetchInterval: (q) => {
      const s = q.state.data as StatusResp | undefined;
      const ds = deriveState(s);
      return ds === "running" || ds === "partial" ? 4000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-audience-duel-status", {
        body: { duel_id },
      });
      if (error) throw new Error(error.message);
      return data as StatusResp;
    },
  });

  const derived = useMemo(() => deriveState(status), [status]);

  // Carrega cada candidato quando o id aparece
  const gemId = status?.gemini_candidate_id ?? null;
  const gptId = status?.gpt_candidate_id ?? null;

  const { data: gemCand } = useQuery({
    queryKey: ["duel-candidate", gemId],
    enabled: !!gemId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .select("id, status, generated_plan, target_roas, source_model")
        .eq("id", gemId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const { data: gptCand } = useQuery({
    queryKey: ["duel-candidate", gptId],
    enabled: !!gptId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .select("id, status, generated_plan, target_roas, source_model")
        .eq("id", gptId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const targetRoas =
    Number((gemCand as any)?.target_roas) ||
    Number((gptCand as any)?.target_roas) ||
    8;

  const gemScore = useMemo(
    () => (gemCand ? scorePlan((gemCand as any).generated_plan, targetRoas) : null),
    [gemCand, targetRoas]
  );
  const gptScore = useMemo(
    () => (gptCand ? scorePlan((gptCand as any).generated_plan, targetRoas) : null),
    [gptCand, targetRoas]
  );

  const arbiterMsg = useMemo(() => {
    if (!gemScore || !gptScore) return null;
    if (gemScore.score === gptScore.score) return { winner: "tie" as const, score: gemScore.score };
    return gemScore.score > gptScore.score
      ? { winner: "gemini" as const, score: gemScore.score }
      : { winner: "gpt" as const, score: gptScore.score };
  }, [gemScore, gptScore]);

  async function handleSelect(winnerId: string) {
    if (!duel_id || !winnerId) return;
    setSelecting(winnerId);
    try {
      const { error } = await (supabase as any).schema("crm").rpc("select_duel_candidate", {
        p_duel_id: duel_id,
        p_winner_id: winnerId,
      });
      if (error) throw new Error(error.message);
      toast.success("Candidato selecionado");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["duel-candidate", gemId] }),
        qc.invalidateQueries({ queryKey: ["duel-candidate", gptId] }),
      ]);
    } catch (e: any) {
      toast.error("Falha ao selecionar", { description: e?.message ?? String(e) });
    } finally {
      setSelecting(null);
    }
  }

  const gemStatusVal = (gemCand as any)?.status as string | undefined;
  const gptStatusVal = (gptCand as any)?.status as string | undefined;
  const decided = gemStatusVal === "selected" || gemStatusVal === "archived" ||
                  gptStatusVal === "selected" || gptStatusVal === "archived";

  const goBack = () => navigate(-1);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" /> Duelo de estratégias
            </h1>
            <div className="text-xs text-muted-foreground font-mono truncate">{duel_id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {derived === "running" && (
            <Badge variant="outline" className="text-[11px] border-blue-500/40 text-blue-300">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> A correr
            </Badge>
          )}
          {derived === "partial" && (
            <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-300">
              <Clock className="h-3 w-3 mr-1" /> Parcial
            </Badge>
          )}
          {derived === "done" && (
            <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-300">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Concluído
            </Badge>
          )}
          {derived === "mixed" && (
            <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" /> Misto (1 erro)
            </Badge>
          )}
          {derived === "error" && (
            <Badge variant="outline" className="text-[11px] border-red-500/40 text-red-300">
              <XCircle className="h-3 w-3 mr-1" /> Erro
            </Badge>
          )}
          {derived === "timeout" && (
            <Badge variant="outline" className="text-[11px] border-red-500/40 text-red-300">
              <Clock className="h-3 w-3 mr-1" /> Tempo esgotado
            </Badge>
          )}
        </div>
      </div>

      {/* Árbitro determinístico */}
      {(gemScore || gptScore) && (
        <Card className="p-4 border-cyan-500/30 bg-cyan-500/[0.04]">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-cyan-400" /> Árbitro determinístico
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sinal objetivo calculado a partir do plano (ROAS, viabilidade, audiences reais,
                cobertura de fases, avisos). Não é uma decisão — a escolha continua a ser tua.
              </p>
            </div>
            {arbiterMsg && (
              <Badge
                className={cn(
                  "text-xs uppercase border",
                  arbiterMsg.winner === "tie"
                    ? "bg-muted/40 text-muted-foreground border-border"
                    : "bg-cyan-500/15 text-cyan-200 border-cyan-500/40"
                )}
              >
                {arbiterMsg.winner === "tie"
                  ? "Empate técnico"
                  : `Sinal sugere: ${arbiterMsg.winner === "gemini" ? "Gemini Pro" : "GPT-5"}`}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <ScoreBlock label="Gemini Pro" score={gemScore} highlight={arbiterMsg?.winner === "gemini"} />
            <ScoreBlock label="GPT-5" score={gptScore} highlight={arbiterMsg?.winner === "gpt"} />
          </div>
        </Card>
      )}

      {/* 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DuelColumn
          label="Gemini Pro"
          modelName={status?.gemini_model ?? "google/gemini-2.5-pro"}
          candidateId={gemId}
          candidate={gemCand as any}
          error={status?.gemini_error ?? null}
          finishedAt={status?.gemini_finished_at ?? null}
          score={gemScore}
          isWinnerSignal={arbiterMsg?.winner === "gemini"}
          onSelect={() => gemId && handleSelect(gemId)}
          selecting={selecting === gemId}
          decided={decided}
        />
        <DuelColumn
          label="GPT-5"
          modelName={status?.gpt_model ?? "openai/gpt-5"}
          candidateId={gptId}
          candidate={gptCand as any}
          error={status?.gpt_error ?? null}
          finishedAt={status?.gpt_finished_at ?? null}
          score={gptScore}
          isWinnerSignal={arbiterMsg?.winner === "gpt"}
          onSelect={() => gptId && handleSelect(gptId)}
          selecting={selecting === gptId}
          decided={decided}
        />
      </div>

      {(derived === "error" || derived === "mixed" || derived === "timeout") && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5 text-xs">
          {derived === "timeout"
            ? "O duelo demorou mais de 5 minutos sem ambos os modelos terminarem. Volta à campanha e tenta novamente."
            : derived === "error"
            ? "Ambos os modelos falharam. Volta à campanha e tenta novamente."
            : "Um dos modelos falhou. Podes selecionar o que terminou."}
        </Card>
      )}
    </div>
  );
}

function ScoreBlock({
  label,
  score,
  highlight,
}: {
  label: string;
  score: { score: number; parts: Record<string, number> } | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded border p-3",
        highlight ? "border-cyan-500/50 bg-cyan-500/10" : "border-border bg-background/40"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums">
          {score ? score.score : "—"}
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      {score && (
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <div>Target {score.parts.adherence}</div>
          <div>Viab. {score.parts.feasibility}</div>
          <div>Aud. {score.parts.audiences}</div>
          <div>Fases {score.parts.coverage}</div>
          <div>Avisos {score.parts.warnings}</div>
          <div>Riscos {score.parts.risks}</div>
        </div>
      )}
    </div>
  );
}

function DuelColumn({
  label,
  modelName,
  candidateId,
  candidate,
  error,
  finishedAt,
  score,
  isWinnerSignal,
  onSelect,
  selecting,
  decided,
}: {
  label: string;
  modelName: string;
  candidateId: string | null;
  candidate: any;
  error: string | null;
  finishedAt: string | null;
  score: { score: number; parts: Record<string, number> } | null;
  isWinnerSignal?: boolean;
  onSelect: () => void;
  selecting: boolean;
  decided: boolean;
}) {
  const headerState: "pending" | "ready" | "error" = error
    ? "error"
    : candidateId
    ? "ready"
    : "pending";

  const statusVal: string | undefined = candidate?.status;
  const isSelected = statusVal === "selected";
  const isArchived = statusVal === "archived";

  return (
    <Card
      className={cn(
        "p-4 space-y-3",
        isSelected && "border-emerald-500/50 bg-emerald-500/5",
        isArchived && "border-muted/40 bg-muted/10 opacity-70",
        isWinnerSignal && !decided && "border-cyan-500/40"
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <ModelHeader label={label} state={headerState} error={error} />
          <div className="text-[10px] text-muted-foreground font-mono">{modelName}</div>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && (
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[10px] uppercase">
              Selecionada
            </Badge>
          )}
          {isArchived && (
            <Badge variant="outline" className="text-[10px] uppercase">
              Arquivada
            </Badge>
          )}
          {candidateId && !decided && (
            <Button
              size="sm"
              onClick={onSelect}
              disabled={selecting}
              className={cn(
                isWinnerSignal && "bg-cyan-500 hover:bg-cyan-600 text-white"
              )}
              variant={isWinnerSignal ? "default" : "outline"}
            >
              {selecting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Selecionar esta
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/5 p-2.5 text-xs text-red-300">
          {label === "GPT-5"
            ? `O GPT-5 não concluiu: ${error}`
            : `O Gemini não concluiu: ${error}`}
        </div>
      )}

      {!candidateId && !error && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {candidate?.generated_plan && (
        <>
          {score && (
            <div className="text-[11px] text-muted-foreground">
              Score do árbitro:{" "}
              <span className="font-semibold text-foreground">{score.score}/100</span>
              {isWinnerSignal && !decided && (
                <span className="text-cyan-300"> · sinal sugere este</span>
              )}
            </div>
          )}
          <StrategyPlanCard plan={candidate.generated_plan} compact />
        </>
      )}

      {finishedAt && (
        <div className="text-[10px] text-muted-foreground text-right">
          Terminou: {new Date(finishedAt).toLocaleString("pt-PT")}
        </div>
      )}
    </Card>
  );
}
