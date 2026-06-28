import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb,
  RefreshCw,
  ExternalLink,
  Check,
  X,
  RotateCcw,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// P0 — DECISÃO ASSISTIDA
// Esta UI MOSTRA recomendações da Meta e deixa o utilizador marcá-las como
// tratadas/ignoradas. Marcar "tratada" SÓ muda o `status` na BD.
// NÃO executa NADA no Meta (não muda orçamento, não ativa Reels, etc.).
// A execução real ficará para uma peça futura, com confirmação explícita.
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
// Regras:
//  - "informativa" → sugestões de formato/criativo que a Meta empurra
//  - "relevante"   → impacta conversão/orçamento/audiência/lance
//  - "neutra"      → tudo o resto
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

// Labels amigáveis em PT para os tipos mais comuns
const TYPE_LABEL: Record<string, string> = {
  REELS_PC_RECOMMENDATION: "Otimização para Reels",
  PERFORMANT_CREATIVE_REELS_OPT_IN: "Criativo otimizado para Reels",
  APLUSC_STANDARD_ENHANCEMENTS_BUNDLE: "Melhorias automáticas de criativo (A+C)",
};
function prettyType(t: string | null): string {
  if (!t) return "—";
  return TYPE_LABEL[t] ?? t.split("_").join(" ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
  // external_adset_id → nome legível (vem do snapshot da campanha)
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

  // Lê recomendações desta campanha + as de escopo conta (sem campanha/adset)
  // pertencentes à mesma company. RLS já filtra por tenant.
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

  // Re-sincronizar — invoca a edge fn que repopula a tabela preservando status.
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

  // Decisão — SÓ muda o status na BD. NÃO age no Meta.
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

  // Agrupamento: por adset (com nome do snapshot) + grupo "Conta" para as
  // recomendações sem external_adset_id ou sem campanha (escopo de conta).
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
              decidingId={decide.isPending ? decide.variables?.id : undefined}
            />
          ))}
          {groups.accountLevel.length > 0 && (
            <RecommendationGroup
              title="Conta de anúncios"
              subtitle="Conta"
              recs={groups.accountLevel}
              onDecide={(id, decision) => decide.mutate({ id, decision })}
              decidingId={decide.isPending ? decide.variables?.id : undefined}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function RecommendationGroup({
  title,
  subtitle,
  recs,
  onDecide,
  decidingId,
}: {
  title: string;
  subtitle: string;
  recs: RecommendationRow[];
  onDecide: (id: string, decision: "aplicada" | "ignorada" | "nova") => void;
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
  busy,
}: {
  rec: RecommendationRow;
  onDecide: (decision: "aplicada" | "ignorada" | "nova") => void;
  busy: boolean;
}) {
  const cls = classifyRecommendation(rec);
  const decided = rec.status === "aplicada" || rec.status === "ignorada";
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
        {rec.url && (
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <a href={rec.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="h-3 w-3 mr-1" /> Ver no Ads Manager
            </a>
          </Button>
        )}
      </div>
      {rec.body && <p className="text-xs leading-relaxed">{rec.body}</p>}
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
      <div className="flex items-center justify-end gap-2">
        {decided ? (
          <Button size="sm" variant="ghost" onClick={() => onDecide("nova")} disabled={busy} className="h-7 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" /> Repor para nova
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => onDecide("ignorada")} disabled={busy} className="h-7 text-xs">
              <X className="h-3 w-3 mr-1" /> Ignorar
            </Button>
            <Button size="sm" onClick={() => onDecide("aplicada")} disabled={busy} className="h-7 text-xs">
              <Check className="h-3 w-3 mr-1" /> Marcar como tratada
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
