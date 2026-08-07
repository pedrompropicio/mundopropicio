import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Receipt, Camera, Paperclip, Loader2, Sparkles } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { isHeicFile, normalizeImageFile, HEIC_ACCEPT } from "@/lib/image-upload";
import { prepareFileForInvoiceOcr, fileToBase64 } from "@/lib/invoice-ocr-prepare";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";
import { snapToStandardRate } from "@/lib/iva";
import {
  cardBaseFromTotal,
  cardItemGross,
  inferCardRateFromReceipt,
  invalidateCardSessionQueries,
} from "@/lib/card-session-helpers";
import CardAmountFields from "@/components/cards/CardAmountFields";
import { uploadToCompanyBucket } from "@/lib/storage";

/** Despesa existente (transação da sessão) quando o modal está em modo edição. */
export interface CardExpenseRow {
  id: string;
  description: string | null;
  amount: number | string | null;
  iva_rate: number | string | null;
  paid_amount: number | string | null;
  date: string;
  event_id: string | null;
  category_id: string | null;
  supplier_id?: string | null;
  company_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  cardAccountId: string;
  defaultEventId?: string | null;
  /** Quando presente, o modal edita esta despesa em vez de criar uma nova. */
  expense?: CardExpenseRow | null;
}

function getDocType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png"].includes(ext ?? "")) return "imagem";
  return "outro";
}

