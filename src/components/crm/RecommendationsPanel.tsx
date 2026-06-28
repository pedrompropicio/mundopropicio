import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Lightbulb,
  RefreshCw,
  ExternalLink,
  Check,
  X,
  RotateCcw,
  Info,
  AlertTriangle,
  ChevronDown,
  Upload,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReelsCreativePickerDialog } from "./ReelsCreativePickerDialog";

// ─────────────────────────────────────────────────────────────────────────────
// P0 — DECISÃO ASSISTIDA
// Esta UI MOSTRA recomendações da Meta e deixa o utilizador marcá-las como
// tratadas/ignoradas. Marcar "tratada" SÓ muda o `status` na BD.
// NÃO executa NADA no Meta (não muda orçamento, não ativa Reels, etc.).
// A execução real ficará para uma peça futura, com confirmação explícita.
//
// PEÇA ACTUAL — botões de acção contextuais:
//   • "manual"  (REELS_PC_RECOMMENDATION) → abre Ads Manager (rec.url)
//   • "ads_manager" (PERFORMANT_CREATIVE / fallback) → abre Ads Manager
//   • "api_com_confirmacao" (APLUSC) → abre confirmação local + toast + status
//     ⚠ NÃO escreve nada no Meta nesta peça. Ver TODO no handler.
// ─────────────────────────────────────────────────────────────────────────────

interface RecommendationRow {
  id: string;
  company_id: string;
  external_campaign_id: string | null;
  external_adset_id: string | null;
  recommendation_type: string | null;
  body: string | null;
  lift_estimate: string | null;
  opportunity_score_lift: number | null;
  url: string | null;
  status: "nova" | "aplicada" | "ignorada" | string;
  decided_at: string | null;
  last_seen_at: string | null;
}

type Category = "informativa" | "relevante" | "neutra";

interface Classification {
  category: Category;
  note: string;
  label: string;
}

// Classificação determinística (puro, sem LLM). Ver P0 no topo do ficheiro.
export function classifyRecommendation(r: Pick<RecommendationRow, "recommendation_type" | "body">): Classification {
  const t = (r.recommendation_type ?? "").toLowerCase();
  const b = (r.body ?? "").toLowerCase();
  const hay = `${t} ${b}`;

  const isInformativa =
    /reels|creative|enhancement|aplusc|performant_creative|format/.test(hay);
  const isRelevante =
    /conversion|budget|audience|bid|spend|cost_cap|optimization_goal|attribution/.test(hay);

  if (isRelevante) {
    return {
      category: "relevante",
      label: "Relevante",
      note: "Pode impactar resultados — vale avaliar com cuidado.",
    };
  }
  if (isInformativa) {
    return {
      category: "informativa",
      label: "Informativa",
      note: "Sugestão de formato da Meta — avalia se faz sentido para o teu criativo.",
    };
  }
  return {
    category: "neutra",
    label: "Neutra",
    note: "Recomendação genérica da Meta.",
  };
}

// ── Aplicabilidade por tipo (FACTO vs documentação Graph v21) ───────────────
type Aplicabilidade = "manual" | "ads_manager" | "api_com_confirmacao";

interface TypeExplanation {
  titulo_amigavel: string;
  o_que_e: string;
  quando_faz_sentido: string;
  o_que_muda: string;
  aplicabilidade: Aplicabilidade;
}

