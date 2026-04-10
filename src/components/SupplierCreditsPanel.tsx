import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { ChevronDown, Plus, CreditCard, Calendar, Trash2, Paperclip, FileText, Loader2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  supplierId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function SupplierCreditsPanel({ supplierId, isOpen, onToggle }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingCredit, setEditingCredit] = useState<any>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["supplier-credits", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_credits" as any)
        .select("*, events(name)")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: isOpen,
  });

  const activeCredits = credits.filter((c: any) => c.status === "active");
  const exhaustedCredits = credits.filter((c: any) => c.status !== "active");
  const totalAvailable = activeCredits.reduce((s: number, c: any) => s + (Number(c.amount) - Number(c.used_amount)), 0);

  const handleEdit = (credit: any) => {
    setEditingCredit(credit);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCredit(null);
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        <CreditCard className="h-3 w-3" />
        {isOpen ? "Recolher créditos" : "Ver créditos"}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium rounded-full bg-primary/10 text-primary px-2.5 py-1">
                  Disponível: {formatCurrency(totalAvailable)}
                </span>
                <button
                  onClick={() => { setEditingCredit(null); setShowForm(true); }}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                >
                  <Plus className="h-3 w-3" /> Novo crédito
                </button>
              </div>

              {credits.length === 0 && !showForm && (
                <p className="text-xs text-muted-foreground">Nenhum crédito registado.</p>
              )}

              {showForm && (
                <CreditForm
                  supplierId={supplierId}
                  userName={user?.user_metadata?.full_name ?? user?.email ?? "sistema"}
                  existingCredit={editingCredit}
                  onClose={handleCloseForm}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["supplier-credits", supplierId] });
                    handleCloseForm();
                  }}
                />
              )}

              {activeCredits.map((c: any) => (
                <CreditLine key={c.id} credit={c} supplierId={supplierId} onEdit={() => handleEdit(c)} />
              ))}

              {exhaustedCredits.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Esgotados / Expirados</p>
                  {exhaustedCredits.map((c: any) => (
                    <CreditLine key={c.id} credit={c} supplierId={supplierId} onEdit={() => handleEdit(c)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CreditLine({ credit, supplierId, onEdit }: { credit: any; supplierId: string; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const remaining = Number(credit.amount) - Number(credit.used_amount);
  const isActive = credit.status === "active";
  const isExpired = credit.valid_until && (() => {
    const [y, m, d] = credit.valid_until.split("-").map(Number);
    const now = new Date();
    const todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const expiryNum = y * 10000 + m * 100 + d;
    return expiryNum < todayNum;
  })();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (Number(credit.used_amount) > 0) throw new Error("Não é possível eliminar crédito já utilizado");
      const { error } = await supabase.from("supplier_credits" as any).delete().eq("id", credit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-credits", supplierId] });
      toast.success("Crédito eliminado");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop();
      const path = `${supplierId}/${credit.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("supplier-credit-documents").upload(path, file);
      if (uploadErr) throw uploadErr;
      await supabase.from("supplier_credits" as any).update({ file_url: path }).eq("id", credit.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-credits", supplierId] });
      toast.success("Ficheiro anexado");
    },
    onError: (err: any) => toast.error("Erro ao anexar: " + err.message),
  });

  const handleViewFile = async () => {
    if (!credit.file_url) return;
    const { data } = await supabase.storage.from("supplier-credit-documents").createSignedUrl(credit.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Erro ao abrir ficheiro");
  };

  return (
    <div className={`rounded-lg px-3 py-2 text-xs space-y-1 ${isActive ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{credit.reason || "Crédito"}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            {formatCurrency(remaining)} / {formatCurrency(Number(credit.amount))}
          </span>
          <button onClick={onEdit} className="text-muted-foreground hover:text-primary" title="Editar crédito">
            <Pencil className="h-3 w-3" />
          </button>
          {credit.file_url ? (
            <button onClick={handleViewFile} className="text-primary hover:text-primary/80" title="Ver anexo">
              <FileText className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground hover:text-primary"
              title="Anexar ficheiro"
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            </button>
          )}
          {Number(credit.used_amount) === 0 && (
            <button onClick={() => deleteMutation.mutate()} className="text-muted-foreground hover:text-destructive" title="Eliminar">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-muted-foreground">
        {credit.document_ref && <span>Doc: {credit.document_ref}</span>}
        {credit.events?.name && <span>Origem: {credit.events.name}</span>}
        {credit.valid_until && (
          <span className={isExpired ? "text-destructive font-medium" : ""}>
            <Calendar className="inline h-3 w-3 mr-0.5" />
            {isExpired ? "Expirado " : "Válido até "}
            {format(new Date(credit.valid_until), "dd/MM/yyyy")}
          </span>
        )}
        <span>Criado: {format(new Date(credit.created_at), "dd/MM/yyyy")}</span>
      </div>
      {credit.notes && <p className="text-muted-foreground/70 italic">{credit.notes}</p>}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function CreditForm({
  supplierId,
  userName,
  existingCredit,
  onClose,
  onSuccess,
}: {
  supplierId: string;
  userName: string;
  existingCredit?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!existingCredit;
  const [amount, setAmount] = useState(isEditing ? String(existingCredit.amount) : "");
  const [reason, setReason] = useState(isEditing ? (existingCredit.reason ?? "") : "");
  const [documentRef, setDocumentRef] = useState(isEditing ? (existingCredit.document_ref ?? "") : "");
  const [validUntil, setValidUntil] = useState(isEditing ? (existingCredit.valid_until ?? "") : "");
  const [notes, setNotes] = useState(isEditing ? (existingCredit.notes ?? "") : "");
  const [originEventId, setOriginEventId] = useState(isEditing ? (existingCredit.origin_event_id ?? "") : "");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If editing and credit has been partially used, don't allow reducing amount below used_amount
  const usedAmount = isEditing ? Number(existingCredit.used_amount) : 0;

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-credits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const val = parseFloat(amount);
      if (!val || val <= 0) throw new Error("Valor inválido");
      if (!reason.trim()) throw new Error("Motivo obrigatório");
      if (isEditing && val < usedAmount) {
        throw new Error(`Valor não pode ser inferior ao já utilizado (${formatCurrency(usedAmount)})`);
      }

      if (isEditing) {
        // Update existing credit
        const updates: any = {
          amount: val,
          reason: reason.trim(),
          document_ref: documentRef.trim() || null,
          valid_until: validUntil || null,
          notes: notes.trim() || null,
          origin_event_id: originEventId || null,
        };
        // Recalculate status
        if (val <= usedAmount) {
          updates.status = "exhausted";
        } else if (existingCredit.status === "exhausted" && val > usedAmount) {
          updates.status = "active";
        }
        const { error } = await supabase.from("supplier_credits" as any).update(updates).eq("id", existingCredit.id);
        if (error) throw error;

        // Handle file upload for edit
        if (file) {
          const ext = file.name.split(".").pop();
          const path = `${supplierId}/${existingCredit.id}/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from("supplier-credit-documents").upload(path, file);
          if (uploadErr) throw uploadErr;
          await supabase.from("supplier_credits" as any).update({ file_url: path }).eq("id", existingCredit.id);
        }
      } else {
        // Create new credit
        const insert: any = {
          supplier_id: supplierId,
          amount: val,
          reason: reason.trim(),
          created_by: userName,
        };
        if (documentRef.trim()) insert.document_ref = documentRef.trim();
        if (validUntil) insert.valid_until = validUntil;
        if (notes.trim()) insert.notes = notes.trim();
        if (originEventId) insert.origin_event_id = originEventId;

        const { data: inserted, error } = await (supabase.from("supplier_credits" as any).insert(insert).select("id").single() as any);
        if (error) throw error;

        if (file && inserted?.id) {
          const ext = file.name.split(".").pop();
          const path = `${supplierId}/${inserted.id}/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from("supplier-credit-documents").upload(path, file);
          if (uploadErr) throw uploadErr;
          await supabase.from("supplier_credits" as any).update({ file_url: path }).eq("id", inserted.id);
        }
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Crédito atualizado" : "Crédito registado");
      onSuccess();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <p className="text-xs font-semibold">{isEditing ? "Editar Crédito" : "Novo Crédito"}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">
            Valor (€) * {usedAmount > 0 && <span className="text-warning">(mín: {formatCurrency(usedAmount)})</span>}
          </label>
          <input type="number" step="0.01" min={usedAmount > 0 ? usedAmount : 0.01} value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="0.00" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Nº Documento</label>
          <input type="text" value={documentRef} onChange={(e) => setDocumentRef(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="NC-001" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Motivo *</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="Ex: Devolução parcial, compensação…" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Evento de origem</label>
          <select value={originEventId} onChange={(e) => setOriginEventId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            <option value="">— nenhum —</option>
            {events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Válido até</label>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Notas</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Anexo</label>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Paperclip className="h-3 w-3" />
            {file ? file.name : isEditing && existingCredit.file_url ? "Substituir anexo…" : "Selecionar ficheiro…"}
          </button>
          {file && (
            <button onClick={() => setFile(null)} className="text-xs text-destructive hover:text-destructive/80">
              Remover
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs border border-border hover:bg-secondary">Cancelar</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {mutation.isPending ? "A guardar…" : isEditing ? "Atualizar" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
