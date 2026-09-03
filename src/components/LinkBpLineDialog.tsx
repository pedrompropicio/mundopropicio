/**
 * D1 + D8 — diálogo "Vincular ao BP".
 *
 * Aparece quando se tenta APROVAR uma despesa de um evento gerido `with_bp`
 * sem `forecast_id`. Permite escolher uma linha existente da rubrica ou (com
 * `manage_bp`) criar a linha ali mesmo. Ao confirmar, grava o `forecast_id` e
 * só depois aprova — uma operação do ponto de vista do utilizador.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Link2 } from "lucide-react";

const FORMALIDADE_LABEL: Record<string, string> = {
  estimado: "Estimado",
  negociacao: "Em negociação",
  fechado: "Fechado",
  pago_parcial: "Pago parcial",
  pago_total: "Pago total",
};

type Tx = {
  id: string;
  description?: string | null;
  amount?: number | null;
  iva_rate?: number | string | null;
  event_id?: string | null;
  category_id?: string | null;
  events?: { name?: string | null } | null;
  account_categories?: { code?: string | null; name?: string | null } | null;
};

interface Props {
  transaction: Tx;
  onClose: () => void;
  /** Chamado depois de o forecast_id estar gravado — deve aprovar a transação. */
  onLinked: (transactionId: string) => void;
  /**
   * Modo "só escolher": a transação ainda não existe (ex.: geração de cachê fixo).
   * Não grava nada em `transactions`; devolve o forecast_id escolhido/criado em
   * `onPicked` e o chamador é que cria a transação já com `forecast_id`.
   */
  pickOnly?: boolean;
  onPicked?: (forecastId: string) => void;
}

export default function LinkBpLineDialog({ transaction, onClose, onLinked, pickOnly, onPicked }: Props) {
  const { hasPermission } = useAuth();
  const canManageBp = hasPermission("manage_bp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDesc, setNewDesc] = useState(transaction.description ?? "");
  const [newAmount, setNewAmount] = useState(String(Number(transaction.amount ?? 0)));
  const [newIva, setNewIva] = useState(String(Number(transaction.iva_rate ?? 0)));

  const { data: lines = [], isLoading, refetch } = useQuery({
    queryKey: ["bp-lines-for-link", transaction.event_id, transaction.category_id],
    enabled: !!transaction.event_id && !!transaction.category_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, description, specification, amount, iva_rate, formalidade")
        .eq("event_id", transaction.event_id as string)
        .eq("category_id", transaction.category_id as string)
        .eq("type", "expense")
        .is("version_id", null)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoryLabel = useMemo(() => {
    const c = transaction.account_categories;
    return c ? `${c.code ?? ""} ${c.name ?? ""}`.trim() : "—";
  }, [transaction.account_categories]);

  const linkAndApprove = async (forecastId: string) => {
    setSaving(true);
    try {
      if (pickOnly) {
        onPicked?.(forecastId);
        onClose();
        return;
      }
      const { error } = await supabase
        .from("transactions")
        .update({ forecast_id: forecastId } as any)
        .eq("id", transaction.id);
      if (error) throw error;
      onLinked(transaction.id);
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao vincular ao BP", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const amount = Number(String(newAmount).replace(",", "."));
    if (!newDesc.trim()) {
      toast({ title: "Descrição obrigatória", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("batch_insert_event_forecasts" as any, {
        _event_id: transaction.event_id,
        _version_id: null,
        _inserts: [
          {
            type: "expense",
            description: newDesc.trim(),
            specification: null,
            category_id: transaction.category_id,
            amount,
            iva_rate: Number(String(newIva).replace(",", ".")) || 0,
            formalidade: "estimado",
            notes: null,
          },
        ],
      } as any);
      if (error) throw error;
      const newId = ((data as any)?.ids ?? [])[0] as string | undefined;
      if (!newId) throw new Error("A linha foi criada mas não devolveu id.");
      await refetch();
      await linkAndApprove(newId);
    } catch (err: any) {
      toast({ title: "Erro ao criar linha de BP", description: err.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular ao BP</DialogTitle>
          <DialogDescription>
            Este evento é gerido com BP: a despesa precisa de uma linha do Business Plan antes de ser aprovada.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
          <div><span className="text-muted-foreground">Evento:</span> {transaction.events?.name ?? "—"}</div>
          <div><span className="text-muted-foreground">Rubrica:</span> {categoryLabel}</div>
          <div><span className="text-muted-foreground">Transação:</span> {transaction.description ?? "—"} · {formatCurrency(Number(transaction.amount ?? 0))}</div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A carregar linhas do BP…
          </div>
        ) : lines.length > 0 ? (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(lines as any[]).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                  selectedId === l.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{l.description}</span>
                  <span className="tabular-nums">{formatCurrency(Number(l.amount ?? 0))}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {l.specification && <span>{l.specification}</span>}
                  <Badge variant="outline" className="text-[10px]">
                    {FORMALIDADE_LABEL[l.formalidade ?? "estimado"] ?? l.formalidade}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        ) : canManageBp ? (
          <p className="text-sm text-muted-foreground">
            Esta rubrica não tem nenhuma linha de BP neste evento. Cria a linha abaixo.
          </p>
        ) : (
          <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            Esta rubrica não tem nenhuma linha de BP neste evento e não tens permissão para criar linhas.
            Pede a alguém com permissão de BP para criar a linha primeiro.
          </p>
        )}

        {canManageBp && (creating || lines.length === 0) && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Criar linha de BP</div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_100px]">
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (base)</Label>
                <Input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">IVA %</Label>
                <Input value={newIva} onChange={(e) => setNewIva(e.target.value)} inputMode="decimal" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          {canManageBp && lines.length > 0 && !creating && (
            <Button variant="outline" onClick={() => setCreating(true)} disabled={saving}>
              <Plus className="mr-1 h-4 w-4" /> Criar nova linha
            </Button>
          )}
          {canManageBp && (creating || lines.length === 0) ? (
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              {pickOnly ? "Criar e usar linha" : "Criar, vincular e aprovar"}
            </Button>
          ) : (
            <Button onClick={() => selectedId && linkAndApprove(selectedId)} disabled={!selectedId || saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              {pickOnly ? "Usar esta linha" : "Vincular e aprovar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
