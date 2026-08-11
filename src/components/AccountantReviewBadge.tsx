import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { respondAccountantReview, type AccountantReview } from "@/lib/accountant-reviews";
import { format } from "date-fns";

function useReview(transactionId: string) {
  return useQuery({
    queryKey: ["accountant-review", transactionId],
    enabled: !!transactionId,
    queryFn: async (): Promise<AccountantReview | null> => {
      const { data, error } = await (supabase as any)
        .from("accountant_transaction_reviews")
        .select("*")
        .eq("transaction_id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return (data as AccountantReview) ?? null;
    },
  });
}

/** Indicador discreto na linha da lista de Transações. */
export function AccountantReviewRowBadge({ transactionId }: { transactionId: string }) {
  const { data } = useReview(transactionId);
  if (!data) return null;
  if (data.status === "conferido") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500 cursor-help">
            <CheckCircle2 className="h-3 w-3" /> Conferido
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">Conferido pela contabilista{data.reviewed_at ? ` em ${format(new Date(data.reviewed_at), "dd/MM/yyyy")}` : ""}.</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 cursor-help">
          <AlertTriangle className="h-3 w-3" /> Pendência contabilista
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-xs space-y-1">
        <p className="font-medium">Observação da contabilista</p>
        <p>{data.note || "—"}</p>
        {data.response_note && (
          <>
            <p className="font-medium pt-1">Resposta do financeiro</p>
            <p>{data.response_note}</p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Bloco no TransactionEditModal: observação + resposta editável. */
export function AccountantReviewBlock({ transactionId }: { transactionId: string }) {
  const { data } = useReview(transactionId);
  const { user, isAdmin, isManager, hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const canRespond = isAdmin || isManager || hasPermission("manage_transactions");

  const respond = useMutation({
    mutationFn: async () => {
      if (!data || !user) return;
      const text = (draft ?? data.response_note ?? "").trim();
      if (!text) throw new Error("Escreve a resposta.");
      await respondAccountantReview({ reviewId: data.id, responseNote: text, userId: user.id });
    },
    onSuccess: () => {
      toast({ title: "Resposta registada" });
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["accountant-review", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["accountant-pendencies"] });
      queryClient.invalidateQueries({ queryKey: ["accountant-pendencies-count"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" }),
  });

  if (!data) return null;

  const isPending = data.status === "pendente";

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-2 ${isPending ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        {isPending ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        {isPending ? "Pendência da contabilista" : "Conferido pela contabilista"}
        {data.reviewed_at && <span className="font-normal text-muted-foreground">· {format(new Date(data.reviewed_at), "dd/MM/yyyy HH:mm")}</span>}
      </div>
      {data.note && <p className="whitespace-pre-wrap">{data.note}</p>}
      {data.response_note && (
        <div className="rounded bg-background/60 px-2 py-1.5">
          <p className="flex items-center gap-1 font-medium"><MessageSquare className="h-3 w-3" /> Resposta do financeiro</p>
          <p className="whitespace-pre-wrap">{data.response_note}</p>
        </div>
      )}
      {isPending && canRespond && (
        <div className="space-y-1.5">
          <Textarea
            value={draft ?? data.response_note ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Responder à contabilista…"
            className="min-h-[60px] text-xs"
          />
          <Button size="sm" onClick={() => respond.mutate()} disabled={respond.isPending}>
            {respond.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {data.response_note ? "Atualizar resposta" : "Responder"}
          </Button>
        </div>
      )}
    </div>
  );
}