export function NewCardExpenseModal({ open, onOpenChange, sessionId, cardAccountId, defaultEventId, expense }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!expense;

  const [description, setDescription] = useState("");
  /** Total c/IVA — igual ao talão (é o que sai do cartão). */
  const [total, setTotal] = useState("");
  const [ivaRate, setIvaRate] = useState<number>(23);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [eventId, setEventId] = useState<string>(defaultEventId ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");

  const [docFile, setDocFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPayload, setOcrPayload] = useState<any>(null);

  // Pré-preenche em modo edição (e limpa ao voltar a modo criação).
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setDescription(expense.description ?? "");
      const gross = Number(expense.paid_amount) || cardItemGross(expense);
      setTotal(gross ? String(gross) : "");
      setIvaRate(Number(expense.iva_rate) || 0);
      setDate(expense.date);
      setEventId(expense.event_id ?? "");
      setCategoryId(expense.category_id ?? "");
      setSupplierId(expense.supplier_id ?? "");
    } else {
      setDescription("");
      setTotal("");
      setIvaRate(23);
      setDate(new Date().toISOString().split("T")[0]);
      setEventId(defaultEventId ?? "");
      setCategoryId("");
      setSupplierId("");
    }
    setDocFile(null);
    setPreviewUrl(null);
    setOcrPayload(null);
  }, [open, expense?.id]);


  const { rates } = useEventIvaCountry(eventId || null);

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-card-expense"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["l3-categories"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
      return data ?? [];
    },
  });

  const l3Options = useMemo(() => {
    const byId = new Map(categories.map((c: any) => [c.id, c]));
    const isL3 = (c: any) => {
      const p1 = byId.get(c.parent_id);
      if (!p1) return false;
      const p2 = byId.get((p1 as any).parent_id);
      return !!p2;
    };
    return categories
      .filter((c: any) => isL3(c) && c.type === "expense")
      .sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""))
      .map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
  }, [categories]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    let file = picked;
    if (isHeicFile(picked)) {
      try {
        toast({ title: "A converter foto…" });
        file = await normalizeImageFile(picked);
      } catch (err: any) {
        toast({ title: "Foto HEIC não suportada", description: err.message, variant: "destructive" });
        e.target.value = "";
        return;
      }
    }
    setDocFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    e.target.value = "";

    setOcrLoading(true);
    try {
      const prep = await prepareFileForInvoiceOcr(file);
      if (!prep.ok) {
        toast({
          title: "OCR não suportado para este ficheiro",
          description: "Preenche os campos à mão. O documento vai ser anexado.",
        });
        return;
      }
      const base64 = await fileToBase64(prep.file);
      const { data, error } = await supabase.functions.invoke("extract-camarim-receipt", {
        body: { image_base64: base64, mime_type: prep.file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOcrPayload(data);

      if (data.service_description && !description) setDescription(data.service_description);
      if (data.document_date) setDate(data.document_date);
      if (data.total_amount != null) setTotal(String(data.total_amount));
      if (data.total_amount != null && data.iva_amount != null)
        setIvaRate(inferCardRateFromReceipt(data.total_amount, data.iva_amount, rates));
      else if (data.iva_rate != null) setIvaRate(snapToStandardRate(Number(data.iva_rate), rates));

      // Fornecedor: tenta casar com um existente por nome
      if (data.supplier_name) {
        const norm = (s: string) => s.toLowerCase().trim();
        const match = (suppliers as any[]).find(
          (s) => norm(s.name) === norm(data.supplier_name) || norm(s.name).includes(norm(data.supplier_name)),
        );
        if (match) setSupplierId(match.id);
        else if (!description) setDescription(data.supplier_name);
      }

      toast({
        title: "Documento lido com IA",
        description: data.confidence === "low" ? "Confiança baixa — confirma os dados." : undefined,
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("429"))
        toast({ variant: "destructive", title: "OCR limitado", description: "Muitos pedidos — tenta em alguns segundos." });
      else if (msg.includes("402"))
        toast({ variant: "destructive", title: "Créditos IA esgotados", description: "Contacta a gestão." });
      else toast({ variant: "destructive", title: "OCR falhou", description: msg });
    } finally {
      setOcrLoading(false);
    }
  };

  const reset = () => {
    setDescription("");
    setTotal("");
    setCategoryId("");
    setSupplierId("");
    setDocFile(null);
    setPreviewUrl(null);
    setOcrPayload(null);
  };

  const attachDoc = async (txId: string) => {
    if (!docFile) return;
    const ext = docFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const { error: upErr, path } = await uploadToCompanyBucket(
      "transaction-documents",
      `${txId}/${Date.now()}.${ext}`,
      docFile,
    );
    if (upErr) throw upErr;
    const { error: docErr } = await supabase.from("transaction_documents").insert({
      transaction_id: txId,
      name: docFile.name,
      file_url: path,
      doc_type: getDocType(docFile.name),
      uploaded_by: user?.email ?? "sistema",
      is_accounting: true,
    } as any);
    if (docErr) throw docErr;
  };

  const mut = useMutation({
    mutationFn: async () => {
      const gross = parseFloat(total);
      if (isNaN(gross) || gross <= 0) throw new Error("Total inválido.");
      if (!description.trim()) throw new Error("Descrição obrigatória.");
      if (!categoryId) throw new Error("Categoria obrigatória.");
      const rate = Number(ivaRate) || 0;
      // BD guarda base s/IVA + taxa; o cartão pagou o total c/IVA.
      const base = cardBaseFromTotal(gross, rate);

      if (expense) {
        const patch = {
          description: description.trim(),
          amount: base,
          iva_rate: rate,
          category_id: categoryId,
          supplier_id: supplierId || null,
          event_id: eventId || null,
          date,
          paid_amount: gross,
          payment_date: date,
        };
        const { error } = await supabase.from("transactions").update(patch).eq("id", expense.id);
        if (error) throw error;

        // Auditoria: uma linha por campo alterado.
        const before: Record<string, unknown> = {
          description: expense.description ?? null,
          amount: Number(expense.amount ?? 0),
          iva_rate: Number(expense.iva_rate ?? 0),
          category_id: expense.category_id ?? null,
          supplier_id: expense.supplier_id ?? null,
          event_id: expense.event_id ?? null,
          date: expense.date,
          paid_amount: Number(expense.paid_amount ?? 0),
          payment_date: expense.date,
        };
        const rows = Object.entries(patch)
          .filter(([k, v]) => String(before[k] ?? "") !== String(v ?? ""))
          .map(([field_name, v]) => ({
            transaction_id: expense.id,
            company_id: expense.company_id,
            changed_by: user?.email ?? "sistema",
            field_name,
            old_value: before[field_name] == null ? null : String(before[field_name]),
            new_value: v == null ? null : String(v),
          }));
        if (rows.length > 0 && expense.company_id) {
          await supabase.from("transaction_audit_log").insert(rows as any);
        }

        await attachDoc(expense.id);
        return;
      }

      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert({
          description: description.trim(),
          type: "expense",
          amount: base,
          iva_rate: rate,
          category_id: categoryId,
          account_id: cardAccountId,
          supplier_id: supplierId || null,
          event_id: eventId || null,
          date,
          status: "paid",
          paid_amount: gross,
          payment_date: date,
          card_session_id: sessionId,
        })
        .select("id")
        .single();
      if (error) throw error;

      await attachDoc(inserted.id);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Despesa atualizada." : "Despesa registada." });
      invalidateCardSessionQueries(qc, sessionId);
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  if (!open) return null;

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{isEdit ? "Editar despesa (cartão)" : "Nova despesa (cartão)"}</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scan do documento — opcional */}
        <div className="mb-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">
            Escanear documento <span className="text-muted-foreground">(opcional — a IA preenche os campos)</span>
          </p>
          {previewUrl && (
            <img src={previewUrl} alt="Documento" className="mb-2 max-h-52 w-full rounded object-contain" />
          )}
          {docFile && !previewUrl && (
            <p className="mb-2 truncate text-xs text-muted-foreground">{docFile.name}</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={ocrLoading}
              onClick={() => cameraRef.current?.click()}
            >
              {ocrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {ocrLoading ? "A ler…" : docFile ? "Substituir foto" : "Tirar foto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={ocrLoading}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="mr-2 h-4 w-4" /> Escolher ficheiro
            </Button>
          </div>
          {ocrPayload && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Pré-preenchido pela IA
              {ocrPayload.confidence ? ` (confiança: ${ocrPayload.confidence})` : ""}
            </p>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept={`image/*,${HEIC_ACCEPT}`}
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          <input
            ref={fileRef}
            type="file"
            accept={`image/*,application/pdf,${HEIC_ACCEPT}`}
            className="hidden"
            onChange={handleFile}
          />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className={inputCls} />
          </div>
          <CardAmountFields
            total={total}
            onTotalChange={setTotal}
            ivaRate={Number(ivaRate) || 0}
            onIvaRateChange={setIvaRate}
            eventId={eventId || null}
            required
            inputClassName={inputCls}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria (L3) *</label>
            <SearchableSelect
              options={l3Options}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Selecionar categoria…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
            <SearchableSelect
              options={events.map((e: any) => ({ value: e.id, label: e.name }))}
              value={eventId}
              onValueChange={setEventId}
              placeholder="(sem evento — custo comum)"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor</label>
            <SearchableSelect
              options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="(opcional)"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={mut.isPending || ocrLoading} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {mut.isPending ? "A guardar…" : isEdit ? "Guardar alterações" : "Registar despesa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
