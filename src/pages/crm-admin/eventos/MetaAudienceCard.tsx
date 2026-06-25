import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

interface Props {
  eventId: string;
  eventName: string;
  companyId: string;
  metaPixelId: string | null;
  metaAudienceId: string | null;
  metaAudienceName: string | null;
  disabled?: boolean;
}

export function MetaAudienceCard({
  eventId,
  eventName,
  companyId,
  metaPixelId,
  metaAudienceId,
  metaAudienceName,
  disabled,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Contagem de leads do evento (só para decidir se mostra o aviso)
  const leadsQuery = useQuery({
    queryKey: ["crm-event-leads-count", eventId],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!eventId && !!metaPixelId && !metaAudienceId,
  });

  const proposedName = `[CRM] ViewContent Leads MP - ${eventName.trim()}`;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "crm-meta-create-website-audience",
        {
          body: {
            company_id: companyId,
            name: proposedName,
            pixel_id: metaPixelId,
            retention_days: 180,
            content_category: "event_ticket",
          },
        },
      );
      if (error) throw error;
      if (!data?.ok) {
        const fb = data?.fb_error;
        const msg = typeof fb === "string" ? fb : fb?.message ?? JSON.stringify(fb ?? data);
        throw new Error(msg || "Falha desconhecida ao criar audiência.");
      }
      // Grava no evento
      const { error: upErr } = await (supabase as any)
        .from("events")
        .update({
          meta_audience_id: data.audience_id_meta,
          meta_audience_name: data.name ?? proposedName,
        })
        .eq("id", eventId);
      if (upErr) throw upErr;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Audiência criada: ${data.name ?? proposedName}`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-event", eventId] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });

  // Caso 1: já ligada — info-line
  if (metaAudienceId) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <div className="font-medium text-foreground">Audiência Meta ligada</div>
          <div className="text-xs text-muted-foreground">
            {metaAudienceName ?? metaAudienceId}{" "}
            <span className="opacity-60">· ID {metaAudienceId}</span>
          </div>
        </div>
      </div>
    );
  }

  // Caso 2: sem pixel — não mostra nada (sem pixel não há nada a propor)
  if (!metaPixelId) return null;

  // Caso 3: tem pixel mas sem leads ainda — silêncio
  const total = leadsQuery.data ?? 0;
  if (!total) return null;

  // Caso 4: tem pixel + leads + sem audiência → AVISO
  return (
    <>
      <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <div className="font-medium text-foreground">
              Audiência Meta de retargeting em falta
            </div>
            <p className="text-xs text-muted-foreground">
              Este evento está a captar leads ({total}) e ainda não tem audiência Meta de
              retargeting associada. Criar agora?
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            Criar audiência Meta
          </Button>
        </div>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar Custom Audience no Meta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Vai ser criada no Meta uma audiência de site com:</p>
                <ul className="ml-4 list-disc space-y-1 text-foreground">
                  <li>
                    <span className="text-muted-foreground">Nome:</span>{" "}
                    <span className="font-medium">{proposedName}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Pixel:</span> {metaPixelId}
                  </li>
                  <li>
                    <span className="text-muted-foreground">Regra:</span> ViewContent +
                    content_category = event_ticket
                  </li>
                  <li>
                    <span className="text-muted-foreground">Retenção:</span> 180 dias (com
                    prefill)
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  A audiência fica imediatamente ligada a este evento.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar e criar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
