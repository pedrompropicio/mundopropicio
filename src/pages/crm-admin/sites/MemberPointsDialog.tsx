import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RULE_LABELS, VOID_LABEL, subjectRef } from "../../../../supabase/functions/newgang-portal/history";

const db = supabase as any;
export const FRAUD_REASONS = ["Conta falsa ou duplicada", "Email temporário", "Automatismo / bot", "Prova de outra pessoa"];

type Row = { id: string; rule_key: string; points: number; ref_id: string; reason: string | null; created_at: string };

/** Extrato de pontos de um membro + "Anular pontos" (motivo obrigatório). refFilter limita às linhas de uma submissão. */
export function MemberPointsDialog({ memberId, title, refFilter, onClose }: { memberId: string; title: string; refFilter?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: ["club_member_points", memberId],
    queryFn: async () => {
      const { data, error } = await db.from("club_points").select("id, rule_key, points, ref_id, reason, created_at")
        .eq("member_id", memberId).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const all = q.data ?? [];
  const voided = new Set(all.filter((r) => r.rule_key === "void").map((r) => r.ref_id));
  const rows = refFilter ? all.filter((r) => subjectRef(r) === refFilter) : all;
  const total = all.reduce((s, r) => s + r.points, 0);
  const canVoid = (r: Row) => r.rule_key !== "void" && r.points > 0 && !voided.has(`${r.rule_key}:${r.ref_id}`);
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("club_points_void", { p_points: [...picked], p_reason: reason.trim() });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} movimento(s) anulado(s)`);
      setPicked(new Set()); setReason("");
      qc.invalidateQueries({ queryKey: ["club_member_points", memberId] });
      qc.invalidateQueries({ queryKey: ["newgang_ranking"] });
      qc.invalidateQueries({ queryKey: ["club_mission_queue"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pontos — {title} · total {total}</DialogTitle></DialogHeader>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto text-sm">
          {rows.length === 0 && <p className="text-muted-foreground">Sem movimentos.</p>}
          {rows.map((r) => (
            <label key={r.id} className="flex items-center gap-2 border-b border-border/40 py-1">
              <Checkbox disabled={!canVoid(r)} checked={picked.has(r.id)} aria-label="Selecionar"
                onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
              <span className="flex-1">
                {r.rule_key === "void" ? VOID_LABEL : RULE_LABELS[r.rule_key] ?? r.rule_key}
                {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                {r.rule_key !== "void" && !canVoid(r) && <span className="text-muted-foreground"> · anulado</span>}
              </span>
              <span className={r.points < 0 ? "text-destructive" : ""}>{r.points > 0 ? `+${r.points}` : r.points}</span>
              <span className="w-32 text-right text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {FRAUD_REASONS.map((x) => <Button key={x} size="sm" variant={reason === x ? "default" : "outline"} onClick={() => setReason(x)}>{x}</Button>)}
        </div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da anulação (obrigatório, visível para o membro)" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button variant="destructive" disabled={!picked.size || !reason.trim() || run.isPending} onClick={() => run.mutate()}>Anular pontos ({picked.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
