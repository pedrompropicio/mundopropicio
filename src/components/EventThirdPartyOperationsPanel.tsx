/**
 * Bloco "Operações de terceiros" do painel Apuramentos (épica #146, peça (d)).
 *
 * Lista as operações exploradas por terceiros do evento e, por apuramento, a
 * respectiva participação. O A&B é LIDO ao vivo (bruto e resultado do operador
 * vêm de `computeTotals`); só as operações manuais têm montantes gravados.
 *
 * Edição mínima gated por `manage_bp`: criar operação manual, ligar ao A&B e
 * definir a participação de um apuramento. Nada mais muda no sistema.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, Link2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import type { EngineResult, EngineSettlement } from "@/lib/event-settlement-engine";

const KIND_LABEL: Record<string, string> = {
  ab_bebidas: "A&B — Bebidas",
  ab_alimentos: "A&B — Alimentos",
  bengaleiro: "Bengaleiro",
  merchandising: "Merchandising",
  estacionamento: "Estacionamento",
  outro: "Outro",
};

const MODE_LABEL: Record<string, string> = {
  gross_pct: "% do bruto",
  result_share: "% do resultado do operador",
  per_capita: "Valor por pessoa",
  fee: "Valor fixo",
};

const MANUAL_KINDS = ["bengaleiro", "merchandising", "estacionamento", "outro"];

interface Props {
  eventId: string;
  result: EngineResult;
  settlements: EngineSettlement[];
  rawOperations: any[];
  rawParticipations: any[];
  hasAbModule: boolean;
}

export function EventThirdPartyOperationsPanel({
  eventId,
  result,
  settlements,
  rawOperations,
  rawParticipations,
  hasAbModule,
}: Props) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("manage_bp");
  const qc = useQueryClient();
  const [opOpen, setOpOpen] = useState(false);
  const [ptOpen, setPtOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ kind: "bengaleiro", name: "", gross: "", operator: "", doc: "" });
  const [pt, setPt] = useState({ operation_id: "", settlement_id: "", mode: "gross_pct", value: "" });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["event-third-party-operations", eventId] });
    qc.invalidateQueries({ queryKey: ["event-operation-participations", eventId] });
  };

  const abKinds = rawOperations.filter((o) => o.source === "ab_module").map((o) => o.kind);

  const linkAb = async (kind: "ab_bebidas" | "ab_alimentos") => {
    setSaving(true);
    const { error } = await supabase.from("event_third_party_operations").insert({
      event_id: eventId,
      kind,
      source: "ab_module",
      name: KIND_LABEL[kind],
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Operação ligada ao módulo A&B.");
    refresh();
  };

  const createManual = async () => {
    if (!form.name.trim()) return toast.error("Indica o nome da operação.");
    setSaving(true);
    const { error } = await supabase.from("event_third_party_operations").insert({
      event_id: eventId,
      kind: form.kind,
      source: "manual",
      name: form.name.trim(),
      gross_amount: form.gross === "" ? null : Number(form.gross),
      operator_result: form.operator === "" ? null : Number(form.operator),
      document_ref: form.doc.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Operação criada.");
    setOpOpen(false);
    setForm({ kind: "bengaleiro", name: "", gross: "", operator: "", doc: "" });
    refresh();
  };

  const saveParticipation = async () => {
    if (!pt.operation_id || !pt.settlement_id) return toast.error("Escolhe a operação e o fechamento.");
    if (pt.value === "") return toast.error("Indica a percentagem ou o valor.");
    const isPct = pt.mode === "gross_pct" || pt.mode === "result_share";
    setSaving(true);
    const { error } = await supabase.from("event_operation_participations").upsert(
      {
        operation_id: pt.operation_id,
        settlement_id: pt.settlement_id,
        event_id: eventId,
        mode: pt.mode,
        pct: isPct ? Number(pt.value) : null,
        amount: isPct ? null : Number(pt.value),
      },
      { onConflict: "operation_id,settlement_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Participação gravada.");
    setPtOpen(false);
    setPt({ operation_id: "", settlement_id: "", mode: "gross_pct", value: "" });
    refresh();
  };

  const nodeName = (id: string) => result.nodes.find((n) => n.id === id)?.name ?? "—";

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Operações de terceiros</span>
        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            {hasAbModule && !abKinds.includes("ab_bebidas") && (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => linkAb("ab_bebidas")}>
                <Link2 className="mr-1 h-3.5 w-3.5" /> Ligar ao A&B (bebidas)
              </Button>
            )}
            {hasAbModule && !abKinds.includes("ab_alimentos") && (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => linkAb("ab_alimentos")}>
                <Link2 className="mr-1 h-3.5 w-3.5" /> Ligar ao A&B (alimentos)
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Operação manual
            </Button>
            {rawOperations.length > 0 && (
              <Button size="sm" onClick={() => setPtOpen(true)}>
                Definir participação
              </Button>
            )}
          </div>
        )}
      </div>

      {rawOperations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem operações de terceiros declaradas neste evento.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operação</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Bruto s/IVA</TableHead>
                <TableHead className="text-right">Resultado do operador</TableHead>
                <TableHead>Participações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rawOperations.map((o) => {
                const rows = result.nodes.flatMap((n) =>
                  n.operations.filter((x) => x.operationId === o.id).map((x) => ({ node: n, x })),
                );
                const live = rows[0]?.x;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {o.name}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {KIND_LABEL[o.kind] ?? o.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.source === "ab_module" ? "Módulo A&B (ao vivo)" : "Manual"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {o.source === "ab_module"
                        ? "ao vivo"
                        : formatCurrency(Number(o.gross_amount || 0))}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {o.source === "ab_module"
                        ? "ao vivo"
                        : formatCurrency(Number(o.operator_result || 0))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {rows.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {rows.map(({ node, x }) => (
                            <li key={node.id}>
                              <span className="font-medium">{node.name}</span> · {MODE_LABEL[x.mode]} ·{" "}
                              {formatCurrency(x.value)}
                              {!node.perimeter.isRoot && (
                                <>
                                  {" "}
                                  · já lançado acima {formatCurrency(x.alreadyUpstream)} ·{" "}
                                  <strong>activo adicional {formatCurrency(x.additionalActive)}</strong>
                                </>
                              )}
                              {node.perimeter.isRoot && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · já representado na receita do perímetro
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {live === undefined && null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {result.additionalActivesTotal !== 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Activos adicionais no evento: {formatCurrency(result.additionalActivesTotal)} — receita
          exclusiva dos fechamentos abaixo da raiz.
        </p>
      )}

      {/* Criar operação manual */}
      <Dialog open={opOpen} onOpenChange={setOpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova operação de terceiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Bruto s/IVA</Label>
                <Input type="number" step="0.01" value={form.gross} onChange={(e) => setForm({ ...form, gross: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Resultado do operador</Label>
                <Input type="number" step="0.01" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Documento (opcional)</Label>
              <Input value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpOpen(false)}>Cancelar</Button>
            <Button onClick={createManual} disabled={saving}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Definir participação */}
      <Dialog open={ptOpen} onOpenChange={setPtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Participação de um fechamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Operação</Label>
              <Select value={pt.operation_id} onValueChange={(v) => setPt({ ...pt, operation_id: v })}>
                <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  {rawOperations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fechamento</Label>
              <Select value={pt.settlement_id} onValueChange={(v) => setPt({ ...pt, settlement_id: v })}>
                <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  {settlements.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{nodeName(s.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Modo</Label>
              <Select value={pt.mode} onValueChange={(v) => setPt({ ...pt, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {pt.mode === "gross_pct" || pt.mode === "result_share" ? "Percentagem (0–100)" : "Valor (€)"}
              </Label>
              <Input type="number" step="0.01" value={pt.value} onChange={(e) => setPt({ ...pt, value: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPtOpen(false)}>Cancelar</Button>
            <Button onClick={saveParticipation} disabled={saving}>Gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
