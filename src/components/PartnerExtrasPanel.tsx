import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Pencil, Check, X, Paperclip, FileText, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  partnerId: string;
  partnerName: string;
  eventId: string;
  canEdit: boolean;
}

export function PartnerExtrasPanel({ partnerId, partnerName, eventId, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: extras = [], isLoading } = useQuery({
    queryKey: ["partner-extras", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partner_extras")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["partner-extras", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-extras-all"] });
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
      queryClient.invalidateQueries({ queryKey: ["partner-extras", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-extras-all"] });
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

  function startEdit(extra: any) {
    setEditingId(extra.id);
    setDescription(extra.description);
    setAmount(String(extra.amount));
    setNotes(extra.notes || "");
    setShowForm(true);
  }

  async function handleFileUpload(extraId: string, file: File) {
    const path = `${extraId}/${file.name}`;
    const { error } = await supabase.storage
      .from("partner-extra-documents")
      .upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Erro ao anexar ficheiro", variant: "destructive" });
    } else {
      toast({ title: "Ficheiro anexado" });
      queryClient.invalidateQueries({ queryKey: ["partner-extra-docs", extraId] });
    }
  }

  const totalExtras = extras.reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Despesas Extras — {partnerName}
          {totalExtras > 0 && (
            <span className="ml-2 text-warning font-mono">({formatCurrency(totalExtras)})</span>
          )}
        </p>
        {canEdit && !showForm && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3 w-3" /> Adicionar
          </Button>
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
          {extras.map((extra: any) => (
            <ExtraRow
              key={extra.id}
              extra={extra}
              canEdit={canEdit}
              onEdit={() => startEdit(extra)}
              onDelete={() => { if (window.confirm("Remover esta despesa extra?")) deleteMutation.mutate(extra.id); }}
              onFileUpload={(file) => handleFileUpload(extra.id, file)}
            />
          ))}
        </div>
      )}

      {!isLoading && extras.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground italic py-1">Nenhuma despesa extra registada.</p>
      )}
    </div>
  );
}

function ExtraRow({ extra, canEdit, onEdit, onDelete, onFileUpload }: {
  extra: any;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFileUpload: (file: File) => void;
}) {
  const { data: docs = [] } = useQuery({
    queryKey: ["partner-extra-docs", extra.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("partner-extra-documents")
        .list(extra.id);
      if (error) return [];
      return data || [];
    },
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
          <span className="font-medium truncate">{extra.description}</span>
          <span className="font-mono text-warning whitespace-nowrap">{formatCurrency(Number(extra.amount))}</span>
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
      {canEdit && (
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
