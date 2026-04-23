import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Sparkles, Trash2, FileText } from "lucide-react";
import {
  PAYMENT_ORIGIN_LABELS,
  BP_SCOPE_LABELS,
  type CamarimItemPaymentOrigin,
  type CamarimItemBpScope,
  type CamarimItemStatus,
} from "@/lib/camarim-helpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  itemId?: string | null;
  mode: "team" | "manager";
  /** When true and creating a new item, opens the camera/file picker right after the modal mounts. */
  autoOpenCamera?: boolean;
  onSaved?: () => void;
}

export function CamarimItemModal({ open, onOpenChange, sessionId, itemId, mode, autoOpenCamera, onSaved }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [ivaAmount, setIvaAmount] = useState("");
  const [paymentOrigin, setPaymentOrigin] = useState<CamarimItemPaymentOrigin>("advance");
  const [bpScope, setBpScope] = useState<CamarimItemBpScope>("master_common");
  const [notes, setNotes] = useState("");
  const [hasDocument, setHasDocument] = useState(true);
  const [docIssueReason, setDocIssueReason] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Array<{ id: string; code: string; name: string }>>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPayload, setOcrPayload] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadCategories();
    if (itemId) {
      void loadItem(itemId);
    } else {
      reset();
      // Auto-trigger file picker for the team flow
      if (autoOpenCamera) {
        const t = setTimeout(() => fileRef.current?.click(), 250);
        return () => clearTimeout(t);
      }
    }
  }, [open, itemId, autoOpenCamera]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("account_categories")
      .select("id,code,name,parent_id,type")
      .eq("type", "expense")
      .eq("is_active", true)
      .order("code");
    // Apenas folhas (L3): categorias que não são parent de nenhuma outra
    const all = (data ?? []) as any[];
    const parentIds = new Set(all.map((c) => c.parent_id).filter(Boolean));
    const leaves = all.filter((c) => !parentIds.has(c.id));
    setCategories(leaves.map((c) => ({ id: c.id, code: c.code, name: c.name })));
  };

  const reset = () => {
    setSupplierName("");
    setServiceDescription("");
    setDocNumber("");
    setDocDate(new Date().toISOString().slice(0, 10));
    setTotalAmount("");
    setIvaAmount("");
    setPaymentOrigin("advance");
    setBpScope("master_common");
    setNotes("");
    setHasDocument(true);
    setDocIssueReason("");
    setCategoryId("");
    setPhotoFile(null);
    setPhotoPath(null);
    setPreviewUrl(null);
    setOcrPayload(null);
  };

  const loadItem = async (id: string) => {
    const { data } = await supabase.from("camarim_items" as any).select("*").eq("id", id).single();
    if (!data) return;
    const it = data as any;
    setSupplierName(it.supplier_name_raw ?? "");
    setServiceDescription(it.service_description ?? "");
    setDocNumber(it.document_number ?? "");
    setDocDate(it.document_date ?? new Date().toISOString().slice(0, 10));
    setTotalAmount(String(it.total_amount ?? ""));
    setIvaAmount(String(it.iva_amount ?? ""));
    setPaymentOrigin(it.payment_origin);
    setBpScope(it.bp_scope);
    setNotes(it.notes ?? "");
    setHasDocument(it.has_document);
    setDocIssueReason(it.document_issue_reason ?? "");
    setCategoryId(it.category_id ?? "");
    setOcrPayload(it.ocr_raw_payload);

    // Load attached document path (first one)
    const { data: docs } = await supabase
      .from("camarim_item_documents" as any)
      .select("file_path")
      .eq("item_id", id)
      .limit(1);
    if (docs && docs.length > 0) {
      setPhotoPath((docs[0] as any).file_path);
      const { data: signed } = await supabase.storage
        .from("camarim-documents")
        .createSignedUrl((docs[0] as any).file_path, 60 * 60);
      setPreviewUrl(signed?.signedUrl ?? null);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    // Trigger OCR immediately
    await runOcr(file);
  };

  const runOcr = async (file: File) => {
    setOcrLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-camarim-receipt", {
        body: { image_base64: base64, mime_type: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOcrPayload(data);
      // Pre-fill fields if empty
      if (data.supplier_name && !supplierName) setSupplierName(data.supplier_name);
      if (data.service_description && !serviceDescription) setServiceDescription(data.service_description);
      if (data.document_number && !docNumber) setDocNumber(data.document_number);
      if (data.document_date) setDocDate(data.document_date);
      if (data.total_amount != null) setTotalAmount(String(data.total_amount));
      if (data.iva_amount != null) setIvaAmount(String(data.iva_amount));
      toast({ title: "Talão lido com IA", description: data.confidence === "low" ? "Confiança baixa — confirma os dados." : undefined });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "OCR falhou", description: e.message });
    } finally {
      setOcrLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = reader.result as string;
        resolve(s.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSave = async (asStatus: CamarimItemStatus) => {
    if (!totalAmount || isNaN(Number(totalAmount))) {
      toast({ variant: "destructive", title: "Valor obrigatório" });
      return;
    }
    if (!hasDocument && !docIssueReason.trim()) {
      toast({ variant: "destructive", title: "Indica o motivo da ausência de documento" });
      return;
    }

    // Sem documento → força parqueamento (manager decide depois).
    // Único bypass: manager pode aprovar diretamente preenchendo justificativa válida.
    // Rejeitar mantém-se sempre como "rejected".
    let effectiveStatus: CamarimItemStatus = asStatus;
    if (!hasDocument && asStatus !== "rejected") {
      effectiveStatus = mode === "manager" && asStatus === "approved" ? "approved" : "pending_review";
    }

    setSaving(true);
    try {
      const payload: any = {
        session_id: sessionId,
        event_id: await getPrimaryEventId(sessionId),
        supplier_name_raw: supplierName || null,
        service_description: serviceDescription || null,
        document_number: docNumber || null,
        document_date: docDate || null,
        document_type: "receipt",
        total_amount: Number(totalAmount),
        iva_amount: Number(ivaAmount || 0),
        base_amount: Number(totalAmount) - Number(ivaAmount || 0),
        payment_origin: paymentOrigin,
        bp_scope: bpScope,
        notes: notes || null,
        has_document: hasDocument,
        document_issue_reason: hasDocument ? null : docIssueReason,
        pending_review_reason: effectiveStatus === "pending_review" ? docIssueReason : null,
        status: effectiveStatus,
        category_id: categoryId || null,
        ocr_raw_payload: ocrPayload,
        ocr_confidence: ocrPayload?.confidence ?? null,
        currency: "EUR",
      };

      let savedId = itemId ?? null;
      if (itemId) {
        const { error } = await supabase.from("camarim_items" as any).update(payload).eq("id", itemId);
        if (error) throw error;
      } else {
        payload.created_by = user?.id ?? null;
        const { data, error } = await supabase
          .from("camarim_items" as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = (data as any).id;
      }

      // Upload photo if any
      if (photoFile && savedId) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${sessionId}/${savedId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("camarim-documents")
          .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (upErr) throw upErr;
        await supabase.from("camarim_item_documents" as any).insert({
          item_id: savedId,
          file_path: path,
          file_name: photoFile.name,
          mime_type: photoFile.type,
          file_size: photoFile.size,
          document_source: mode === "team" ? "team_upload" : "manager_upload",
          created_by: user?.id ?? null,
        } as any);
      }

      toast({ title: itemId ? "Item atualizado" : "Item registado" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gravar", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const getPrimaryEventId = async (sid: string): Promise<string> => {
    const { data } = await supabase
      .from("camarim_session_events" as any)
      .select("event_id,is_primary")
      .eq("session_id", sid);
    const arr = (data ?? []) as any[];
    const primary = arr.find((x) => x.is_primary) ?? arr[0];
    return primary?.event_id ?? "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemId ? "Editar conta" : "Nova conta de camarim"}</DialogTitle>
          <DialogDescription>
            {mode === "team"
              ? "Tira foto do talão (a IA preenche automaticamente) ou preenche os campos à mão."
              : "Edita ou adiciona uma conta. Pode anexar foto do talão."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Foto / OCR */}
          <div className="rounded-lg border border-dashed p-3">
            {previewUrl ? (
              <div className="space-y-2">
                <img
                  src={previewUrl}
                  alt="Talão"
                  className="mx-auto max-h-60 rounded-md object-contain"
                />
                <div className="flex justify-center gap-2">
                  {photoFile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => runOcr(photoFile)}
                      disabled={ocrLoading}
                    >
                      {ocrLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Reanalisar com IA
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPhotoFile(null);
                      setPreviewUrl(null);
                      setPhotoPath(null);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Remover
                  </Button>
                </div>
                {ocrLoading && (
                  <p className="text-center text-xs text-muted-foreground">A ler talão com IA…</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 py-6 text-muted-foreground hover:text-primary"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm font-medium">Tirar / carregar foto do talão</span>
                <span className="text-xs">A IA preenche os campos automaticamente</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          {/* Campos */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Estabelecimento / fornecedor</Label>
              <Input id="supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docnum">Nº talão / fatura</Label>
              <Input id="docnum" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docdate">Data</Label>
              <Input id="docdate" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total">Total (€)</Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iva">IVA (€)</Label>
              <Input
                id="iva"
                type="number"
                step="0.01"
                value={ivaAmount}
                onChange={(e) => setIvaAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Origem do pagamento</Label>
              <Select value={paymentOrigin} onValueChange={(v) => setPaymentOrigin(v as CamarimItemPaymentOrigin)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_ORIGIN_LABELS) as CamarimItemPaymentOrigin[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PAYMENT_ORIGIN_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Verba (BP)</Label>
              <Select value={bpScope} onValueChange={(v) => setBpScope(v as CamarimItemBpScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BP_SCOPE_LABELS) as CamarimItemBpScope[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {BP_SCOPE_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Categoria contábil</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição rápida</Label>
              <Input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!hasDocument}
                onChange={(e) => setHasDocument(!e.target.checked)}
              />
              <span>Sem documento fiscal</span>
            </Label>
            {!hasDocument && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Motivo (ex: estabelecimento não emitiu talão)"
                  value={docIssueReason}
                  onChange={(e) => setDocIssueReason(e.target.value)}
                  rows={2}
                />
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  Sem documento fiscal — o item ficará <strong>parqueado</strong> até o manager justificar e aprovar manualmente. Não gera transação até lá.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {ocrPayload && (
            <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-1 font-medium">
                <FileText className="h-3 w-3" /> Dados extraídos pela IA · confiança: {ocrPayload.confidence ?? "n/a"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {mode === "team" ? (
            <Button onClick={() => handleSave("submitted")} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submeter
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>
                Guardar rascunho
              </Button>
              <Button onClick={() => handleSave("approved")} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aprovar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