// Textos fornecidos pelo Pedro — NÃO alterar redacção.
const TYPE_EXPLANATIONS: Record<string, TypeExplanation> = {
  REELS_PC_RECOMMENDATION: {
    titulo_amigavel: "Otimização para Reels",
    o_que_e:
      "A Meta sugere adicionar um vídeo vertical em ecrã inteiro (9:16) com áudio, para o anúncio correr melhor nos Reels do Instagram e Facebook.",
    quando_faz_sentido:
      "Faz sentido se tens (ou consegues produzir) um vídeo vertical do artista/evento. Os Reels têm forte alcance e custo por mil impressões baixo, mas exigem um criativo desenhado para vertical — não basta reaproveitar um banner quadrado.",
    o_que_muda:
      "Exige um criativo NOVO em formato 9:16. Não é um interruptor — tens de produzir e carregar o vídeo. Por isso o botão abaixo leva-te ao Ads Manager, no anúncio indicado, para fazeres o upload.",
    aplicabilidade: "manual",
  },
  PERFORMANT_CREATIVE_REELS_OPT_IN: {
    titulo_amigavel: "Ativar veiculação em Reels",
    o_que_e:
      "A Meta sugere permitir que o teu anúncio atual seja também mostrado nos posicionamentos de Reels, sem criar criativo novo.",
    quando_faz_sentido:
      "Faz sentido para ganhar alcance extra barato, desde que o teu criativo atual não fique estranho recortado em vertical. Avalia como o anúncio aparece nesse formato antes de ativar.",
    o_que_muda:
      "Acrescenta os posicionamentos de Reels ao adset. É reversível. Pode ser feito no Ads Manager; a aplicação automática por aqui ainda está em validação.",
    aplicabilidade: "ads_manager",
  },
  APLUSC_STANDARD_ENHANCEMENTS_BUNDLE: {
    titulo_amigavel: "Melhorias automáticas de criativo (Advantage+ / A+C)",
    o_que_e:
      "A Meta sugere ativar um conjunto de melhorias automáticas no criativo: retoques visuais, ajustes de texto, sobreposições e variações de imagem geradas pela Meta.",
    quando_faz_sentido:
      "Pode melhorar resultados em alguns casos, mas a Meta passa a alterar o teu criativo automaticamente — nem sempre como gostarias (ex.: muda enquadramento, adiciona texto). Ativa só se estiveres confortável em ceder esse controlo, e vê o resultado de perto nos primeiros dias.",
    o_que_muda:
      "Ativa o conjunto 'standard enhancements' nos anúncios indicados. É reversível. Esta é a única destas sugestões aplicável pela plataforma — mas com confirmação tua antes de qualquer alteração.",
    aplicabilidade: "api_com_confirmacao",
  },
};

function getExplanation(type: string | null): TypeExplanation | null {
  if (!type) return null;
  return TYPE_EXPLANATIONS[type] ?? null;
}

