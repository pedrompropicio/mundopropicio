/**
 * Gestão dos apuramentos de um evento — épica #146 (e2) ponto 2.
 *
 * Vive na aba "Sócios", ao lado dos participantes. Cria, renomeia, reordena e
 * apaga apuramentos FILHOS; a raiz é criada pela própria aba Sócios e não é
 * apagável aqui.
 *
 * Guardas do lado da base de dados (a UI só mostra o erro):
 *  • `prevent_delete_event_settlement_with_lines` recusa apagar um apuramento
 *    com linhas de BP ou transações marcadas;
 *  • `event_operation_participations.settlement_id` é ON DELETE RESTRICT;
 *  • apuramento selado não aceita alterações.
 * Aqui recusamos também apagar um apuramento que ainda tenha participantes.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Plus, Trash2, Pencil, Check, X, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type ParentShareBasis = "net_result" | "net_result_gross_expenses";

interface SettlementRow {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  is_sealed: boolean;
  parent_share_pct: number | null;
  parent_share_basis: ParentShareBasis | null;
  notes: string | null;
}

interface Props {
  eventId: string;
  canEdit: boolean;
}

const BASIS_LABEL: Record<ParentShareBasis, string> = {
  net_result: "resultado com despesas s/IVA",
  net_result_gross_expenses: "resultado com despesas c/IVA",
};

/** Tooltip único para tudo o que o selo bloqueia. */
const SEALED_HINT = "Fechamento selado: reabra-o para poder alterar.";

