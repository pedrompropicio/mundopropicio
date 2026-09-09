import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { formatCurrency } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2, Plus, Pencil, Check, X, Paperclip, FileText, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { fetchPartnerExtras, invalidatePartnerExtras, ORIGIN_LABEL, partnerExtraValue, sumPartnerExtras, type PartnerExtraItem } from "@/lib/partner-extras";
import { partnerUsesGrossExpenses } from "@/lib/partner-calc-basis";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";

interface Props {
  partnerId: string;
  partnerName: string;
  eventId: string;
  canEdit: boolean;
  /** `events.partner_calc_basis` — base contratual do evento. */
  calcBasis?: string | null;
  /** `event_partners.expense_includes_iva` — override do sócio (null = herda). */
  expenseIncludesIva?: boolean | null;
}

export function PartnerExtrasPanel({ partnerId, partnerName, eventId, canEdit, calcBasis, expenseIncludesIva }: Props) {
  // Base POR SÓCIO (D-ERP9): override do sócio quando preenchido, senão o do evento.
  const usesGross = partnerUsesGrossExpenses(calcBasis, expenseIncludesIva ?? null);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);

  // Âmbito Master+Subs, como nos restantes blocos de sócios.
  const { data: subEventIds = [] } = useQuery({
    queryKey: ["sub-event-ids", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id").eq("parent_event_id", eventId);
      if (error) throw error;
      return (data ?? []).map((e: any) => e.id as string);
    },
  });

  const allEventIds = [eventId, ...subEventIds];

  const { data: allExtras = [], isLoading } = useQuery({
    queryKey: ["partner-extras-union", allEventIds.join(",")],
    queryFn: () => fetchPartnerExtras(allEventIds),
  });

  const extras = allExtras.filter((e) => e.partner_id === partnerId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: eventId,
        partner_id: partnerId,
        description,
        amount: parseFloat(amount) || 0,
        notes: notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("event_partner_extras").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_partner_extras").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidatePartnerExtras(queryClient);
      toast({ title: editingId ? "Despesa extra atualizada" : "Despesa extra adicionada" });
      resetForm();
    },
    onError: () => toast({ title: "Erro ao guardar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete associated documents first
      const { data: docs } = await supabase.storage
        .from("partner-extra-documents")
        .list(`${id}`);
      if (docs && docs.length > 0) {
        await supabase.storage
          .from("partner-extra-documents")
          .remove(docs.map((d) => `${id}/${d.name}`));
      }
      const { error } = await supabase.from("event_partner_extras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePartnerExtras(queryClient);
      toast({ title: "Despesa extra removida" });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setDescription("");
    setAmount("");
    setNotes("");
  }

  function startEdit(extra: PartnerExtraItem) {
    setEditingId(extra.id);
    setDescription(extra.description);
    setAmount(String(extra.amount));
    setNotes(extra.notes || "");
    setShowForm(true);
  }

  async function openTransaction(transactionId: string) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*, suppliers(name), account_categories(id, name, code, parent_id), events(name)")
      .eq("id", transactionId)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Não foi possível abrir a transação", variant: "destructive" });
      return;
    }
    setEditingTx(data);
  }

  async function handleFileUpload(extraId: string, file: File) {
    const { error } = await uploadToCompanyBucket(
      "partner-extra-documents",
      `${extraId}/${file.name}`,
      file,
      { upsert: true },
    );
    if (error) {
      toast({ title: "Erro ao anexar ficheiro", variant: "destructive" });
    } else {
      toast({ title: "Ficheiro anexado" });
      queryClient.invalidateQueries({ queryKey: ["partner-extra-docs", extraId] });
    }
  }

  const totalExtras = sumPartnerExtras(extras, usesGross);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          Despesas Extras — {partnerName} <HelpTooltip text={helpTexts.partnerExtras} size={12} />
          {totalExtras > 0 && (
            <span className="ml-2 text-warning font-mono">({formatCurrency(totalExtras)})</span>
          )}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            valores {usesGross ? "c/IVA" : "s/IVA"}
          </span>
        </p>
        {canEdit && !showForm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 text-xs">
                <Plus className="mr-1 h-3 w-3" /> Adicionar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowTxForm(true)}>
                Lançar despesa paga pela empresa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowForm(true)}>
                Registar extra sem pagamento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {showForm && (
        <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-secondary/10">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Descrição *</Label>
              <Input className="h-7 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Quarto extra hotel" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor (€) *</Label>
              <Input className="h-7 text-sm" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Input className="h-7 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações opcionais" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={resetForm}>
              <X className="mr-1 h-3 w-3" /> Cancelar
            </Button>
            <Button size="sm" className="h-6 text-xs" onClick={() => saveMutation.mutate()} disabled={!description || !amount || saveMutation.isPending}>
              <Check className="mr-1 h-3 w-3" /> {editingId ? "Atualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div className="space-y-1">
          {extras.map((extra) => (
            <ExtraRow
              key={`${extra.origem}-${extra.id}`}
              extra={extra}
              usesGross={usesGross}
              canEdit={canEdit}
              onEdit={() => startEdit(extra)}
              onDelete={() => { if (window.confirm("Remover esta despesa extra?")) deleteMutation.mutate(extra.id); }}
              onFileUpload={(file) => handleFileUpload(extra.id, file)}
              onOpenTransaction={() => extra.transaction_id && openTransaction(extra.transaction_id)}
            />
          ))}
        </div>
      )}

      {!isLoading && extras.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground italic py-1">
          Nenhum extra registado. Há dois tipos: despesa paga pela empresa que é custo do sócio (nasce numa transação) ou extra sem pagamento (registo manual).
        </p>
      )}

      {showTxForm && (
        <TransactionFormModal
          onClose={() => { setShowTxForm(false); invalidatePartnerExtras(queryClient); }}
          defaults={{ event_id: eventId, type: "expense" }}
          partnerExtraDefault={{ partnerId }}
          titleOverride="Extra do Sócio — despesa paga pela empresa"
        />
      )}

      {editingTx && (
        <TransactionEditModal
          transaction={editingTx}
          canApprove={canEdit}
          onClose={() => { setEditingTx(null); invalidatePartnerExtras(queryClient); }}
        />
      )}
    </div>
  );
}

