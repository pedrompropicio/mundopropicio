/**
 * Selar / reabrir um fechamento — épica #146 (f) ponto 2.
 *
 * Selar: cria versão do BP ("Selo — <fechamento> — <data>") e grava o resultado
 * do motor em `event_settlements.sealed_snapshot` pela RPC `seal_event_settlement`
 * (que confirma as duas conferências a 0,00 € e a permissão).
 * Selado: marca "Selado em <data> por <utilizador>" e, SÓ PARA A EQUIPA, o valor
 * ao vivo e o desvio. Reabrir exige motivo e fica registado.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import type { EngineResult } from "@/lib/event-settlement-engine";
import {
  buildSealSnapshot,
  canSeal,
  parseSealSnapshot,
  sealDeviation,
} from "@/lib/settlement-seal";

interface Props {
  eventId: string;
  settlement: {
    id: string;
    name: string;
    parent_id: string | null;
    is_sealed: boolean;
    sealed_at?: string | null;
    sealed_by?: string | null;
    sealed_snapshot?: unknown;
    seal_note?: string | null;
  };
  /** Todos os fechamentos do evento (para avisar de dependentes por selar). */
  allSettlements: { id: string; parent_id: string | null; is_sealed: boolean; name: string }[];
  result: EngineResult | null;
  basis: { expenseSource: string; includeOverhead: boolean };
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function SettlementSealControl({ eventId, settlement, allSettlements, result, basis }: Props) {
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canManage = !!(isAdmin || isManager || hasPermission("manage_bp"));
  const queryClient = useQueryClient();

  const [sealOpen, setSealOpen] = useState(false);
  const [note, setNote] = useState("");
  const [unsealOpen, setUnsealOpen] = useState(false);
  const [reason, setReason] = useState("");

  const snapshot = parseSealSnapshot(settlement.sealed_snapshot);
  const deviation = sealDeviation(snapshot, result, settlement.id);
  const seal = canSeal(result);
  const children = allSettlements.filter((s) => s.parent_id === settlement.id);
  const unsealedChildren = children.filter((s) => !s.is_sealed);

  const { data: sealedByName } = useQuery({
    queryKey: ["settlement-sealed-by", settlement.sealed_by],
    enabled: !!settlement.sealed_by && settlement.is_sealed,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", settlement.sealed_by as string)
        .maybeSingle();
      return (data as any)?.full_name || (data as any)?.email || null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event-settlements", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-settlements-fecho", eventId] });
    queryClient.invalidateQueries({ queryKey: ["bp-versions", eventId] });
  };

  const doSeal = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Sem cálculo disponível.");
      const check = canSeal(result);
      if (!check.ok) throw new Error(check.reason);

      // Versão do BP do selo. Em sub-evento de turnê a versão vive no Master, e
      // `create_bp_snapshot` recusa — nesse caso sela-se sem versão.
      let bpVersionId: string | null = null;
      const label = `Selo — ${settlement.name} — ${new Date().toLocaleDateString("pt-PT")}`;
      const snap = await supabase.rpc("create_bp_snapshot" as any, {
        _event_id: eventId,
        _description: label,
      });
      if (!snap.error) bpVersionId = snap.data as string;

      const payload = buildSealSnapshot(result, settlement.id, basis);
      const { error } = await supabase.rpc("seal_event_settlement" as any, {
        _settlement_id: settlement.id,
        _snapshot: payload as any,
        _bp_version_id: bpVersionId,
        _note: note.trim() || null,
      });
      if (error) throw error;
      return bpVersionId;
    },
    onSuccess: (bpVersionId) => {
      invalidate();
      setSealOpen(false);
      setNote("");
      toast({
        title: "Fechamento selado",
        description: bpVersionId
          ? "Foi criada uma versão do Business Plan com o selo."
          : "Selado. A versão do Business Plan vive no evento principal desta turnê.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Não foi possível selar", description: err?.message ?? "Erro", variant: "destructive" }),
  });

  const doUnseal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("unseal_event_settlement" as any, {
        _settlement_id: settlement.id,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setUnsealOpen(false);
      setReason("");
      toast({ title: "Fechamento reaberto", description: "A versão do Business Plan do selo mantém-se." });
    },
    onError: (err: any) =>
      toast({ title: "Não foi possível reabrir", description: err?.message ?? "Erro", variant: "destructive" }),
  });

  if (settlement.is_sealed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="gap-1 text-[10px]">
          <Lock className="h-3 w-3" /> Selado em {fmtDate(settlement.sealed_at)}
          {sealedByName ? ` por ${sealedByName}` : ""}
        </Badge>
        {snapshot && (
          <span className="text-[11px] text-muted-foreground">
            Selado {formatCurrency(snapshot.nodes.find((n) => n.id === settlement.id)?.resultNet ?? 0)} · ao vivo{" "}
            {formatCurrency(result?.nodes.find((n) => n.id === settlement.id)?.resultNet ?? 0)} · desvio{" "}
            <strong className={deviation.total !== 0 ? "text-destructive" : ""}>
              {formatCurrency(deviation.total)}
            </strong>{" "}
            (vista interna)
          </span>
        )}
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setUnsealOpen(true)}>
            <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Reabrir
          </Button>
        )}

        <Dialog open={unsealOpen} onOpenChange={setUnsealOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reabrir "{settlement.name}"</DialogTitle>
              <DialogDescription>
                O motivo é obrigatório e fica registado. A versão do Business Plan criada ao selar mantém-se.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Porque se reabre" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setUnsealOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => doUnseal.mutate()}
                disabled={!reason.trim() || doUnseal.isPending}
              >
                Reabrir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!canManage) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setSealOpen(true)}
        disabled={!seal.ok}
        title={seal.ok ? "Selar este fechamento" : seal.reason}
      >
        <Lock className="mr-1.5 h-3.5 w-3.5" /> Selar
      </Button>

      <Dialog open={sealOpen} onOpenChange={setSealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selar "{settlement.name}"</DialogTitle>
            <DialogDescription>
              Guarda o resultado tal como está hoje e cria uma versão do Business Plan. Depois de selado,
              participantes, linhas marcadas e participações em operações de terceiros ficam bloqueados.
            </DialogDescription>
          </DialogHeader>

          {unsealedChildren.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Há {unsealedChildren.length} fechamento(s) dependente(s) ainda por selar:{" "}
                {unsealedChildren.map((c) => c.name).join(", ")}. Pode selar assim mesmo.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nota do selo (opcional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSealOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => doSeal.mutate()} disabled={doSeal.isPending}>
              Selar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