function prettyType(t: string | null): string {
  if (!t) return "—";
  const e = TYPE_EXPLANATIONS[t];
  if (e) return e.titulo_amigavel;
  return t.split("_").join(" ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const CATEGORY_STYLE: Record<Category, string> = {
  relevante: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  informativa: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  neutra: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  aplicada: "Tratada",
  ignorada: "Ignorada",
};

interface AdsetNameMap {
  [extId: string]: string;
}

export function RecommendationsPanel({
  externalCampaignId,
  companyId,
  adsetNames,
}: {
  externalCampaignId: string;
  companyId: string | null;
  adsetNames: AdsetNameMap;
}) {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["crm-meta-recommendations", externalCampaignId, companyId],
    enabled: !!externalCampaignId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_campaign_recommendations")
        .select(
          "id, company_id, external_campaign_id, external_adset_id, recommendation_type, body, lift_estimate, opportunity_score_lift, url, status, decided_at, last_seen_at",
        )
        .eq("company_id", companyId!)
        .or(`external_campaign_id.eq.${externalCampaignId},external_campaign_id.is.null`)
        .order("recommendation_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecommendationRow[];
    },
  });

  const resync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("crm-meta-recommendations", {
        body: { company_id: companyId, external_campaign_id: externalCampaignId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Recomendações atualizadas");
      qc.invalidateQueries({ queryKey: ["crm-meta-recommendations", externalCampaignId, companyId] });
    },
    onError: (e: any) => toast.error("Falha ao atualizar", { description: e?.message ?? String(e) }),
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "aplicada" | "ignorada" | "nova" }) => {
      const { data: auth } = await supabase.auth.getUser();
      const patch = {
        status: decision,
        decided_at: decision === "nova" ? null : new Date().toISOString(),
        decided_by: decision === "nova" ? null : auth?.user?.id ?? null,
      };
      const { error } = await (supabase as any)
        .from("meta_campaign_recommendations")
        .update(patch)
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const label = vars.decision === "aplicada" ? "tratada" : vars.decision === "ignorada" ? "ignorada" : "reposta";
      toast.success(`Recomendação marcada como ${label}`);
      qc.invalidateQueries({ queryKey: ["crm-meta-recommendations", externalCampaignId, companyId] });
    },
    onError: (e: any) => toast.error("Falha ao gravar decisão", { description: e?.message ?? String(e) }),
  });

  // Diálogo local de confirmação A+C (NÃO usa useConfirmMetaAction porque esse
  // dispara dry_run real à edge fn `crm-meta-entity-action`, que não conhece
  // o tipo "aplicar standard enhancements". Mantemos a UX do padrão da casa
  // (resumo de impacto + confirmar/cancelar) sem qualquer chamada ao Meta.
  const [aplusConfirm, setAplusConfirm] = useState<RecommendationRow | null>(null);
  const [reelsPicker, setReelsPicker] = useState<RecommendationRow | null>(null);

  const groups = useMemo(() => {
    const byAdset = new Map<string, RecommendationRow[]>();
    const accountLevel: RecommendationRow[] = [];
    for (const r of rows ?? []) {
      if (!r.external_adset_id || !r.external_campaign_id) {
        accountLevel.push(r);
        continue;
      }
      const arr = byAdset.get(r.external_adset_id) ?? [];
      arr.push(r);
      byAdset.set(r.external_adset_id, arr);
    }
    return { byAdset, accountLevel };
  }, [rows]);

  const total = rows?.length ?? 0;

  const handleApplyAplus = (rec: RecommendationRow) => {
    // TODO: ligar à edge function de escrita A+C (degrees_of_freedom_spec)
    // após validação controlada. Por agora apenas regista a intenção.
    toast.info("Aplicação A+C ainda em validação — em breve", {
      description: "A decisão foi registada como «tratada» na plataforma. Nada foi alterado no Meta.",
    });
    decide.mutate({ id: rec.id, decision: "aplicada" });
    setAplusConfirm(null);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-300" /> Recomendações da Meta
            {total > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px]">
                {total}
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              <strong>Decisão assistida.</strong> Marcar como <em>tratada</em> ou <em>ignorada</em> só
              regista a decisão na plataforma — <strong>não executa nada no Meta</strong>. As estimativas
              de lift são da Meta, não medidas no teu ROAS real.
            </span>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resync.mutate()}
          disabled={resync.isPending || !companyId}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", resync.isPending && "animate-spin")} />
          Atualizar recomendações
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground italic">Sem recomendações da Meta para esta campanha.</p>
      ) : (
        <div className="space-y-5">
          {[...groups.byAdset.entries()].map(([adsetId, recs]) => (
            <RecommendationGroup
              key={adsetId}
              title={adsetNames[adsetId] ?? `Adset ${adsetId}`}
              subtitle="Adset"
              recs={recs}
              onDecide={(id, decision) => decide.mutate({ id, decision })}
              onApplyAplus={(rec) => setAplusConfirm(rec)}
              onPickReels={(rec) => setReelsPicker(rec)}
              decidingId={decide.isPending ? decide.variables?.id : undefined}
            />
          ))}
          {groups.accountLevel.length > 0 && (
            <RecommendationGroup
              title="Conta de anúncios"
              subtitle="Conta"
              recs={groups.accountLevel}
              onDecide={(id, decision) => decide.mutate({ id, decision })}
              onApplyAplus={(rec) => setAplusConfirm(rec)}
              onPickReels={(rec) => setReelsPicker(rec)}
              decidingId={decide.isPending ? decide.variables?.id : undefined}
            />
          )}
        </div>
      )}

      {/* Confirmação A+C — local, sem qualquer chamada ao Meta */}
      <AlertDialog open={!!aplusConfirm} onOpenChange={(o) => !o && setAplusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-300" /> Aplicar melhorias A+C
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Vais ativar o conjunto <strong>standard enhancements</strong> no(s) anúncio(s)
                  associado(s) a esta recomendação.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>A Meta passará a <strong>alterar o criativo automaticamente</strong> (enquadramento, texto, sobreposições, variações de imagem).</li>
                  <li>É <strong>reversível</strong> — podes desativar quando quiseres.</li>
                  <li>Recomenda-se acompanhar de perto nos primeiros dias.</li>
                </ul>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                  <strong>Nesta versão:</strong> a aplicação real no Meta ainda está em validação.
                  Ao confirmar, a recomendação fica marcada como <em>tratada</em> na plataforma,
                  mas <strong>nada é alterado no Meta</strong>.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aplusConfirm && handleApplyAplus(aplusConfirm)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RecommendationGroup({
  title,
  subtitle,
  recs,
  onDecide,
  onApplyAplus,
  decidingId,
}: {
  title: string;
  subtitle: string;
  recs: RecommendationRow[];
  onDecide: (id: string, decision: "aplicada" | "ignorada" | "nova") => void;
  onApplyAplus: (rec: RecommendationRow) => void;
  decidingId?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {subtitle}
        </Badge>
        <span className="font-medium truncate">{title}</span>
        <span className="text-muted-foreground">· {recs.length} recomendaç{recs.length === 1 ? "ão" : "ões"}</span>
      </div>
      <div className="space-y-2">
        {recs.map((r) => (
          <RecommendationItem
            key={r.id}
            rec={r}
            onDecide={(decision) => onDecide(r.id, decision)}
            onApplyAplus={() => onApplyAplus(r)}
            busy={decidingId === r.id}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationItem({
  rec,
  onDecide,
  onApplyAplus,
  busy,
}: {
  rec: RecommendationRow;
  onDecide: (decision: "aplicada" | "ignorada" | "nova") => void;
  onApplyAplus: () => void;
  busy: boolean;
}) {
  const cls = classifyRecommendation(rec);
  const exp = getExplanation(rec.recommendation_type);
  const aplicabilidade: Aplicabilidade = exp?.aplicabilidade ?? "ads_manager";
  const decided = rec.status === "aplicada" || rec.status === "ignorada";
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2 transition-opacity",
        decided && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{prettyType(rec.recommendation_type)}</span>
            <Badge variant="outline" className={cn("text-[10px] border", CATEGORY_STYLE[cls.category])}>
              {cls.label}
            </Badge>
            {rec.status !== "nova" && (
              <Badge variant="outline" className="text-[10px]">
                {STATUS_LABEL[rec.status] ?? rec.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{cls.note}</p>
        </div>
      </div>

      {/* Bloco expansível "Saber mais" — texto rico por tipo */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-3 w-3 mr-1 transition-transform", open && "rotate-180")} />
            {open ? "Esconder detalhes" : "Saber mais"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          {exp ? (
            <div className="space-y-2 text-xs leading-relaxed rounded-md bg-muted/30 p-3 border">
              <ExplanationBlock label="O que é" text={exp.o_que_e} />
              <ExplanationBlock label="Quando faz sentido" text={exp.quando_faz_sentido} />
              <ExplanationBlock label="O que muda" text={exp.o_que_muda} />
            </div>
          ) : (
            <div className="space-y-2 text-xs leading-relaxed rounded-md bg-muted/30 p-3 border">
              {rec.body && (
                <p className="whitespace-pre-wrap text-foreground/90">{rec.body}</p>
              )}
              <p className="text-muted-foreground italic">
                Tipo de recomendação não mapeado nesta plataforma. Para aplicar, abre no Ads Manager.
              </p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {rec.lift_estimate && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
          <span>
            <strong className="text-foreground">Estimativa da Meta:</strong> {rec.lift_estimate}.
            Não medido no teu ROAS real.
          </span>
        </div>
      )}

      <Separator />

      {/* Acção contextual + decisões locais */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ContextualAction
          aplicabilidade={aplicabilidade}
          url={rec.url}
          disabled={decided || busy}
          onApplyAplus={onApplyAplus}
        />
        <div className="flex items-center gap-2">
          {decided ? (
            <Button size="sm" variant="ghost" onClick={() => onDecide("nova")} disabled={busy} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Repor para nova
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onDecide("ignorada")} disabled={busy} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Ignorar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDecide("aplicada")} disabled={busy} className="h-7 text-xs">
                <Check className="h-3 w-3 mr-1" /> Marcar como tratada
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ExplanationBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <p className="text-foreground/90">{text}</p>
    </div>
  );
}

function ContextualAction({
  aplicabilidade,
  url,
  disabled,
  onApplyAplus,
}: {
  aplicabilidade: Aplicabilidade;
  url: string | null;
  disabled: boolean;
  onApplyAplus: () => void;
}) {
  if (aplicabilidade === "manual") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {url ? (
          <Button asChild size="sm" disabled={disabled} className="h-7 text-xs">
            <a href={url} target="_blank" rel="noreferrer noopener">
              <Upload className="h-3 w-3 mr-1" /> Subir criativo no Ads Manager
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled className="h-7 text-xs">
            <Upload className="h-3 w-3 mr-1" /> Sem link directo
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">
          Abre o anúncio no Ads Manager para carregares o vídeo vertical.
        </span>
      </div>
    );
  }
  if (aplicabilidade === "api_com_confirmacao") {
    return (
      <Button size="sm" onClick={onApplyAplus} disabled={disabled} className="h-7 text-xs">
        <Sparkles className="h-3 w-3 mr-1" /> Aplicar melhorias A+C
      </Button>
    );
  }
  // ads_manager + fallback
  return url ? (
    <Button asChild size="sm" variant="secondary" disabled={disabled} className="h-7 text-xs">
      <a href={url} target="_blank" rel="noreferrer noopener">
        <ExternalLink className="h-3 w-3 mr-1" /> Abrir no Ads Manager
      </a>
    </Button>
  ) : (
    <Button size="sm" variant="secondary" disabled className="h-7 text-xs">
      <ExternalLink className="h-3 w-3 mr-1" /> Sem link directo
    </Button>
  );
}