function ExtraRow({ extra, usesGross, canEdit, onEdit, onDelete, onFileUpload, onOpenTransaction }: {
  extra: PartnerExtraItem;
  usesGross: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFileUpload: (file: File) => void;
  onOpenTransaction: () => void;
}) {
  const isManual = extra.origem === "manual";

  const { data: docs = [] } = useQuery({
    queryKey: ["partner-extra-docs", extra.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("partner-extra-documents")
        .list(extra.id);
      if (error) return [];
      return data || [];
    },
    enabled: isManual,
  });

  async function openDoc(name: string) {
    const { data } = await supabase.storage
      .from("partner-extra-documents")
      .createSignedUrl(`${extra.id}/${name}`, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="flex items-start gap-2 py-1 px-2 rounded bg-secondary/5 hover:bg-secondary/15 transition-colors text-xs group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={isManual ? "outline" : "secondary"} className="text-[10px] px-1 py-0 shrink-0">
            {ORIGIN_LABEL[extra.origem]}
          </Badge>
          <span className="font-medium truncate">{extra.description}</span>
          <span className="font-mono text-warning whitespace-nowrap">{formatCurrency(partnerExtraValue(extra, usesGross))}</span>
        </div>
        {extra.notes && <p className="text-muted-foreground truncate">{extra.notes}</p>}
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {docs.map((doc: any) => (
              <button key={doc.name} onClick={() => openDoc(doc.name)} className="flex items-center gap-0.5 text-primary hover:underline text-[10px]">
                <FileText className="h-2.5 w-2.5" /> {doc.name}
                <ExternalLink className="h-2 w-2" />
              </button>
            ))}
          </div>
        )}
      </div>
      {!isManual && (
        <button
          onClick={onOpenTransaction}
          className="p-1 rounded hover:bg-secondary transition-colors shrink-0 text-primary"
          title="Abrir transação"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}
      {canEdit && isManual && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <label className="p-1 rounded hover:bg-secondary cursor-pointer transition-colors">
            <Paperclip className="h-3 w-3 text-muted-foreground" />
            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} />
          </label>
          <button onClick={onEdit} className="p-1 rounded hover:bg-secondary transition-colors">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
}
