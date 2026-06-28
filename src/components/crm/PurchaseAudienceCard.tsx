// PurchaseAudienceCard — Peça 4 da issue #21 #4 (parte EXCLUSÃO).
// Gere a audiência de COMPRADORES (Purchase) de um evento — a que será
// EXCLUÍDA automaticamente nos adsets de conversão pelo strategy-deploy.
//
// Reutilizado em 4 call-sites:
//   A) EventMarketingEditor (GestaoTab)        variant="card"
//   B) CampaignFromScratch (evento existente)  variant="inline"
//   C) StrategyRedesign (constraints)          variant="inline"
//   D) StrategyNewDesign (objetivo)            variant="inline"
//
// NÃO bloqueia geração de plano (decisão Pedro). Sugestões legadas (sem
// event_id) por heurística leve de nome — só sugestão visual; exclusão
// automática real só nasce após "Ligar a este evento" + is_primary_purchase.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

interface Props {
  eventId: string;
  companyId?: string | null;
  metaPixelId?: string | null;
  variant?: "card" | "inline";
}

interface AudienceRow {
  id: string;
  audience_id_meta: string;
  name: string;
  enabled: boolean;
  event_id: string | null;
  is_primary_purchase: boolean | null;
  filters: any;
}

const PURCHASE_NAME_TOKENS = ["purchase", "compra", "compras", "comprador", "buyer"];

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikePurchaseForEvent(audName: string, eventName: string): boolean {
  const n = normalize(audName);
  const e = normalize(eventName);
  if (!n) return false;
  const hasPurchaseToken = PURCHASE_NAME_TOKENS.some((t) => n.includes(t));
  if (!hasPurchaseToken) return false;
  if (!e) return false;
  // exige pelo menos um token do nome do evento ≥ 4 chars (filtra "de", "do", "the", etc.)
  const evTokens = e.split(" ").filter((t) => t.length >= 4);
  if (evTokens.length === 0) return false;
  return evTokens.some((t) => n.includes(t));
}

