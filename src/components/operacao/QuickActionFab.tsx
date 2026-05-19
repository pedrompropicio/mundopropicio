import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, LayoutGrid, ListChecks, Camera, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewFrenteDialog } from "./NewFrenteDialog";
import { NewEtapaDialog } from "./NewEtapaDialog";
import { RegistroSheet } from "./RegistroSheet";
import { FrentePickerDialog } from "./FrentePickerDialog";
import { useCurrentOperacaoMode, useOperacaoMode } from "@/hooks/useOperacaoMode";

type Action = "frente" | "etapa" | "registro" | "chamado";

/**
 * Floating Action Button with a 4-option menu replacing the old "+ Chamado" FAB.
 * Order: Planejamento (Frente) | Etapa | Registro | Chamado (sempre por último, esmaecido em planning/montagem).
 */
export function QuickActionFab() {
  const { user, hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  // dialog state when picker needed before opening child
  const [pickFor, setPickFor] = useState<null | "etapa" | "registro">(null);
  const [pickedFrenteId, setPickedFrenteId] = useState<string | null>(null);

  // ---- context-aware: descobrir frente/etapa atual a partir do URL ------
  const onFrenteRoute = location.pathname.match(/^\/operacao\/frente\/([^/]+)/);
  const onEtapaRoute = location.pathname.match(/^\/operacao\/etapa\/([^/]+)/);
  const ctxFrenteId = onFrenteRoute?.[1] ?? null;
  const ctxEtapaId = onEtapaRoute?.[1] ?? null;

  // load context (frente da etapa, ou frente direta) p/ pegar event_id e checar lead/mode
  const { data: ctx } = useQuery({
    queryKey: ["fab-ctx", ctxFrenteId, ctxEtapaId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let frenteId = ctxFrenteId;
      let etapaFrenteId: string | null = null;
      if (ctxEtapaId) {
        const { data } = await supabase.from("operacao_etapas").select("frente_id").eq("id", ctxEtapaId).maybeSingle();
        etapaFrenteId = data?.frente_id ?? null;
        frenteId = frenteId ?? etapaFrenteId;
      }
      let frenteEventId: string | null = null;
      let isCurrentLeadAny = false;
      if (frenteId) {
        const { data: fr } = await supabase.from("operacao_frentes")
          .select("event_id,current_lead_id").eq("id", frenteId).maybeSingle();
        frenteEventId = fr?.event_id ?? null;
      }
      // is user lead in qualquer frente? (permissão para criar etapas)
      const { data: leadAny } = await supabase.from("operacao_frentes")
        .select("id").eq("current_lead_id", user!.id).limit(1);
      isCurrentLeadAny = (leadAny ?? []).length > 0;
      return { frenteId, etapaId: ctxEtapaId, eventId: frenteEventId, isCurrentLeadAny };
    },
  });

  const ctxMode = useOperacaoMode(ctx?.eventId ?? undefined);
  const fallbackMode = useCurrentOperacaoMode();
  const mode = ctxMode ?? fallbackMode;
  const chamadoDimmed = mode === "planning" || mode === "montagem";

  const canFrente = isAdmin || hasPermission("manage_operacao_frentes");
  const canEtapa = isAdmin || hasPermission("manage_operacao_etapas") || !!ctx?.isCurrentLeadAny;
  const canRegistro = isAdmin || hasPermission("register_operacao");
  const canChamado = isAdmin || hasPermission("open_chamado");

  const hideFab = location.pathname.includes("/chamado/novo");
  if (hideFab) return null;

  const pick = (a: Action) => {
    setOpen(false);
    if (a === "frente") return setAction("frente");
    if (a === "etapa") {
      if (ctx?.frenteId) { setPickedFrenteId(ctx.frenteId); setAction("etapa"); }
      else setPickFor("etapa");
      return;
    }
    if (a === "registro") {
      // dentro de etapa/frente -> abrir directo, senão pedir frente
      if (ctx?.frenteId || ctx?.etapaId) { setAction("registro"); }
      else setPickFor("registro");
      return;
    }
    if (a === "chamado") return navigate("/operacao/chamado/novo");
  };

  // companyId p/ NewEtapaDialog
  const { data: pickedFrenteCtx } = useQuery({
    queryKey: ["fab-picked-frente", pickedFrenteId],
    enabled: !!pickedFrenteId,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes")
        .select("id,company_id").eq("id", pickedFrenteId!).maybeSingle();
      return data;
    },
  });

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full shadow-lg p-0"
        aria-label="Ações rápidas"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Nova...</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <FabOption icon={LayoutGrid} label="Zona/Serviço" hint="Planejar" disabled={!canFrente}
              onClick={() => pick("frente")} />
            <FabOption icon={ListChecks} label="Etapa" hint="Tarefa" disabled={!canEtapa}
              onClick={() => pick("etapa")} />
            <FabOption icon={Camera} label="Registro" hint="Documentar" disabled={!canRegistro}
              onClick={() => pick("registro")} />
            <FabOption icon={AlertCircle} label="Chamado" hint={chamadoDimmed ? "Durante o evento" : "Urgência"}
              disabled={!canChamado} dimmed={chamadoDimmed}
              tooltip={chamadoDimmed ? "Disponível durante o evento" : undefined}
              onClick={() => pick("chamado")} />
          </div>
        </SheetContent>
      </Sheet>

      {action === "frente" && <NewFrenteDialog onClose={() => setAction(null)} />}

      {action === "etapa" && pickedFrenteId && pickedFrenteCtx && (
        <NewEtapaDialog
          frenteId={pickedFrenteId}
          companyId={pickedFrenteCtx.company_id}
          onClose={() => { setAction(null); setPickedFrenteId(null); }}
        />
      )}

      {action === "registro" && (
        <RegistroSheet
          open
          initialFrenteId={ctx?.frenteId ?? pickedFrenteId ?? undefined}
          initialEtapaId={ctx?.etapaId ?? undefined}
          onClose={() => { setAction(null); setPickedFrenteId(null); }}
        />
      )}

      {pickFor && (
        <FrentePickerDialog
          title={pickFor === "etapa" ? "Em que Zona/Serviço?" : "Zona/Serviço do registo"}
          onClose={() => setPickFor(null)}
          onPick={(id) => {
            setPickedFrenteId(id);
            const nextAction = pickFor;
            setPickFor(null);
            setAction(nextAction === "etapa" ? "etapa" : "registro");
          }}
        />
      )}
    </>
  );
}

function FabOption({
  icon: Icon, label, hint, disabled, dimmed, tooltip, onClick,
}: {
  icon: any; label: string; hint?: string; disabled?: boolean; dimmed?: boolean; tooltip?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-4 rounded-xl border bg-card transition",
        "active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
        dimmed && !disabled && "opacity-50",
      )}
    >
      <Icon className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}
