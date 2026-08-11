import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeImageFile } from "@/lib/image-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fornecedor pré-selecionado (opcional). */
  supplierId?: string | null;
  onCreated?: () => void;
};

/**
 * "Novo crédito de fornecedor" — crédito avulso (ex.: diárias de hotel pagas e
 * não usadas, com nota de crédito emitida sem estorno na plataforma).
 * NÃO cria movimento de DRE/BP: o custo fica no evento de origem.
 */
export function NewSupplierCreditModal({ open, onOpenChange, supplierId, onCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [originEventId, setOriginEventId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-credits"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, trade_name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-credits"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setSupplier(supplierId ?? "");
    setAmount("");
    setReason("");
    setOriginEventId("");
    setValidUntil("");
    setDocumentRef("");
    setNotes("");
    setFile(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const val = Math.round((parseFloat(amount) || 0) * 100) / 100;
      if (!supplier) throw new Error("Fornecedor obrigatório");
      if (val <= 0) throw new Error("Valor inválido");
      if (!reason.trim()) throw new Error("Motivo obrigatório");

      const insert: any = {
        supplier_id: supplier,
        amount: val,
        used_amount: 0,
        status: "active",
        reason: reason.trim(),
        created_by: user?.user_metadata?.full_name ?? user?.email ?? "sistema",
      };
      if (documentRef.trim()) insert.document_ref = documentRef.trim();
      if (validUntil) insert.valid_until = validUntil;
      if (notes.trim()) insert.notes = notes.trim();
      if (originEventId) insert.origin_event_id = originEventId;

      const { data: created, error } = await (supabase
        .from("supplier_credits" as any)
        .insert(insert)
        .select("id")
        .single() as any);
      if (error) throw error;

      if (file && created?.id) {
        const ext = file.name.split(".").pop();
        const { error: uploadErr, path } = await uploadToCompanyBucket(
          "supplier-credit-documents",
          `${supplier}/${created.id}/${Date.now()}.${ext}`,
          file,
        );
        if (uploadErr) throw uploadErr;
        await supabase.from("supplier_credits" as any).update({ file_url: path }).eq("id", created.id);
      }
    },
    onSuccess: () => {
      toast.success("Crédito registado");
      queryClient.invalidateQueries({ queryKey: ["supplier-credits"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-all"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-available"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-summary"] });
      reset();
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo crédito de fornecedor</DialogTitle>
          <DialogDescription>
            Nota de crédito emitida pelo fornecedor. Não gera movimento no BP/DRE — o custo fica no evento de origem;
            o crédito só reduz a saída de caixa quando for abatido num pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Fornecedor *</label>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="">— escolher —</option>
              {(suppliers as any[]).map((s) => (
                <option key={s.id} value={s.id}>{s.trade_name ? `${s.name} (${s.trade_name})` : s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Valor (€) *</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-right font-mono" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nº da nota de crédito</label>
              <input type="text" value={documentRef} onChange={(e) => setDocumentRef(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm" placeholder="NC-001" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Motivo *</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              placeholder="Ex.: diárias de hotel pagas e não utilizadas" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Evento de origem</label>
              <select value={originEventId} onChange={(e) => setOriginEventId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                <option value="">— nenhum —</option>
                {(events as any[]).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Válido até</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm resize-none" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Anexo (nota de crédito)</label>
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="mr-1 h-3.5 w-3.5" />
                {file ? file.name : "Selecionar ficheiro…"}
              </Button>
              {file && (
                <button onClick={() => setFile(null)} className="text-xs text-destructive">Remover</button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,image/heic,image/heif,.heic,.heif"
                onChange={async (e) => {
                  const picked = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (!picked) { setFile(null); return; }
                  try { setFile(await normalizeImageFile(picked)); } catch (err: any) { toast.error(err.message); }
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "A guardar…" : "Guardar crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