export default function PurchaseAudienceCard({
  eventId,
  companyId: companyIdProp,
  metaPixelId: metaPixelIdProp,
  variant = "card",
}: Props) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 1) Resolve dados do evento se props vierem vazios
  const eventQ = useQuery({
    queryKey: ["purchase-audience-event", eventId],
    enabled: !!eventId && (!companyIdProp || !metaPixelIdProp),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, company_id, meta_pixel_id")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; company_id: string | null; meta_pixel_id: string | null } | null;
    },
  });

  // Sempre lê nome (para heurística de sugestão)
  const eventNameQ = useQuery({
    queryKey: ["purchase-audience-event-name", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("name").eq("id", eventId).maybeSingle();
      return (data?.name as string | null) ?? null;
    },
  });

  const companyId = companyIdProp ?? eventQ.data?.company_id ?? null;
  const metaPixelId = metaPixelIdProp ?? eventQ.data?.meta_pixel_id ?? null;
  const eventName = eventNameQ.data ?? "";

  // 2) Audiências já ligadas a este evento
  const linkedQ = useQuery({
    queryKey: ["purchase-audiences-linked", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_custom_audiences")
        .select("id, audience_id_meta, name, enabled, event_id, is_primary_purchase, filters")
        .eq("event_id", eventId)
        .eq("enabled", true)
        .order("is_primary_purchase", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AudienceRow[];
    },
  });

  // 3) Sugestões legadas (sem event_id) — heurística leve por nome
  const suggestionsQ = useQuery({
    queryKey: ["purchase-audiences-suggestions", companyId, eventName],
    enabled: !!companyId && !!eventName,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meta_custom_audiences")
        .select("id, audience_id_meta, name, enabled, event_id, is_primary_purchase, filters")
        .eq("company_id", companyId)
        .eq("enabled", true)
        .is("event_id", null)
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as AudienceRow[]).filter((a) => looksLikePurchaseForEvent(a.name, eventName));
    },
  });

  const linked = linkedQ.data ?? [];
  const suggestions = suggestionsQ.data ?? [];
  const primary = useMemo(() => linked.find((a) => a.is_primary_purchase), [linked]);

  // 4) Criar nova audiência via edge function
  const createMutation = useMutation({
    mutationFn: async () => {
      const isPrimary = !primary;
      const { data, error } = await supabase.functions.invoke(
        "crm-meta-create-purchase-audience",
        { body: { event_id: eventId, retention_days: 180, is_primary: isPrimary } },
      );
      if (error) throw error;
      if (!data?.ok) {
        const code = (data as any)?.error;
        const detail = (data as any)?.detail;
        if (code === "event_no_pixel") {
          throw new Error(
            typeof detail === "string"
              ? detail
              : "O evento não tem Pixel Meta configurado. Vai a Admin → Eventos e preenche o pixel antes de criar a audiência de compradores.",
          );
        }
        throw new Error(typeof detail === "string" ? detail : (code ?? "Falha desconhecida ao criar audiência."));
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.already_exists ? "Audiência já existia — ligação confirmada." : "Audiência de compradores criada.");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["purchase-audiences-linked", eventId] });
      qc.invalidateQueries({ queryKey: ["purchase-audiences-suggestions", companyId, eventName] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });

  // 5) Ligar legada a este evento (e marcar principal se ainda não houver)
  const linkLegacyMutation = useMutation({
    mutationFn: async (row: AudienceRow) => {
      const shouldPromote = !primary;
      const { error } = await (supabase as any)
        .from("meta_custom_audiences")
        .update({ event_id: eventId, is_primary_purchase: shouldPromote })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Audiência ligada a este evento.");
      qc.invalidateQueries({ queryKey: ["purchase-audiences-linked", eventId] });
      qc.invalidateQueries({ queryKey: ["purchase-audiences-suggestions", companyId, eventName] });
    },
    onError: (e: any) => toast.error(`Falha ao ligar: ${e?.message ?? e}`),
  });

  // 6) Tornar principal (cuidado com índice único parcial)
  const setPrimaryMutation = useMutation({
    mutationFn: async (row: AudienceRow) => {
      if (row.is_primary_purchase) return;
      // PASSO 1: desmarcar a principal anterior do mesmo evento (se existir)
      if (primary && primary.id !== row.id) {
        const { error: unsetErr } = await (supabase as any)
          .from("meta_custom_audiences")
          .update({ is_primary_purchase: false })
          .eq("event_id", eventId)
          .eq("is_primary_purchase", true);
        if (unsetErr) throw unsetErr;
      }
      // PASSO 2: marcar a nova
      const { error: setErr } = await (supabase as any)
        .from("meta_custom_audiences")
        .update({ is_primary_purchase: true })
        .eq("id", row.id);
      if (setErr) throw setErr;
    },
    onSuccess: () => {
      toast.success("Principal atualizada.");
      qc.invalidateQueries({ queryKey: ["purchase-audiences-linked", eventId] });
    },
    onError: (e: any) => toast.error(`Falha ao trocar principal: ${e?.message ?? e}`),
  });

  // ── Render ──────────────────────────────────────────────────────
  const loading = linkedQ.isLoading || (eventQ.isFetching && !companyIdProp);
  const noPixel = !metaPixelId && !loading;

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    variant === "card" ? (
      <Card className="space-y-3 p-4">{children}</Card>
    ) : (
      <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">{children}</div>
    );

  const Header = (
    <div className="flex items-start gap-2">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium text-foreground", variant === "inline" ? "text-sm" : "text-sm")}>
          Audiência de compradores (Purchase)
        </div>
        <div className="text-xs text-muted-foreground">
          Será <strong>excluída</strong> automaticamente nos adsets de conversão deste evento.
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Wrapper>
        {Header}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
        </div>
      </Wrapper>
    );
  }

  if (noPixel) {
    return (
      <Wrapper>
        {Header}
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <div>
            Este evento ainda não tem <strong>Pixel Meta</strong> configurado. Preenche o pixel
            na ficha do evento antes de criar a audiência de compradores.
          </div>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {Header}

      {/* Lista das ligadas */}
      {linked.length > 0 ? (
        <div className="space-y-1.5">
          {linked.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                a.is_primary_purchase
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border",
              )}
            >
              {a.is_primary_purchase ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{a.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  ID {a.audience_id_meta}
                </div>
              </div>
              {a.is_primary_purchase ? (
                <Badge variant="outline" className="border-emerald-500/40 text-[9px] uppercase text-emerald-400">
                  Principal (será excluída)
                </Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  disabled={setPrimaryMutation.isPending}
                  onClick={() => setPrimaryMutation.mutate(a)}
                >
                  <Star className="mr-1 h-3 w-3" /> Tornar principal
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 p-2 text-xs text-muted-foreground">
          Sem audiência de compradores ligada a este evento.
        </div>
      )}

      {/* CTA criar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={primary ? "ghost" : "outline"}
          onClick={() => setConfirmOpen(true)}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {primary ? "Criar outra (pixel)" : "Criar audiência de compradores (pixel)"}
        </Button>
      </div>

      {/* Sugestões legadas */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sugestões — audiências que parecem ser deste evento
          </div>
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-foreground">{s.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">ID {s.audience_id_meta}</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                disabled={linkLegacyMutation.isPending}
                onClick={() => linkLegacyMutation.mutate(s)}
              >
                Ligar a este evento
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar audiência de compradores</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Vai ser criada no Meta uma Website Custom Audience com:</p>
                <ul className="ml-4 list-disc space-y-1 text-foreground">
                  <li><span className="text-muted-foreground">Regra:</span> event = <strong>Purchase</strong></li>
                  <li><span className="text-muted-foreground">Pixel:</span> {metaPixelId}</li>
                  <li><span className="text-muted-foreground">Retenção:</span> 180 dias (com prefill)</li>
                  <li>
                    <span className="text-muted-foreground">Estado:</span>{" "}
                    {primary ? "secundária (a principal continua a ser a atual)" : <strong>principal (será excluída nas campanhas)</strong>}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); createMutation.mutate(); }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar e criar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Wrapper>
  );
}