export function EventSettlementsManager({ eventId, canEdit }: Props) {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [pct, setPct] = useState("");
  const [basis, setBasis] = useState<ParentShareBasis>("net_result");
  const [position, setPosition] = useState("");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPct, setEditPct] = useState("");
  const [editBasis, setEditBasis] = useState<ParentShareBasis>("net_result");
  const [editNotes, setEditNotes] = useState("");

  const { data: settlements = [] } = useQuery({
    queryKey: ["event-settlements", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlements")
        .select("id, name, parent_id, position, is_sealed, parent_share_pct, parent_share_basis, notes")
        .eq("event_id", eventId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SettlementRow[];
    },
  });

  const { data: participantCounts = {} } = useQuery({
    queryKey: ["event-settlement-participant-counts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlement_participants")
        .select("settlement_id")
        .eq("event_id", eventId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        counts[r.settlement_id] = (counts[r.settlement_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event-settlements", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-settlements-fecho", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-settlement-participant-counts", eventId] });
  };

  const fail = (err: any) =>
    toast({ title: "Não foi possível", description: err?.message ?? "Erro", variant: "destructive" });

  const createChild = useMutation({
    mutationFn: async () => {
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("company_id")
        .eq("id", eventId)
        .single();
      if (evErr) throw evErr;
      const maxPos = settlements.reduce((m, s) => Math.max(m, Number(s.position || 0)), 0);
      const { error } = await supabase.from("event_settlements").insert({
        event_id: eventId,
        company_id: ev.company_id,
        name: name.trim(),
        parent_id: parentId,
        parent_share_pct: Number(pct),
        parent_share_basis: basis,
        position: position ? Number(position) : maxPos + 1,
        notes: notes.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setName("");
      setParentId("");
      setPct("");
      setBasis("net_result");
      setPosition("");
      setNotes("");
      toast({ title: "Fechamento criado" });
    },
    onError: fail,
  });

  const updateChild = useMutation({
    mutationFn: async (row: SettlementRow) => {
      const patch: Record<string, unknown> = { name: editName.trim(), notes: editNotes.trim() || null };
      if (row.parent_id) {
        patch.parent_share_pct = Number(editPct);
        patch.parent_share_basis = editBasis;
      }
      const { error } = await supabase.from("event_settlements").update(patch as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast({ title: "Fechamento atualizado" });
    },
    onError: fail,
  });

  const move = useMutation({
    mutationFn: async ({ row, dir }: { row: SettlementRow; dir: -1 | 1 }) => {
      const siblings = settlements
        .filter((s) => (s.parent_id ?? null) === (row.parent_id ?? null))
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
      const idx = siblings.findIndex((s) => s.id === row.id);
      const other = siblings[idx + dir];
      if (!other) return;
      const a = await supabase
        .from("event_settlements")
        .update({ position: Number(other.position || 0) })
        .eq("id", row.id);
      if (a.error) throw a.error;
      const b = await supabase
        .from("event_settlements")
        .update({ position: Number(row.position || 0) })
        .eq("id", other.id);
      if (b.error) throw b.error;
    },
    onSuccess: invalidate,
    onError: fail,
  });

  const removeChild = useMutation({
    mutationFn: async (row: SettlementRow) => {
      if ((participantCounts as Record<string, number>)[row.id]) {
        throw new Error("Este fechamento ainda tem participantes. Remove-os primeiro.");
      }
      const { error } = await supabase.from("event_settlements").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Fechamento apagado" });
    },
    onError: fail,
  });

  const startEdit = (s: SettlementRow) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPct(s.parent_share_pct != null ? String(s.parent_share_pct) : "");
    setEditBasis((s.parent_share_basis ?? "net_result") as ParentShareBasis);
    setEditNotes(s.notes ?? "");
  };

  const rootExists = settlements.some((s) => !s.parent_id);

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Fechamentos do evento</p>
          <span className="text-xs text-muted-foreground">({settlements.length})</span>
        </div>
        {canEdit && rootExists && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo fechamento
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {settlements.map((s) => {
          const isEditing = editingId === s.id;
          const isRoot = !s.parent_id;
          const parent = settlements.find((p) => p.id === s.parent_id);
          return (
            <li
              key={s.id}
              className={`rounded-lg border border-border/50 p-3 text-sm ${isRoot ? "" : "ml-4"}`}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input className="h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    {!isRoot && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Quota do fechamento acima (opcional)</Label>
                          <Input
                            className="h-8"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0"
                            value={editPct}
                            onChange={(e) => setEditPct(e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Deixa vazio (0%) se este fechamento vive só das suas próprias receitas e
                            despesas marcadas.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Base da quota</Label>
                          <Select value={editBasis} onValueChange={(v) => setEditBasis(v as ParentShareBasis)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="net_result">{BASIS_LABEL.net_result}</SelectItem>
                              <SelectItem value="net_result_gross_expenses">
                                {BASIS_LABEL.net_result_gross_expenses}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notas</Label>
                    <Input className="h-8" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateChild.mutate(s)}
                      disabled={!editName.trim() || updateChild.isPending}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {isRoot ? s.name : `↳ ${s.name}`}
                  </span>
                  {isRoot && <Badge variant="secondary" className="text-[10px]">raiz</Badge>}
                  {s.is_sealed && <Badge className="text-[10px]">Selado</Badge>}
                  {!isRoot && (
                    <Badge variant="outline" className="text-[10px]">
                      {Number(s.parent_share_pct ?? 0)}% de {parent?.name ?? "—"} ·{" "}
                      {BASIS_LABEL[(s.parent_share_basis ?? "net_result") as ParentShareBasis]}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {(participantCounts as Record<string, number>)[s.id] ?? 0} participante(s)
                  </span>
                  {s.notes && <span className="text-xs text-muted-foreground">· {s.notes}</span>}
                  {canEdit && (
                    <span
                      className="ml-auto flex items-center gap-1"
                      title={s.is_sealed ? SEALED_HINT : undefined}
                    >
                      {!isRoot && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={s.is_sealed} onClick={() => move.mutate({ row: s, dir: -1 })}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={s.is_sealed} onClick={() => move.mutate({ row: s, dir: 1 })}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={s.is_sealed} onClick={() => startEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!isRoot && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeChild.mutate(s)}
                          disabled={s.is_sealed || removeChild.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/10 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Acerto com o promotor local" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fechamento acima</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {settlements
                    .filter((s) => !s.is_sealed)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quota do fechamento acima (opcional)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Deixa vazio (0%) se este fechamento vive só das suas próprias receitas e despesas
                marcadas.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base da quota</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as ParentShareBasis)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="net_result">{BASIS_LABEL.net_result}</SelectItem>
                  <SelectItem value="net_result_gross_expenses">{BASIS_LABEL.net_result_gross_expenses}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Posição (opcional)</Label>
              <Input type="number" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="No fim" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => createChild.mutate()}
              disabled={!name.trim() || !parentId || !pct || createChild.isPending}
            >
              Criar fechamento
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted-foreground">
        Cada fechamento é estanque: recebe a quota do fechamento acima e acerta só com
        os seus participantes. A casa (Mundo Propício) existe apenas no fechamento raiz.
      </p>
    </div>
  );
}
