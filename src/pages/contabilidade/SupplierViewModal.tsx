import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface SupplierRow {
  id: string;
  name: string;
  trade_name: string | null;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_name: string | null;
  category: string | null;
  payment_terms: string | null;
  iban: string | null;
  iban_2: string | null;
  iban_3: string | null;
  swift_bic: string | null;
  swift_bic_2: string | null;
  swift_bic_3: string | null;
  notes: string | null;
  is_partner: boolean | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

export function SupplierViewModal({
  supplier,
  open,
  onClose,
}: {
  supplier: SupplierRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const { data: docs, isLoading } = useQuery({
    queryKey: ["supplier-docs-readonly", supplier?.id],
    enabled: !!supplier?.id && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_documents")
        .select("id, name, file_url, doc_type, uploaded_at")
        .eq("supplier_id", supplier!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string; name: string; file_url: string; doc_type: string | null; uploaded_at: string;
      }>;
    },
  });

  async function downloadDoc(d: { id: string; name: string; file_url: string }) {
    try {
      const { data: signed, error } = await supabase.storage
        .from("supplier-documents")
        .createSignedUrl(d.file_url, 60 * 60);
      if (error || !signed) throw error ?? new Error("signed url falhou");
      await supabase.rpc("record_document_download" as any, {
        p_resource_type: "supplier_document",
        p_resource_id: d.id,
        p_bucket: "supplier-documents",
        p_file_path: d.file_url,
        p_file_name: d.name,
      } as any);
      window.open(signed.signedUrl, "_blank");
    } catch (e: any) {
      toast({ title: "Erro a descarregar", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  if (!supplier) return null;
  const ibans = [
    { iban: supplier.iban, swift: supplier.swift_bic },
    { iban: supplier.iban_2, swift: supplier.swift_bic_2 },
    { iban: supplier.iban_3, swift: supplier.swift_bic_3 },
  ].filter((x) => x.iban && x.iban.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{supplier.name}</span>
            {supplier.is_partner && <Badge variant="secondary">Sócio</Badge>}
            <Badge variant="outline" className="text-[10px]">Read Only</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="Nome Comercial" value={supplier.trade_name} />
          <Field label="NIF" value={supplier.nif} />
          <Field label="Email" value={supplier.email} />
          <Field label="Telefone" value={supplier.phone} />
          <Field label="Contacto" value={supplier.contact_name} />
          <Field label="Categoria" value={supplier.category} />
          <Field label="Cond. Pagamento" value={supplier.payment_terms} />
          <Field label="Morada" value={supplier.address} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados Bancários</div>
          {ibans.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem IBAN registado.</div>
          ) : (
            <div className="space-y-1">
              {ibans.map((x, i) => (
                <div key={i} className="rounded border p-2 text-sm font-mono break-all">
                  IBAN: {x.iban}
                  {x.swift && <span className="ml-3 text-muted-foreground">SWIFT: {x.swift}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {supplier.notes && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</div>
            <div className="text-sm whitespace-pre-wrap">{supplier.notes}</div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5" /> Anexos
          </div>
          {isLoading ? (
            <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />A carregar…</div>
          ) : (docs?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">Sem anexos.</div>
          ) : (
            <div className="rounded border divide-y">
              {docs!.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 p-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.doc_type && <span>{d.doc_type} · </span>}
                      {format(new Date(d.uploaded_at), "dd/MM/yyyy")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadDoc(d)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Descarregar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SupplierViewModal;
