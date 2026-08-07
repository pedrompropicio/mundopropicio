import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCompanyBucket } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Sparkles, Trash2, FileText, Upload, Split } from "lucide-react";
import {
  BP_SCOPE_LABELS,
  type CamarimItemPaymentOrigin,
  type CamarimItemBpScope,
  type CamarimItemStatus,
} from "@/lib/camarim-helpers";

// Sentinel values used in the unified "Forma de pagamento" select.
const PAYMENT_ADVANCE = "__advance__";
const PAYMENT_OUT_OF_POCKET = "__out_of_pocket__";
import { extractJpegFromDng, isDngFile } from "@/lib/dng-extract-preview";
import { pdfFirstPageToJpeg } from "@/lib/pdf-first-page-to-jpeg";
import { SplitItemModal } from "./SplitItemModal";

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
  const cameraRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [ivaAmount, setIvaAmount] = useState("");
  // Forma de pagamento é OBRIGATÓRIA — começa indefinida para forçar escolha explícita.
  const [paymentOrigin, setPaymentOrigin] = useState<CamarimItemPaymentOrigin | null>(null);
  const [financialAccountId, setFinancialAccountId] = useState<string | null>(null);
  const [bpScope, setBpScope] = useState<CamarimItemBpScope>("master_common");
  const [notes, setNotes] = useState("");
  const [hasDocument, setHasDocument] = useState(true);
  const [docIssueReason, setDocIssueReason] = useState("");
  // Tag analítica: usada apenas para análise no dossier contabilístico.
  // NÃO afeta a categoria contabilística da transação (sempre 2.6.04 — Camarins).
  const [analyticTag, setAnalyticTag] = useState<string>("");
  const [cardAccounts, setCardAccounts] = useState<Array<{ id: string; name: string }>>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPayload, setOcrPayload] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [itemCreatedBy, setItemCreatedBy] = useState<string | null>(null);
  const [itemStatus, setItemStatus] = useState<CamarimItemStatus | null>(null);
  const [parentItemId, setParentItemId] = useState<string | null>(null);
  const [splitItemId, setSplitItemId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);

  const isSplitChild = !!parentItemId;
  const isSplitParent = itemStatus === "split";
  const hasLockedSplitStructure = isSplitChild || isSplitParent;

  useEffect(() => {
    if (!open) return;
    void loadCardAccounts();
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

  // Cartões pré-pago ativos visíveis ao utilizador (RLS via financial_account_access trata da visibilidade).
  const loadCardAccounts = async () => {
    const { data } = await supabase
      .from("financial_accounts")
      .select("id,name")
      .eq("type", "prepaid_card")
      .eq("is_active", true)
      .eq("is_hidden", false)
      .order("name");
    setCardAccounts(((data ?? []) as any[]).map((a) => ({ id: a.id, name: a.name })));
  };

  // (Categoria contabilística é fixa — 2.6.04 Camarins, aplicada no fecho da sessão.)

  const reset = () => {
    setSupplierName("");
    setServiceDescription("");
    setDocNumber("");
    setDocDate(new Date().toISOString().slice(0, 10));
    setTotalAmount("");
    setIvaAmount("");
    setPaymentOrigin(null);
    setFinancialAccountId(null);
    setBpScope("master_common");
    setNotes("");
    setHasDocument(true);
    setDocIssueReason("");
    setAnalyticTag("");
    setPhotoFile(null);
    setPhotoPath(null);
    setPreviewUrl(null);
    setOcrPayload(null);
    setItemCreatedBy(null);
    setItemStatus(null);
    setParentItemId(null);
  };

  const handleDelete = async () => {
    if (!itemId) return;
    if (isSplitChild) {
      toast({
        variant: "destructive",
        title: "Não é possível eliminar uma linha-filha isoladamente",
        description:
          'Use "Redividir" no talão-mãe para ajustar a divisão, ou elimine o talão-mãe (apaga todas as linhas).',
      });
      return;
    }

    // Conta filhos (se for pai dividido) para avisar o utilizador
    let childrenCount = 0;
    if (isSplitParent) {
      const { count } = await supabase
        .from("camarim_items" as any)
        .select("id", { count: "exact", head: true })
        .eq("parent_item_id", itemId);
      childrenCount = count ?? 0;
    }

    const confirmMsg =
      childrenCount > 0
        ? `Este talão foi dividido em ${childrenCount} linha(s). Eliminar vai apagar TODAS as linhas associadas. Tens a certeza?`
        : "Eliminar este lançamento? Esta ação não pode ser desfeita.";
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    // 2ª confirmação reforçada quando há filhos
    if (childrenCount > 0) {
      const ok2 = window.confirm(
        `Confirma definitivamente: vais apagar o talão-mãe + ${childrenCount} linha(s) filha(s).`,
      );
      if (!ok2) return;
    }

    setDeleting(true);
    try {
      // Apaga primeiro os documentos do storage e da tabela (apenas do pai;
      // os filhos não têm anexos próprios — partilham via lookup ao pai).
      const { data: docs } = await supabase
        .from("camarim_item_documents" as any)
        .select("file_path")
        .eq("item_id", itemId);
      const paths = ((docs ?? []) as any[]).map((d) => d.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("camarim-documents").remove(paths);
        await supabase.from("camarim_item_documents" as any).delete().eq("item_id", itemId);
      }
      // CASCADE da FK parent_item_id apaga os filhos automaticamente.
      const { error } = await supabase.from("camarim_items" as any).delete().eq("id", itemId);
      if (error) throw error;
      toast({
        title: childrenCount > 0 ? "Talão e linhas filhas eliminados" : "Lançamento eliminado",
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao eliminar", description: e.message });
    } finally {
      setDeleting(false);
    }
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
    setFinancialAccountId(it.financial_account_id ?? null);
    setBpScope(it.bp_scope);
    setNotes(it.notes ?? "");
    setHasDocument(it.has_document);
    setDocIssueReason(it.document_issue_reason ?? "");
    setAnalyticTag(it.analytic_tag ?? "");
    setOcrPayload(it.ocr_raw_payload);
    setItemCreatedBy(it.created_by ?? null);
    setItemStatus(it.status ?? null);
    setParentItemId(it.parent_item_id ?? null);

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
    const original = e.target.files?.[0];
    if (!original) return;

    let file = original;

    // Fotos de iPhone (HEIC/HEIF) → converter para JPEG antes de tudo.
    if (isHeicFile(original)) {
      setConvertingPhoto(true);
      try {
        file = await normalizeImageFile(original);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Foto HEIC não suportada", description: err.message });
        setConvertingPhoto(false);
        if (e.target) e.target.value = "";
        return;
      } finally {
        setConvertingPhoto(false);
      }
    }


    // Se for DNG/RAW, tenta extrair o JPEG embutido. Se falhar, usa o ficheiro
    // original na mesma — o upload e OCR podem não funcionar, mas pelo menos
    // o utilizador consegue avançar e preencher à mão.
    if (isDngFile(original)) {
      toast({ title: "A processar ficheiro RAW…", description: "A extrair pré-visualização para OCR." });
      try {
        const jpeg = await extractJpegFromDng(original);
        if (jpeg) {
          file = jpeg;
        } else {
          toast({
            variant: "destructive",
            title: "RAW sem preview JPEG",
            description: "Vou usar o ficheiro original. Para melhor OCR, exporta como JPG ou desliga o ProRAW na câmara.",
          });
          // segue com o original — não bloqueia
        }
      } catch (err: any) {
        console.error("DNG extract failed", err);
        toast({
          variant: "destructive",
          title: "Erro a processar RAW",
          description: "Vou usar o ficheiro original. Para melhor resultado, exporta como JPG.",
        });
        // segue com o original
      }
    }

    // Se for PDF, anexamos o original na mesma mas convertemos a 1ª página
    // para JPEG só para alimentar o OCR (Gemini via gateway só aceita imagem).
    let ocrSource: File | null = null;
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      toast({ title: "A processar PDF…", description: "A extrair primeira página para OCR." });
      const jpg = await pdfFirstPageToJpeg(file);
      if (jpg) {
        ocrSource = jpg;
      } else {
        toast({
          variant: "destructive",
          title: "Não consegui ler o PDF",
          description: "Anexei o ficheiro mesmo assim. Preenche os campos à mão.",
        });
      }
    } else if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type)) {
      ocrSource = file;
    }

    setPhotoFile(file);
    // Preview: imagem se possível (PDFs não renderizam em <img>); senão, sem preview.
    setPreviewUrl(ocrSource ? URL.createObjectURL(ocrSource) : null);

    if (ocrSource) {
      await runOcr(ocrSource);
    } else {
      toast({
        title: "OCR não suportado para este formato",
        description: "Preenche os campos à mão. O ficheiro vai ser anexado na mesma.",
      });
    }
  };

  const runOcr = async (sourceFile: File) => {
    setOcrLoading(true);
    try {
      // SEMPRE preparar/comprimir antes do OCR — fotos do iPhone original
      // estouram a memória da edge function (Memory limit exceeded).
      const file = await prepareImageForOcr(sourceFile);
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
      // Pré-preenche tag analítica se OCR sugeriu (e equipa ainda não escolheu uma)
      const VALID_TAGS = ["bebidas", "comida", "higiene", "equipa", "outros"];
      if (data.analytic_tag && VALID_TAGS.includes(data.analytic_tag) && !analyticTag) {
        setAnalyticTag(data.analytic_tag);
      }
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

  // Comprime SEMPRE para limitar payload de OCR (~150-300 KB) e evitar
  // "Memory limit exceeded" na edge function. Imagens pequenas (< 200 KB) passam diretas.
  const prepareImageForOcr = async (file: File): Promise<File> => {
    if (file.size < 200 * 1024 && /^image\/jpe?g$/i.test(file.type)) return file;

    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Não foi possível preparar a imagem para OCR"));
        image.src = objectUrl!;
      });

      const maxSide = 1280;
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
      const width = Math.max(1, Math.round(srcW * scale));
      const height = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível para OCR");
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.7);
      });

      if (!blob) return file;

      const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
      console.log(`[camarim-ocr] compressed ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
      return new File([blob], `${baseName}-ocr.jpg`, { type: "image/jpeg" });
    } catch (err) {
      console.warn("OCR image preparation failed, using original file", err);
      return file;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const handleSave = async (asStatus: CamarimItemStatus, opts?: { thenSplit?: boolean }) => {
    if (!totalAmount || isNaN(Number(totalAmount))) {
      toast({ variant: "destructive", title: "Valor obrigatório" });
      return;
    }
    if (!hasDocument && !docIssueReason.trim()) {
      toast({ variant: "destructive", title: "Indica o motivo da ausência de documento" });
      return;
    }
    if (!paymentOrigin) {
      toast({ variant: "destructive", title: "Forma de pagamento obrigatória", description: "Indica como esta despesa foi paga." });
      return;
    }
    if (paymentOrigin === "card" && !financialAccountId) {
      toast({ variant: "destructive", title: "Seleciona o cartão usado" });
      return;
    }

    // Pré-check de duplicados (mesma sessão + fornecedor + nº doc + total).
    if (!itemId && supplierName.trim() && docNumber.trim()) {
      const { data: dupes } = await supabase
        .from("camarim_items" as any)
        .select("id,status,created_at,supplier_name_raw,document_number,total_amount")
        .eq("session_id", sessionId)
        .ilike("supplier_name_raw", supplierName.trim())
        .eq("document_number", docNumber.trim())
        .eq("total_amount", Number(totalAmount))
        .neq("status", "rejected")
        .limit(1);
      if (dupes && dupes.length > 0) {
        const ok = window.confirm(
          `⚠️ Já existe um lançamento idêntico nesta sessão:\n\n` +
          `${supplierName} · doc ${docNumber} · ${Number(totalAmount).toFixed(2)} €\n\n` +
          `Tens a certeza que queres registar outra vez?`
        );
        if (!ok) return;
      }
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
        event_id: (await getPrimaryEventId(sessionId)) || null,
        supplier_name_raw: supplierName || null,
        service_description: serviceDescription || null,
        document_number: docNumber || null,
        document_date: docDate || null,
        document_type: "receipt",
        total_amount: Number(totalAmount),
        iva_amount: Number(ivaAmount || 0),
        base_amount: Number(totalAmount) - Number(ivaAmount || 0),
        payment_origin: paymentOrigin,
        financial_account_id: paymentOrigin === "card" ? financialAccountId : null,
        bp_scope: bpScope,
        notes: notes || null,
        has_document: hasDocument,
        document_issue_reason: hasDocument ? null : docIssueReason,
        pending_review_reason: effectiveStatus === "pending_review" ? docIssueReason : null,
        status: effectiveStatus,
        analytic_tag: analyticTag || null,
        ocr_raw_payload: ocrPayload,
        ocr_confidence: ocrPayload?.confidence ?? null,
        currency: "EUR",
      };

      let savedId = itemId ?? null;
      let createdNow = false;
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
        createdNow = true;
      }

      // Upload photo if any — falha aqui é crítica e tem que ser visível ao utilizador.
      // Se acabámos de criar o item e o upload falhou, fazemos rollback do item para evitar
      // ficar um lançamento "fantasma" sem anexo nem rasto.
      if (photoFile && savedId) {
        try {
          const rawExt = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
          const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "jpg";
          const { error: upErr, path } = await uploadToCompanyBucket(
            "camarim-documents",
            `${sessionId}/${savedId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
            photoFile,
            {
              contentType: photoFile.type || "application/octet-stream",
              upsert: true,
            },
          );
          if (upErr) throw upErr;
          const documentSource = photoFile.name ? "upload" : "camera";
          const { error: docInsErr } = await supabase
            .from("camarim_item_documents" as any)
            .insert({
              item_id: savedId,
              file_path: path,
              file_name: photoFile.name,
              mime_type: photoFile.type,
              file_size: photoFile.size,
              document_source: documentSource,
              created_by: user?.id ?? null,
            } as any);
          if (docInsErr) {
            // Storage gravou mas a tabela não — limpa o ficheiro órfão
            await supabase.storage.from("camarim-documents").remove([path]);
            throw docInsErr;
          }
        } catch (upErr: any) {
          console.error("Camarim attachment upload failed", upErr);
          if (createdNow && savedId) {
            // Rollback do item recém-criado para o utilizador poder voltar a tentar
            await supabase.from("camarim_items" as any).delete().eq("id", savedId);
          }
          const msg =
            upErr?.message?.includes("row-level security") || upErr?.statusCode === 403
              ? "Sem permissão para gravar a foto. Pede ao admin para te dar acesso ao bucket camarim-documents."
              : (upErr?.message ?? "Falha ao gravar o anexo");
          toast({
            variant: "destructive",
            title: "Anexo não foi gravado",
            description: createdNow
              ? `${msg} — o lançamento NÃO foi criado, tenta de novo.`
              : msg,
          });
          return;
        }
      }

      toast({ title: itemId ? "Item atualizado" : "Item registado" });
      onSaved?.();
      if (opts?.thenSplit && savedId) {
        setSplitItemId(savedId);
        setSplitOpen(true);
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      console.error(e);
      // 23505 = unique_violation (índice camarim_items_dedup_idx)
      const code = e?.code ?? e?.cause?.code;
      if (code === "23505" || /duplicate key|camarim_items_dedup_idx/i.test(e?.message ?? "")) {
        toast({
          variant: "destructive",
          title: "Despesa duplicada",
          description: "Já existe um lançamento idêntico nesta sessão (mesmo fornecedor, nº de documento e valor).",
        });
      } else {
        toast({ variant: "destructive", title: "Erro ao gravar", description: e.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const getPrimaryEventId = async (sid: string): Promise<string | null> => {
    const { data } = await supabase
      .from("camarim_session_events" as any)
      .select("event_id,is_primary")
      .eq("session_id", sid);
    const arr = (data ?? []) as any[];
    const primary = arr.find((x) => x.is_primary) ?? arr[0];
    return primary?.event_id ?? null;
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
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Camera className="h-8 w-8" />
                  <span className="text-sm font-medium">Adicionar foto / ficheiro do talão</span>
                  <span className="text-xs">A IA preenche os campos automaticamente</span>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" /> Tirar foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" /> Escolher ficheiro
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.dng,.tif,.tiff,image/x-adobe-dng"
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
                disabled={hasLockedSplitStructure}
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
                disabled={hasLockedSplitStructure}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Forma de pagamento <span className="text-destructive">*</span>
              </Label>
              <Select
                value={
                  paymentOrigin === "advance"
                    ? PAYMENT_ADVANCE
                    : paymentOrigin === "out_of_pocket"
                      ? PAYMENT_OUT_OF_POCKET
                      : paymentOrigin === "card"
                        ? (financialAccountId ?? "")
                        : ""
                }
                onValueChange={(v) => {
                  if (v === PAYMENT_ADVANCE) {
                    setPaymentOrigin("advance");
                    setFinancialAccountId(null);
                  } else if (v === PAYMENT_OUT_OF_POCKET) {
                    setPaymentOrigin("out_of_pocket");
                    setFinancialAccountId(null);
                  } else {
                    setPaymentOrigin("card");
                    setFinancialAccountId(v);
                  }
                }}
                disabled={hasLockedSplitStructure}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PAYMENT_ADVANCE}>Caixa do camarim (adiantamento)</SelectItem>
                  {cardAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                  <SelectItem value={PAYMENT_OUT_OF_POCKET}>Recurso próprio (a reembolsar)</SelectItem>
                </SelectContent>
              </Select>
              {paymentOrigin === "card" && financialAccountId && !cardAccounts.find((a) => a.id === financialAccountId) && (
                <p className="text-[11px] text-muted-foreground">
                  Cartão associado já não está disponível ou visível para ti.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Verba (BP)</Label>
              <Select value={bpScope} onValueChange={(v) => setBpScope(v as CamarimItemBpScope)} disabled={hasLockedSplitStructure}>
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
              {bpScope === "mixed" && (
                <p className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1.5 text-[11px] text-purple-700 dark:text-purple-400">
                  {isSplitParent
                    ? "Talão já dividido — para alterar valores ou destinos, usa a redivisão em vez de editar os campos estruturais."
                    : "Talão misto — parte para Master, parte para cidades específicas. Podes dividir já agora ou submeter e deixar o gestor dividir antes do fecho."}
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Tag analítica <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Select
                value={analyticTag || "__none__"}
                onValueChange={(v) => setAnalyticTag(v === "__none__" ? "" : v)}
                disabled={hasLockedSplitStructure}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem classificação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem classificação</SelectItem>
                  <SelectItem value="bebidas">Bebidas (águas, refrigerantes, sumos, álcool)</SelectItem>
                  <SelectItem value="comida">Comida (refeições, take-away, sandes, frutas, snacks)</SelectItem>
                  <SelectItem value="higiene">Higiene e Consumíveis (toalhas, copos, gelo)</SelectItem>
                  <SelectItem value="equipa">Equipa Camarim (despesas só para a crew)</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Usado apenas para análise no dossier do contabilista. Categoria contabilística é sempre <strong>2.6.04 — Camarins</strong>.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição rápida</Label>
              <Input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
            </div>
          </div>

          {hasLockedSplitStructure && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              {isSplitChild
                ? "Este registo é uma linha filha de um talão dividido. Valor, verba, categoria e origem de pagamento ficam bloqueados para manter a soma e o vínculo com a despesa-mãe."
                : "Este talão é a despesa-mãe de uma divisão. Valor, verba, categoria e origem de pagamento ficam bloqueados; se precisares de mudar a repartição, usa a redivisão."}
            </div>
          )}

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

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {itemId &&
              itemStatus &&
              ["draft", "submitted", "pending_review"].includes(itemStatus) &&
              !hasLockedSplitStructure &&
              (mode === "manager" || itemCreatedBy === user?.id) && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Eliminar
                </Button>
              )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Cancelar
            </Button>
            {bpScope === "mixed" && (
              <Button
                variant="secondary"
                onClick={() =>
                  itemId
                    ? (setSplitItemId(itemId), setSplitOpen(true))
                    : handleSave(mode === "team" ? "submitted" : "draft", { thenSplit: true })
                }
                disabled={saving || deleting}
                title={isSplitParent ? "Redividir o talão entre Master e cidades" : "Dividir o talão entre Master e cidades"}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Split className="mr-2 h-4 w-4" />
                {isSplitParent ? "Redividir" : "Dividir agora"}
              </Button>
            )}
            {mode === "team" ? (
              <Button onClick={() => handleSave("submitted")} disabled={saving || deleting}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {itemId ? "Atualizar" : "Submeter"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving || deleting}>
                  Guardar rascunho
                </Button>
                <Button onClick={() => handleSave("approved")} disabled={saving || deleting}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Aprovar
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {splitItemId && (
        <SplitItemModal
          open={splitOpen}
          onOpenChange={(o) => {
            setSplitOpen(o);
            if (!o) {
              // Após fechar o split modal, fecha também o item modal e refresca a lista
              setSplitItemId(null);
              onSaved?.();
              onOpenChange(false);
            }
          }}
          itemId={splitItemId}
          allowResplit={mode === "manager" && !parentItemId}
          onSaved={() => {
            onSaved?.();
          }}
        />
      )}
    </Dialog>
  );
}
