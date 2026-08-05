import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IvaRate } from "@/lib/mock-data";
import { X, Plus, AlertTriangle, ChevronDown, ChevronRight, Split, Building, FileText, Landmark, Receipt, Sparkles, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { useMasterCategoryDetection } from "@/hooks/useMasterCategoryDetection";
import { LocalReinforcementDialog } from "@/components/LocalReinforcementDialog";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes, sortByHierarchicalCode } from "@/lib/utils";
import { TransactionSplitConfig, type SplitEntry, type SplitBPInfo, type SplitInputMode } from "@/components/TransactionSplitConfig";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { CurrencyAmountInput } from "@/components/CurrencyAmountInput";
import { CurrencyBadge } from "@/components/CurrencyBadge";
import { CurrencyCode, formatInCurrency } from "@/lib/currency";
import { SplitByIvaModal, type IvaSplitLine } from "@/components/SplitByIvaModal";
import { WithholdingDeclaredFields } from "@/components/WithholdingDeclaredFields";
import { extractJpegFromDng, isDngFile } from "@/lib/dng-extract-preview";
import { pdfFirstPageToJpeg } from "@/lib/pdf-first-page-to-jpeg";
import { uploadToCompanyBucket } from "@/lib/storage";
import { getL2Id } from "@/lib/bp-category-constraint";
import { TransactionInstallmentsEditor, type PlannedInstallment } from "@/components/TransactionInstallmentsEditor";

type PaymentMethod = "transfer" | "service_payment" | "state_payment";

interface TransactionForm {
  description: string;
  type: "income" | "expense";
  amount: string;
  iva_rate: IvaRate;
  event_id: string;
  category_id: string;
  supplier_id: string;
  account_id: string;
  date: string;
  due_date: string;
  specification: string;
  pl_override_note: string;
  is_reimbursement: boolean;
  reimbursement_to: string;
  reimbursement_note_id: string;
  invoice_ref: string;
  payment_method: PaymentMethod;
  payment_entity: string;
  payment_reference: string;
  /** Hard-link entre linhas da mesma fatura com várias taxas de IVA. Não exposto no UI. */
  invoice_group_id?: string | null;
  /** Retenção IRS já declarada na fatura. Pré-preenche o modal de pagamento. */
  declared_withholding_rate: string;
  declared_withholding_amount: string;
}

const emptyForm: TransactionForm = {
  description: "",
  type: "income",
  amount: "",
  iva_rate: 23,
  event_id: "",
  category_id: "",
  supplier_id: "",
  account_id: "",
  date: new Date().toISOString().split("T")[0],
  due_date: "",
  specification: "",
  pl_override_note: "",
  is_reimbursement: false,
  reimbursement_to: "",
  reimbursement_note_id: "",
  invoice_ref: "",
  payment_method: "transfer",
  payment_entity: "",
  payment_reference: "",
  declared_withholding_rate: "",
  declared_withholding_amount: "",
};

const formatDueDateInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseDueDateForDb = (value: string) => {
  if (!value.trim()) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

interface TransactionFormModalProps {
  onClose: () => void;
  /** Pre-fill form fields. Use for contextual creation (e.g. from settlement flow). */
  defaults?: Partial<TransactionForm>;
  /** When true, after creation the transaction is immediately marked as paid using account_id + payment_date = date. */
  autoMarkPaid?: boolean;
  /** Optional callback invoked with the new transaction ID after successful creation (and auto-payment if enabled). */
  onCreated?: (transactionId: string) => void;
  /** Optional title override (e.g. "Nova despesa liquidada"). */
  titleOverride?: string;
}

export function TransactionFormModal({ onClose, defaults, autoMarkPaid, onCreated, titleOverride }: TransactionFormModalProps) {
  const { isAdmin: authIsAdmin, isManager: authIsManager, user } = useAuth();
  const [form, setForm] = useState<TransactionForm>({ ...emptyForm, ...(defaults || {}) });
  // Multi-currency state
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  const [originalAmount, setOriginalAmount] = useState<string>("");
  const [fxRate, setFxRate] = useState<string>("");
  const [fxRateSource, setFxRateSource] = useState<"manual" | "suggested">("manual");
  const [eurFromCurrency, setEurFromCurrency] = useState<number>(0);
  // Sync EUR amount back into form.amount when currency != EUR
  useEffect(() => {
    if (currency !== "EUR") {
      setForm((f) => ({ ...f, amount: eurFromCurrency ? String(eurFromCurrency) : "" }));
    }
  }, [currency, eurFromCurrency]);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showProrationConfirm, setShowProrationConfirm] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [plExpanded, setPlExpanded] = useState(true);
  // Linha BP escolhida pelo utilizador (FK a escrever em event_forecasts.transaction_id).
  // Quando set: filtra dropdown de categoria a L3 do mesmo L2 e escreve FK no INSERT.
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null);
  const [plOverride, setPlOverride] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom">("equal");
  const [splitInputMode, setSplitInputMode] = useState<SplitInputMode>("percentage");
  const [splitAutoConfigured, setSplitAutoConfigured] = useState(false);
  const [splitMasterEventId, setSplitMasterEventId] = useState("");
  const [splitExpanded, setSplitExpanded] = useState(false);
  const [isPaidByPartner, setIsPaidByPartner] = useState(false);
  const [paidByPartnerId, setPaidByPartnerId] = useState("");
  const [partnerPaidDate, setPartnerPaidDate] = useState("");
  // Extra do Sócio: despesa paga pela empresa que será descontada do sócio no fecho.
  // Espelho inverso de "Pago por Sócio" — fica is_transitory=true (sem impacto no DRE).
  const [isPartnerExtra, setIsPartnerExtra] = useState(false);
  const [partnerExtraId, setPartnerExtraId] = useState("");
  // Split parcial: quando preenchido (>0 e < amount total), apenas X€ da fatura é extra do sócio.
  // Cria transação principal pelo total (entra DRE/BP) + transação irmã transitória pelo parcial,
  // ligadas pelo mesmo invoice_group_id. A irmã vincula-se a partner_advance_expenses.
  const [partnerExtraPartialAmount, setPartnerExtraPartialAmount] = useState("");
  const [isTransitory, setIsTransitory] = useState(false);
  const [isExcludeFromResult, setIsExcludeFromResult] = useState(false);
  // Shortcut "Caução / Transitória": ativa is_transitory + abre selector "Pago por".
  // - "__mp__" → transitória órfã (Mundo Propício recebe crédito automático no fecho)
  // - partner_id → ativa isPaidByPartner com esse sócio
  const [cautionShortcut, setCautionShortcut] = useState(false);
  const [cautionPayer, setCautionPayer] = useState<string>(""); // "__mp__" | partner_id | ""
  const [showNewReimbursementNote, setShowNewReimbursementNote] = useState(false);
  const [newReimbursementEmployeeName, setNewReimbursementEmployeeName] = useState("");
  const [showSplitDisambiguation, setShowSplitDisambiguation] = useState(false);
  const [disambiguationCategoryId, setDisambiguationCategoryId] = useState("");
  const [disambiguationForecast, setDisambiguationForecast] = useState<any>(null);
  const [showReinforcementDialog, setShowReinforcementDialog] = useState(false);
  const [reinforcementChoice, setReinforcementChoice] = useState<"local" | "master" | null>(null);
  // VAT split: when set, proceedWithCreate creates N sibling transactions sharing invoice_ref.
  const [showSplitByIvaModal, setShowSplitByIvaModal] = useState(false);
  const [pendingIvaSplit, setPendingIvaSplit] = useState<IvaSplitLine[] | null>(null);
  // AI invoice extraction (auto-fills amount + iva_rate, opens split modal if multi-rate).
  const [extractingInvoice, setExtractingInvoice] = useState(false);
  const [aiPrefilledLines, setAiPrefilledLines] = useState<IvaSplitLine[] | null>(null);
  // Ficheiro original lido pelo OCR — pode ser anexado às transações criadas.
  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);
  // Quando o utilizador escolhe IVA médio (1 transação), guardamos o file aqui
  // para anexar via callback onSuccess da mutation single.
  const [attachAfterCreateFile, setAttachAfterCreateFile] = useState<File | null>(null);
  // Em IVA misto, guardamos o file para anexar a TODAS as transações irmãs.
  const [attachIvaSplitFile, setAttachIvaSplitFile] = useState<File | null>(null);
  // ===== Parcelamento (Fase 1.5) =====
  const [useInstallments, setUseInstallments] = useState(false);
  const [installmentRows, setInstallmentRows] = useState<PlannedInstallment[]>([]);
  const [installmentWizard, setInstallmentWizard] = useState<{ count: number; firstDate: string; interval: "weekly" | "biweekly" | "monthly" }>({
    count: 2, firstDate: "", interval: "monthly",
  });
  const queryClient = useQueryClient();

  /**
   * Converte File → base64 (sem prefixo data URL).
   */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = reader.result as string;
        const comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  /**
   * Comprime imagem para limitar payload OCR (~150-300 KB) e evitar
   * "Memory limit exceeded" na edge function. Imagens pequenas (< 200 KB) passam diretas.
   * (Mesma lógica do CamarimItemModal.)
   */
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

      const baseName = file.name.replace(/\.[^.]+$/, "") || "invoice";
      console.log(`[invoice-ocr] compressed ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
      return new File([blob], `${baseName}-ocr.jpg`, { type: "image/jpeg" });
    } catch (err) {
      console.warn("OCR image preparation failed, using original file", err);
      return file;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  /**
   * Lê uma fatura (PDF/imagem/DNG) via edge function `extract-invoice-total` e
   * preenche o formulário automaticamente. Usa o mesmo pipeline de pré-processamento
   * do Camarim (DNG→JPEG, PDF 1ª página→JPEG, compressão ≤1280px) para performance.
   * Se detetar 2+ taxas de IVA, abre o SplitByIvaModal já populado.
   */
  const handleExtractInvoice = async (original: File) => {
    if (!original) return;
    // Limite generoso (50MB) — ficheiros são comprimidos a ~150-300KB antes do envio
    // (PDF→JPEG 1ª página, DNG→preview JPEG, imagens ≤1280px @70%).
    if (original.size > 50 * 1024 * 1024) {
      toast({ title: "Ficheiro grande", description: "Limite 50MB.", variant: "destructive" });
      return;
    }
    setExtractingInvoice(true);
    setPendingInvoiceFile(original);
    try {
      let file = original;

      // 1) DNG/RAW → extrai JPEG embutido
      if (isDngFile(original)) {
        toast({ title: "A processar ficheiro RAW…", description: "A extrair pré-visualização para OCR." });
        try {
          const jpeg = await extractJpegFromDng(original);
          if (jpeg) file = jpeg;
          else {
            toast({
              variant: "destructive",
              title: "RAW sem preview JPEG",
              description: "Tenta exportar como JPG ou desligar o ProRAW na câmara.",
            });
            return;
          }
        } catch (err) {
          console.error("DNG extract failed", err);
          toast({ variant: "destructive", title: "Erro a processar RAW", description: "Exporta como JPG e tenta de novo." });
          return;
        }
      }

      // 2) PDF → 1ª página como JPEG (Gemini só aceita imagem por este caminho)
      let ocrSource: File | null = null;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        toast({ title: "A processar PDF…", description: "A extrair primeira página para OCR." });
        const jpg = await pdfFirstPageToJpeg(file);
        if (jpg) ocrSource = jpg;
        else {
          toast({
            variant: "destructive",
            title: "Não consegui ler o PDF",
            description: "Preenche os campos à mão.",
          });
          return;
        }
      } else {
        // Alguns sistemas (iOS/macOS, partilha entre apps) entregam o ficheiro
        // sem MIME ou com MIME genérico (p.ex. application/octet-stream).
        // Por isso, aceitamos também via extensão do nome para evitar falsos negativos.
        const isImageMime = /^image\/(jpeg|jpg|png|webp|heic|heif|tiff|x-adobe-dng|dng)$/i.test(file.type);
        const isImageExt = /\.(jpe?g|png|webp|heic|heif|dng|tiff?)$/i.test(file.name);
        if (isImageMime || isImageExt) {
          ocrSource = file;
        } else {
          toast({
            variant: "destructive",
            title: "Formato não suportado",
            description: "Usa JPG, PNG, WEBP, HEIC, PDF ou DNG.",
          });
          return;
        }
      }

      // 3) Compressão ≤1280px / ~70% JPEG
      const prepared = await prepareImageForOcr(ocrSource);
      const fileBase64 = await fileToBase64(prepared);

      const { data, error } = await supabase.functions.invoke("extract-invoice-total", {
        body: { fileBase64, fileName: prepared.name, mimeType: prepared.type || "image/jpeg" },
      });
      if (error) throw error;
      const allowed: IvaRate[] = [0, 6, 13, 23];
      const breakdown: Array<{ rate: number; base: number; iva: number; total: number }> = Array.isArray(
        (data as any)?.vat_breakdown,
      )
        ? (data as any).vat_breakdown
        : [];
      const validLines: IvaSplitLine[] = breakdown
        .filter((r) => allowed.includes(r.rate as IvaRate) && Number(r.base) > 0)
        .map((r) => ({
          base: Math.round(Number(r.base) * 100) / 100,
          iva_rate: r.rate as IvaRate,
          suffix: `IVA ${r.rate}%`,
        }));

      if (validLines.length >= 2) {
        setAiPrefilledLines(validLines);
        setShowSplitByIvaModal(true);
        toast({
          title: "Fatura com IVA misto detetada",
          description: `${validLines.length} taxas: ${validLines.map((l) => `${l.base.toFixed(2)}€@${l.iva_rate}%`).join(" · ")}. Confirma para criar transações vinculadas.`,
        });
      } else if (validLines.length === 1) {
        const only = validLines[0];
        setForm((f) => ({ ...f, amount: String(only.base), iva_rate: only.iva_rate }));
        toast({
          title: "Fatura lida",
          description: `Base ${only.base.toFixed(2)}€ a ${only.iva_rate}% preenchida automaticamente.`,
        });
      } else if (typeof (data as any)?.total === "number" && (data as any).total > 0) {
        const total = Number((data as any).total);
        const rate = form.iva_rate;
        const base = Math.round((total / (1 + rate / 100)) * 100) / 100;
        setForm((f) => ({ ...f, amount: String(base) }));
        toast({
          title: "Total lido (sem rodapé de IVA)",
          description: `Total ${total.toFixed(2)}€ · base ${base.toFixed(2)}€ a ${rate}% (taxa atual). Confirma a taxa.`,
        });
      } else {
        toast({
          title: "Nada extraído",
          description: "Não foi possível ler valores. Preenche manualmente.",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("extract-invoice", e);
      toast({
        title: "Erro a ler fatura",
        description: e instanceof Error ? e.message : "Tenta de novo ou preenche manualmente.",
        variant: "destructive",
      });
    } finally {
      setExtractingInvoice(false);
    }
  };


  const { data: events = [] } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, pl_mode, event_type, parent_event_id" as any).in("status", ["active", "confirmed"]).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, name, code, type, parent_id, event_required").eq("is_active", true);
      if (error) throw error;
      return sortByHierarchicalCode(data ?? [], (category) => category.code);
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, trade_name, nif, iban, swift_bic, iban_2, swift_bic_2, iban_3, swift_bic_3").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedSupplier = suppliers.find((s: any) => s.id === form.supplier_id) ?? null;

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).eq("is_hidden", false).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Event partners for "paid by partner" feature
  // - Single transaction: read partners from the selected event, inheriting from Master if empty
  // - Split (multi-event): read partners from the Master event of the tour (splitMasterEventId)
  const partnersLookupEventId = form.event_id || splitMasterEventId;
  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event-partners-for-tx", partnersLookupEventId],
    queryFn: async () => {
      if (!partnersLookupEventId) return [];
      // 1) Try the event itself
      const { data: own, error: ownErr } = await supabase
        .from("event_partners")
        .select("id, percentage, suppliers(name)")
        .eq("event_id", partnersLookupEventId)
        .order("created_at");
      if (ownErr) throw ownErr;
      if (own && own.length > 0) return own;

      // 2) Fallback: inherit from Master (parent_event_id) if any
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("parent_event_id")
        .eq("id", partnersLookupEventId)
        .maybeSingle();
      if (evErr) throw evErr;
      if (!ev?.parent_event_id) return [];

      const { data: inherited, error: inhErr } = await supabase
        .from("event_partners")
        .select("id, percentage, suppliers(name)")
        .eq("event_id", ev.parent_event_id)
        .order("created_at");
      if (inhErr) throw inhErr;
      return inherited || [];
    },
    enabled: !!partnersLookupEventId,
  });

  const { data: reimbursementNotes = [] } = useQuery({
    queryKey: ["reimbursement-notes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .select("id, code, employee_name, status")
        .in("status", ["draft", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: form.is_reimbursement,
  });

  const effectiveEventId = form.event_id || splitMasterEventId;
  const selectedEvent = events.find((e: any) => e.id === form.event_id);
  const effectiveEvent = events.find((e: any) => e.id === effectiveEventId);
  const isActivePL = effectiveEvent?.pl_mode === "active";
  const hasPL = effectiveEvent?.pl_mode === "active" || effectiveEvent?.pl_mode === "passive";
  const hasPLRestriction = hasPL;
  const isParentMultiDay = effectiveEvent?.event_type === "multi_day";
  const isSubEvent = !!selectedEvent?.parent_event_id;

  // Detect if this sub-event's category has a Master BP line (for reinforcement dialog)
  const masterDetection = useMasterCategoryDetection(form.event_id, events as any);

  const parentEvents = useMemo(() => events.filter((e: any) => !e.parent_event_id), [events]);
  const subEventsByParent = useMemo(() => {
    const map: Record<string, any[]> = {};
    events.filter((e: any) => e.parent_event_id).forEach((e: any) => {
      if (!map[e.parent_event_id]) map[e.parent_event_id] = [];
      map[e.parent_event_id].push(e);
    });
    return map;
  }, [events]);

  // For parent multi_day events, fetch parent's own BP + child BPs for aggregation
  // For child (split) events, also include parent's BP lines (shared/prorated costs)
  // For split auto-configured (Master selected), use splitMasterEventId
  const forecastEventIds = useMemo(() => {
    const eid = effectiveEventId;
    if (!eid) return [];
    const ev = events.find((e: any) => e.id === eid);
    if (ev?.event_type === "multi_day") {
      const childIds = (subEventsByParent[eid] || []).map((e: any) => e.id);
      return [eid, ...childIds];
    }
    // If this is a child event, include the parent's BP too
    const parentId = ev?.parent_event_id;
    if (parentId) {
      return [eid, parentId];
    }
    return [eid];
  }, [effectiveEventId, events, subEventsByParent]);

  // Build event options for SearchableSelect
  const eventOptions = useMemo(() => {
    const opts: { value: string; label: string; group?: string; indent?: boolean; icon?: string }[] = [];
    parentEvents.forEach((ev: any) => {
      const subs = subEventsByParent[ev.id] || [];
      const isMulti = ev.event_type === "multi_day" && subs.length > 0;
      const groupName = isMulti ? `🔀 ${ev.name} (Turnê)` : undefined;
      opts.push({
        value: ev.id,
        label: `${ev.name}${ev.pl_mode === "active" ? " 🔒" : ""}${isMulti ? " ⚡ Rateio" : ""}`,
        group: groupName,
      });
      subs.forEach((sub: any) => {
        opts.push({
          value: sub.id,
          label: `${ev.name} — ${sub.name}`,
          group: groupName,
          indent: true,
          icon: "↳",
        });
      });
    });
    return opts;
  }, [parentEvents, subEventsByParent]);

  const { data: eventForecasts = [] } = useQuery({
    queryKey: ["event_forecasts_budget", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, category_id, amount, status, description, iva_rate, specification")
        .in("event_id", forecastEventIds).is("version_id", null);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveEventId && hasPL && forecastEventIds.length > 0,
  });

  const { data: eventTransactions = [] } = useQuery({
    queryKey: ["event_transactions_budget", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, category_id, amount, event_id")
        .in("event_id", forecastEventIds);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveEventId && hasPL && forecastEventIds.length > 0,
  });

  // For multi_day (Master) events, only transactions explicitly linked to a Master BP line
  // (via event_forecasts.transaction_id) should consume the Master budget. Custos Isolados
  // and stand-alone sub-event transactions must NOT abate the Master ceiling.
  const { data: masterLinkedTxIds = [] } = useQuery({
    queryKey: ["master_linked_tx_ids", effectiveEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("transaction_id")
        .eq("event_id", effectiveEventId!)
        .not("transaction_id", "is", null).is("version_id", null);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.transaction_id as string);
    },
    enabled: !!effectiveEventId && hasPL && effectiveEvent?.event_type === "multi_day",
  });

  // Fetch cache configs for this event (aggregate from children for parent tours)
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["event_cache_configs_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs")
        .select("*")
        .in("event_id", forecastEventIds);
      if (error) throw error;
      return data as CacheConfig[];
    },
    enabled: !!effectiveEventId && hasPL && forecastEventIds.length > 0,
  });

  const { data: cacheDeductions = [] } = useQuery({
    queryKey: ["event_cache_deductions_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      if (cacheConfigs.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions")
        .select("*")
        .in("cache_config_id", cacheConfigs.map(c => c.id));
      if (error) throw error;
      return data as CacheDeduction[];
    },
    enabled: !!effectiveEventId && hasPL && cacheConfigs.length > 0,
  });

  // Fetch ticket lots for cachê calculation (aggregate from children for parent tours)
  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ticket_lots_form", form.event_id, forecastEventIds],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", forecastEventIds);
      if (!zones || zones.length === 0) return [];
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, iva_rate, quantity")
        .in("zone_id", zones.map(z => z.id));
      return lots || [];
    },
    enabled: !!effectiveEventId && hasPL && cacheConfigs.length > 0,
  });

  const ticketRevenueGross = useMemo(() => {
    return ticketLots.reduce((s, l: any) => s + Number(l.quantity) * Number(l.price), 0);
  }, [ticketLots]);

  const ticketRevenueNet = useMemo(() => {
    return ticketLots.reduce((s, l: any) => {
      const rate = Number(l.iva_rate ?? 6);
      return s + Number(l.quantity) * (Number(l.price) / (1 + rate / 100));
    }, 0);
  }, [ticketLots]);

  // When selecting a parent multi_day event, only show the parent's own BP lines (for proration)
  const relevantForecasts = useMemo(() => {
    if (isParentMultiDay) {
      return eventForecasts.filter((f: any) => f.event_id === effectiveEventId);
    }
    return eventForecasts;
  }, [eventForecasts, isParentMultiDay, effectiveEventId]);

  // Forecast vinculado: usado para filtrar categoria por L2 e escrever FK no INSERT.
  const selectedForecast = useMemo(
    () => (selectedForecastId ? (relevantForecasts as any[]).find((f: any) => f.id === selectedForecastId) : null),
    [selectedForecastId, relevantForecasts],
  );
  const selectedForecastL2Id = useMemo(
    () => (selectedForecast ? getL2Id(selectedForecast.category_id, categories as any[]) : null),
    [selectedForecast, categories],
  );
  const selectedForecastL2Label = useMemo(() => {
    if (!selectedForecastL2Id) return null;
    const l2 = (categories as any[]).find((c) => c.id === selectedForecastL2Id);
    return l2 ? `${l2.code} ${l2.name}` : null;
  }, [selectedForecastL2Id, categories]);

  // Reset vínculo quando o evento muda (linha BP deixa de fazer sentido noutro evento).
  useEffect(() => {
    if (selectedForecastId) setSelectedForecastId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.event_id]);

  // Helper: when user is in a sub-event and selects a category from the parent's BP,
  // show disambiguation dialog instead of auto-activating split.
  // `clickedLine` (optional): when the user clicks a specific BP line, prefer it
  // for auto-fill instead of falling back to the first matching forecast in the category.
  const tryAutoSplitFromSubEvent = (categoryId: string, type: string, clickedLine?: any) => {
    if (!isSubEvent || isSplit || !categoryId) return false;
    const parentId = selectedEvent?.parent_event_id;
    if (!parentId) return false;

    // Check if this category exists in the parent's BP
    const parentForecast = eventForecasts.find(
      (f: any) => f.event_id === parentId && f.type === type && f.category_id === categoryId
    );
    if (!parentForecast) return false;

    // Determine the sub-event forecast to use for auto-fill on "Exclusive":
    // 1) If user clicked a specific line in the sub-event's BP, prefer it.
    // 2) Otherwise fall back to the first matching forecast in the category.
    const clickedIsSubEventLine =
      clickedLine && clickedLine.event_id === form.event_id;
    const subEventForecast = clickedIsSubEventLine
      ? clickedLine
      : eventForecasts.find(
          (f: any) => f.event_id === form.event_id && f.type === type && f.category_id === categoryId
        );

    // Get all sibling sub-events (children of the same parent)
    const siblings = subEventsByParent[parentId] || [];
    if (siblings.length < 2) return false;

    // Show disambiguation dialog
    setDisambiguationCategoryId(categoryId);
    setDisambiguationForecast({ parentForecast, subEventForecast, parentId, siblings });
    setShowSplitDisambiguation(true);
    return true;
  };

  // Confirm split (rateio) from disambiguation
  const confirmSplitFromDisambiguation = () => {
    const { parentForecast, parentId, siblings } = disambiguationForecast;
    const parentEvent = events.find((e: any) => e.id === parentId);
    const pct = +(100 / siblings.length).toFixed(2);
    const entries: SplitEntry[] = siblings.map((child: any, idx: number) => {
      const name = parentEvent ? `${parentEvent.name} — ${child.name}` : child.name;
      const percentage = idx === siblings.length - 1
        ? +(100 - pct * (siblings.length - 1)).toFixed(2)
        : pct;
      return { event_id: child.id, event_name: name, percentage };
    });

    setIsSplit(true);
    setSplitAutoConfigured(true);
    setSplitMasterEventId(parentId);
    setSplitExpanded(false);
    setSplitEntries(entries);
    setSplitMethod("equal");

    // Fill form fields from the Master's BP forecast data
    setForm(prev => ({
      ...prev,
      event_id: "",
      category_id: disambiguationCategoryId,
      description: parentForecast.description || "",
      amount: String(Number(parentForecast.amount) || ""),
      iva_rate: (parentForecast.iva_rate ?? 23) as IvaRate,
      specification: parentForecast.specification || "",
    }));

    setShowSplitDisambiguation(false);
    setDisambiguationCategoryId("");
    setDisambiguationForecast(null);
  };

  // Confirm exclusive (this event only) from disambiguation
  const confirmExclusiveFromDisambiguation = () => {
    const categoryId = disambiguationCategoryId;
    const subForecast = disambiguationForecast?.subEventForecast;

    if (subForecast) {
      // Category exists in sub-event's BP — fill from it
      setForm(prev => ({
        ...prev,
        category_id: categoryId,
        description: subForecast.description || "",
        amount: String(Number(subForecast.amount) || ""),
        iva_rate: (subForecast.iva_rate ?? 23) as IvaRate,
        specification: subForecast.specification || "",
      }));
    } else {
      // Not in sub-event BP — set category and activate override
      setForm(prev => ({ ...prev, category_id: categoryId }));
      setPlOverride(true);
    }

    setShowSplitDisambiguation(false);
    setDisambiguationCategoryId("");
    setDisambiguationForecast(null);
    setPlExpanded(false);
  };

  // Reset payment_method when category changes away from state categories
  useEffect(() => {
    if (form.payment_method === "state_payment" && form.category_id) {
      const selectedCat = categories.find((c: any) => c.id === form.category_id);
      const isState = selectedCat?.code?.startsWith("10.4") || selectedCat?.code?.startsWith("10.5");
      if (!isState) {
        setForm(prev => ({ ...prev, payment_method: "transfer", payment_entity: "", payment_reference: "" }));
      }
    }
  }, [form.category_id, categories]);

  // Reset reinforcement choice when event or category changes
  useEffect(() => {
    setReinforcementChoice(null);
  }, [form.event_id, form.category_id]);

  const forecastBudgetByCategory = hasPL
    ? relevantForecasts.reduce<Record<string, number>>((acc, f) => {
        const key = `${f.type}_${f.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(f.amount);
        return acc;
      }, {})
    : {};

  const usedBudgetByCategory = hasPL
    ? eventTransactions.reduce<Record<string, number>>((acc, t: any) => {
        // For Master (multi_day) events, only count transactions explicitly linked to a
        // Master BP line. Sub-event transactions classified as "Custo Isolado" must not
        // consume the Master budget.
        if (effectiveEvent?.event_type === "multi_day" && t.event_id !== effectiveEventId) {
          if (!masterLinkedTxIds.includes(t.id)) return acc;
        }
        const key = `${t.type}_${t.category_id || "none"}`;
        acc[key] = (acc[key] || 0) + Number(t.amount);
        return acc;
      }, {})
    : {};

  const allowedCategoryIds = hasPLRestriction
    ? [...new Set(relevantForecasts.filter(f => f.type === form.type).map(f => f.category_id).filter(Boolean))]
    : [];

  // --- BP data for split events ---
  const splitEventIds = useMemo(() => splitEntries.map(e => e.event_id), [splitEntries]);

  // Find parent event IDs for split entries (for category validation)
  const splitParentEventIds = useMemo(() => {
    if (!isSplit || splitEventIds.length === 0) return [];
    const parentIds = new Set<string>();
    for (const eventId of splitEventIds) {
      const ev = events.find((e: any) => e.id === eventId);
      if (ev?.parent_event_id) parentIds.add(ev.parent_event_id);
    }
    return [...parentIds];
  }, [isSplit, splitEventIds, events]);

  // Fetch parent event forecasts for split validation
  const { data: parentForecasts = [] } = useQuery({
    queryKey: ["split-parent-bp-forecasts", splitParentEventIds],
    queryFn: async () => {
      if (splitParentEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, type, category_id, amount")
        .in("event_id", splitParentEventIds).is("version_id", null);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitParentEventIds.length > 0,
  });

  const { data: splitForecasts = [] } = useQuery({
    queryKey: ["split-bp-forecasts", splitEventIds],
    queryFn: async () => {
      if (splitEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, type, category_id, amount")
        .in("event_id", splitEventIds).is("version_id", null);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitEventIds.length > 0,
  });

  const { data: splitTransactions = [] } = useQuery({
    queryKey: ["split-bp-transactions", splitEventIds],
    queryFn: async () => {
      if (splitEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, category_id, amount, parent_transaction_id")
        .in("event_id", splitEventIds);
      if (error) throw error;
      return data;
    },
    enabled: isSplit && splitEventIds.length > 0,
  });

  // Fetch Master split transactions (parent rows: event_id null, with children in current splitEventIds)
  // Used to compute "used" against the Master BP balance (separate bucket from Sub-local expenses)
  const { data: masterSplitUsed = 0 } = useQuery({
    queryKey: ["master-split-used", splitParentEventIds, form.category_id, form.type],
    queryFn: async () => {
      if (splitParentEventIds.length === 0 || !form.category_id) return 0;
      const { data: subEvents, error: subErr } = await supabase
        .from("events")
        .select("id")
        .in("parent_event_id", splitParentEventIds);
      if (subErr) throw subErr;
      const subIds = (subEvents ?? []).map((e: any) => e.id);
      if (subIds.length === 0) return 0;
      const { data: childTxs, error: childErr } = await supabase
        .from("transactions")
        .select("amount, parent_transaction_id")
        .in("event_id", subIds)
        .eq("category_id", form.category_id)
        .eq("type", form.type)
        .not("parent_transaction_id", "is", null);
      if (childErr) throw childErr;
      return (childTxs ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    },
    enabled: isSplit && splitParentEventIds.length > 0 && !!form.category_id,
  });

  const splitBudgetKey = `${form.type}_${form.category_id || "none"}`;
  const shouldUseEffectiveMasterBudget =
    isSplit &&
    !!effectiveEventId &&
    effectiveEvent?.event_type === "multi_day" &&
    splitParentEventIds.includes(effectiveEventId);

  const splitCategoryExistsInParent = useMemo(() => {
    if (!isSplit || !form.category_id) return false;
    if (shouldUseEffectiveMasterBudget) {
      return relevantForecasts.some(
        (f: any) => f.type === form.type && f.category_id === form.category_id,
      );
    }
    return parentForecasts.some(
      f => f.type === form.type && f.category_id === form.category_id,
    );
  }, [isSplit, form.category_id, form.type, shouldUseEffectiveMasterBudget, relevantForecasts, parentForecasts]);

  const splitParentForecastTotal = useMemo(() => {
    if (!isSplit || !form.category_id) return 0;
    if (shouldUseEffectiveMasterBudget) {
      return Number(forecastBudgetByCategory[splitBudgetKey] || 0);
    }
    return parentForecasts
      .filter(f => f.type === form.type && f.category_id === form.category_id)
      .reduce((s, f) => s + Number(f.amount), 0);
  }, [isSplit, form.category_id, form.type, shouldUseEffectiveMasterBudget, forecastBudgetByCategory, splitBudgetKey, parentForecasts]);

  const splitParentUsedTotal = useMemo(() => {
    if (!isSplit || !form.category_id) return 0;
    if (shouldUseEffectiveMasterBudget) {
      return Number(usedBudgetByCategory[splitBudgetKey] || 0);
    }
    return Number(masterSplitUsed || 0);
  }, [isSplit, form.category_id, shouldUseEffectiveMasterBudget, usedBudgetByCategory, splitBudgetKey, masterSplitUsed]);

  const splitBPInfoByEvent = useMemo<Record<string, SplitBPInfo>>(() => {
    if (!isSplit || splitEventIds.length === 0 || !form.category_id) return {};

    const result: Record<string, SplitBPInfo> = {};
    for (const eventId of splitEventIds) {
      const ev = events.find((e: any) => e.id === eventId);
      const evForecasts = splitForecasts.filter(f => f.event_id === eventId);
      // Sub-local "used" = transactions in the Sub for this category that are NOT children of a Master split
      const evTransactions = splitTransactions.filter(
        (t: any) => t.event_id === eventId && !t.parent_transaction_id,
      );
      const childForecastMatch = evForecasts.some(f => f.type === form.type && f.category_id === form.category_id);
      const hasAnyForecasts = evForecasts.length > 0 || splitCategoryExistsInParent;
      const hasForecastMatch = childForecastMatch || splitCategoryExistsInParent;
      const childForecast = evForecasts
        .filter(f => f.type === form.type && f.category_id === form.category_id)
        .reduce((s, f) => s + Number(f.amount), 0);
      const childUsed = evTransactions
        .filter((t: any) => t.type === form.type && t.category_id === form.category_id)
        .reduce((s: number, t: any) => s + Number(t.amount), 0);

      const useMasterBucket = splitCategoryExistsInParent;
      const forecast = useMasterBucket
        ? splitParentForecastTotal
        : (childForecast > 0 ? childForecast : 0);
      const used = useMasterBucket
        ? splitParentUsedTotal
        : childUsed;

      result[eventId] = {
        event_id: eventId,
        pl_mode: ev?.pl_mode ?? null,
        forecast,
        used,
        hasForecastMatch,
        hasAnyForecasts,
      };
    }
    return result;
  }, [
    isSplit,
    splitEventIds,
    form.category_id,
    form.type,
    splitForecasts,
    splitTransactions,
    events,
    splitCategoryExistsInParent,
    splitParentForecastTotal,
    splitParentUsedTotal,
  ]);

  // Validate split category against parent/child BP rules
  const splitCategoryBlockReason = useMemo<string | null>(() => {
    if (!isSplit || !form.category_id || splitEventIds.length === 0) return null;
    // When auto-configured from sub-event selecting a Master BP category, skip blocking
    if (splitAutoConfigured) return null;

    // Rule 1: Category already exists in the parent/master event's BP → block
    if (splitParentEventIds.length > 0 && splitCategoryExistsInParent) {
      const parentEvent = events.find((e: any) => splitParentEventIds.includes(e.id));
      const parentName = parentEvent?.name ?? "evento master";
      return `Esta categoria já existe no BP do ${parentName}. A transação deve ser criada directamente no evento master, que fará o rateio automático para os sub-eventos.`;
    }

    // Rule 2: removed — now handled as warning only (splitCategoryWarning)

    return null;
  }, [isSplit, splitAutoConfigured, form.category_id, splitEventIds.length, splitParentEventIds, splitCategoryExistsInParent, events]);

  // Warning (non-blocking): category in all children but not in master
  const splitCategoryWarning = useMemo<string | null>(() => {
    if (!isSplit || !form.category_id || splitEventIds.length < 2 || splitAutoConfigured) return null;
    if (splitParentEventIds.length === 0) return null;
    if (splitCategoryExistsInParent) return null;
    const allChildrenHaveCategory = splitEventIds.every(eventId =>
      splitForecasts.some(f => f.event_id === eventId && f.type === form.type && f.category_id === form.category_id)
    );
    if (!allChildrenHaveCategory) return null;
    const parentEvent = events.find((e: any) => splitParentEventIds.includes(e.id));
    const parentName = parentEvent?.name ?? "evento master";
    const selectedCat = categories.find((c: any) => c.id === form.category_id);
    const catLabel = selectedCat ? `${selectedCat.code} ${selectedCat.name}` : "esta categoria";
    return `A categoria "${catLabel}" existe no BP dos sub-eventos mas não no master (${parentName}). A transação será criada normalmente.`;
  }, [isSplit, splitAutoConfigured, form.category_id, form.type, splitEventIds, splitParentEventIds, splitCategoryExistsInParent, splitForecasts, events, categories]);

  // Check if any split event needs BP bypass.
  // Rateio Master → validates against the Master bucket as a whole (sum of fatias = totalAmount).
  // Despesa local (Sub-only line) → validates per-Sub against the Sub bucket.
  const splitNeedsBypass = useMemo(() => {
    if (!isSplit || !form.category_id || splitCategoryBlockReason) return false;
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) return false;

    // CASE A: rateio Master — the whole transaction consumes the Master bucket
    if (splitCategoryExistsInParent) {
      const remaining = splitParentForecastTotal - splitParentUsedTotal;
      return amount > remaining + 0.005;
    }

    // CASE B: per-Sub validation against local BP
    for (const entry of splitEntries) {
      const bp = splitBPInfoByEvent[entry.event_id];
      if (!bp || !bp.hasAnyForecasts) continue;
      const childAmount = +(amount * entry.percentage / 100).toFixed(2);
      if (!bp.hasForecastMatch) return true;
      const remaining = bp.forecast - bp.used;
      if (bp.forecast > 0 && childAmount > remaining + 0.005) return true;
    }
    return false;
  }, [
    isSplit,
    form.category_id,
    form.amount,
    splitCategoryBlockReason,
    splitCategoryExistsInParent,
    splitParentForecastTotal,
    splitParentUsedTotal,
    splitEntries,
    splitBPInfoByEvent,
  ]);

  const createMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      let createdTxId: string | null = null;
      // Cauções/Transitórias NUNCA são rateadas entre sub-eventos: ficam sempre
      // como lançamento único no evento Master. (Não compõem resultado, logo o
      // rateio por cidade não tem propósito contabilístico.)
      // Se o utilizador estiver no modo "split" (auto ou manual) e marcar caução,
      // forçamos a transação a ser gravada apenas no Master.
      if (isTransitory && isSplit && splitMasterEventId) {
        data = { ...data, event_id: splitMasterEventId };
      }
      if (isSplit && splitEntries.length >= 2 && !isTransitory) {
        // --- SPLIT TRANSACTION ---
        const totalAmount = parseFloat(data.amount);
        const isAbsoluteMode = splitInputMode === "absolute";

        // 1. Build child inserts first to determine parent status
        const childInserts = splitEntries.map((entry) => {
          const childAmount = isAbsoluteMode
            ? +(totalAmount * entry.percentage / 100).toFixed(2) // percentage was already computed from absolute
            : +(totalAmount * entry.percentage / 100).toFixed(2);
          const bp = splitBPInfoByEvent[entry.event_id];
          const hasBP = bp && bp.hasAnyForecasts;
          const hasForecastMatch = bp?.hasForecastMatch ?? false;
          
          // Determine if this child needs override
          let needsOverride = false;
          if (hasBP) {
            if (!hasForecastMatch) {
              needsOverride = true;
            } else {
              const remaining = bp.forecast - bp.used;
              if (bp.forecast > 0 && childAmount > remaining) {
                needsOverride = true;
              }
            }
          }

          const childStatus = (hasForecastMatch && !needsOverride) ? "approved" : "pending";

          return {
            description: data.description,
            type: data.type,
            amount: childAmount,
            iva_rate: data.iva_rate,
            event_id: entry.event_id,
            category_id: data.category_id || null,
            supplier_id: data.supplier_id || null,
            account_id: null,
            specification: data.type === "expense" ? (data.specification || null) : null,
            pl_override_note: needsOverride ? (data.pl_override_note.trim() || null) : null,
            date: data.date,
            due_date: parseDueDateForDb(data.due_date),
            status: childStatus,
            paid_amount: 0,
            split_percentage: entry.percentage,
            split_amount: isAbsoluteMode ? childAmount : null,
            parent_transaction_id: "", // placeholder, set after parent insert
            is_transitory: isTransitory || isPartnerExtra,
            exclude_from_result: isExcludeFromResult,
            payment_method: data.payment_method || "transfer",
            payment_entity: data.payment_method === "service_payment" ? (data.payment_entity.trim() || null) : null,
            payment_reference: data.payment_method !== "transfer" ? (data.payment_reference.trim() || null) : null,
            declared_withholding_rate: data.type === "expense" && parseFloat(data.declared_withholding_rate) > 0 ? Number(data.declared_withholding_rate) : null,
            declared_withholding_amount: data.type === "expense" && parseFloat(data.declared_withholding_amount) > 0 ? +(parseFloat(data.declared_withholding_amount) * (entry.percentage / 100)).toFixed(2) : null,
          };
        });

        // Parent is approved only if ALL children are approved.
        // Pago por Sócio: parent fica imediatamente liquidado.
        const allChildrenApproved = childInserts.every(c => c.status === "approved");
        const parentStatus = isPaidByPartner ? "paid" : (allChildrenApproved ? "approved" : "pending");
        const parentPaidAmount = isPaidByPartner ? totalAmount : 0;
        const parentPaymentDate = isPaidByPartner ? (partnerPaidDate || data.date) : null;

        // 2. Create parent transaction (no event)
        const parentAccountId = isPaidByPartner ? null : (data.account_id || null);
        const { data: parentRow, error: parentError } = await supabase.from("transactions").insert({
          description: data.description,
          type: data.type,
          amount: totalAmount,
          iva_rate: data.iva_rate,
          event_id: null,
          category_id: data.category_id || null,
          supplier_id: data.supplier_id || null,
          account_id: parentAccountId,
          specification: data.type === "expense" ? (data.specification || null) : null,
          pl_override_note: data.pl_override_note.trim() || null,
          date: data.date,
          due_date: parseDueDateForDb(data.due_date),
          status: parentStatus,
          paid_amount: parentPaidAmount,
          payment_date: parentPaymentDate,
           split_percentage: null,
           parent_transaction_id: null,
           split_mode: isAbsoluteMode ? "absolute" : "percentage",
           is_transitory: isTransitory || isPartnerExtra,
          exclude_from_result: isExcludeFromResult,
          invoice_ref: data.invoice_ref.trim() || null,
          payment_method: data.payment_method || "transfer",
          payment_entity: data.payment_method === "service_payment" ? (data.payment_entity.trim() || null) : null,
          payment_reference: data.payment_method !== "transfer" ? (data.payment_reference.trim() || null) : null,
          declared_withholding_rate: data.type === "expense" && parseFloat(data.declared_withholding_rate) > 0 ? Number(data.declared_withholding_rate) : null,
          declared_withholding_amount: data.type === "expense" && parseFloat(data.declared_withholding_amount) > 0 ? parseFloat(data.declared_withholding_amount) : null,
        } as any).select("id").single();
        if (parentError) throw parentError;
        const parentId = parentRow.id;

        // Audit: log creation of parent split
        {
          const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
          await supabase.from("transaction_audit_log").insert({
            transaction_id: parentId,
            changed_by: callerName,
            field_name: "Criação",
            old_value: null,
            new_value: `Rateio Master — ${data.description} — ${totalAmount.toFixed(2)} €`,
          });
        }

        // 3. Set parent ID on children and insert
        const childInsertsWithParent = childInserts.map(c => ({ ...c, parent_transaction_id: parentId }));
        const { error: childError } = await supabase.from("transactions").insert(childInsertsWithParent as any);
        if (childError) throw childError;

        // 4. If paid by partner, link parent transaction to partner_paid_expenses
        //    using the tour Master event (splitMasterEventId) where partners exist
        if (isPaidByPartner && paidByPartnerId && splitMasterEventId) {
          await supabase.from("partner_paid_expenses").insert({
            event_id: splitMasterEventId,
            partner_id: paidByPartnerId,
            transaction_id: parentId,
            paid_date: partnerPaidDate || data.date,
          } as any);
        }
        // 4b. Extra do Sócio em rateio Master — vincula ao evento Master
        if (isPartnerExtra && partnerExtraId && splitMasterEventId) {
          await supabase.from("partner_advance_expenses").insert({
            event_id: splitMasterEventId,
            partner_id: partnerExtraId,
            transaction_id: parentId,
          } as any);
        }
      } else {
        // --- SINGLE TRANSACTION ---
        // Auto-aprovação: a categoria tem linha(s) do BP APROVADAS para este tipo,
        // e o valor lançado cabe dentro do saldo restante (forecast - já usado).
        // Se exceder o saldo (lançamento "fora do planeado"), fica pending para revisão.
        const matchingForecasts = relevantForecasts.filter(
          (f) => f.type === data.type && f.category_id === data.category_id
        );
        const hasForecastMatch = matchingForecasts.length > 0;
        const hasApprovedBPLine = matchingForecasts.some((f) => f.status === "approved");
        const budgetKey = `${data.type}_${data.category_id || "none"}`;
        const forecastTotal = forecastBudgetByCategory[budgetKey] || 0;
        const usedTotal = usedBudgetByCategory[budgetKey] || 0;
        const remaining = forecastTotal - usedTotal;
        const newAmount = parseFloat(data.amount) || 0;
        const fitsWithinBudget = forecastTotal > 0 && newAmount <= remaining + 0.005;
        const autoApproved = hasForecastMatch && hasApprovedBPLine && fitsWithinBudget;

        const accountId = data.is_reimbursement || isPaidByPartner ? null : (data.account_id || null);
        // Pago por Sócio: já fica liquidado, sem conta financeira da empresa.
        // Usa partnerPaidDate (data em que o sócio pagou) como payment_date.
        const partnerStatus = useInstallments ? (autoApproved ? "approved" : "pending") : (isPaidByPartner ? "paid" : (autoMarkPaid ? "paid" : (autoApproved ? "approved" : "pending")));
        const partnerPaidAmount = useInstallments ? 0 : (isPaidByPartner ? parseFloat(data.amount) : (autoMarkPaid ? parseFloat(data.amount) : 0));
        const partnerPaymentDate = useInstallments ? null : (isPaidByPartner ? (partnerPaidDate || data.date) : (autoMarkPaid ? data.date : null));

        // Split parcial do Extra do Sócio: a fatura principal fica NORMAL pelo total
        // e cria-se uma irmã transitória pelo valor parcial vinculada via invoice_group_id.
        const totalAmtNum = parseFloat(data.amount) || 0;
        const partnerExtraPartialNum = parseFloat(partnerExtraPartialAmount) || 0;
        const isPartnerExtraPartial = isPartnerExtra && partnerExtraPartialNum > 0 && partnerExtraPartialNum < totalAmtNum;
        const principalIsTransitory = isTransitory || (isPartnerExtra && !isPartnerExtraPartial);
        // Garante invoice_group_id partilhado para amarrar as duas linhas (se já não vier um, gera um).
        let sharedInvoiceGroupId: string | null = data.invoice_group_id ?? null;
        if (isPartnerExtraPartial && !sharedInvoiceGroupId) {
          sharedInvoiceGroupId = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }

        // Quando "Pagar em parcelas" está ativo, criamos N TRANSAÇÕES IRMÃS
        // (uma por vencimento) em vez de 1 TX + N transaction_payments.
        // Assim cada parcela entra naturalmente nas listas de vencidos, contas a
        // pagar e fluxo de caixa. A 1ª parcela usa esta inserção; as restantes
        // são criadas a seguir, partilhando todos os metadados.
        const ivaMultiplier = 1 + Number(data.iva_rate || 0) / 100;
        const totalSuffix = useInstallments ? ` (1/${installmentRows.length})` : "";
        const firstParcelNet = useInstallments
          ? +(Number(installmentRows[0]?.amount || 0) / ivaMultiplier).toFixed(2)
          : parseFloat(data.amount);
        const firstParcelDueDate = useInstallments
          ? installmentRows[0]?.scheduled_date || parseDueDateForDb(data.due_date)
          : parseDueDateForDb(data.due_date);

        const { data: insertedTx, error } = await supabase.from("transactions").insert({
          description: data.description + totalSuffix,
          type: data.type,
          amount: firstParcelNet,
          iva_rate: data.iva_rate,
          event_id: data.event_id || null,
          category_id: data.category_id || null,
          supplier_id: data.supplier_id || null,
          account_id: accountId,
          specification: data.type === "expense" ? (data.specification || null) : null,
          pl_override_note: data.pl_override_note.trim() || null,
          date: data.date,
          due_date: firstParcelDueDate,
          status: partnerStatus,
          paid_amount: partnerPaidAmount,
          payment_date: partnerPaymentDate,
          is_reimbursement: data.is_reimbursement,
          reimbursement_to: data.is_reimbursement ? (data.reimbursement_to.trim() || null) : null,
          is_transitory: principalIsTransitory,
          exclude_from_result: isExcludeFromResult,
          invoice_ref: data.invoice_ref.trim() || null,
          invoice_group_id: sharedInvoiceGroupId,
          payment_method: data.payment_method || "transfer",
          payment_entity: data.payment_method === "service_payment" ? (data.payment_entity.trim() || null) : null,
          payment_reference: data.payment_method !== "transfer" ? (data.payment_reference.trim() || null) : null,
          declared_withholding_rate: data.type === "expense" && parseFloat(data.declared_withholding_rate) > 0 ? Number(data.declared_withholding_rate) : null,
          declared_withholding_amount: data.type === "expense" && parseFloat(data.declared_withholding_amount) > 0 ? parseFloat(data.declared_withholding_amount) : null,
          currency,
          original_amount: currency === "EUR" ? null : (parseFloat(originalAmount) || null),
          fx_rate: currency === "EUR" ? null : (parseFloat(fxRate) || null),
          fx_rate_source: currency === "EUR" ? null : fxRateSource,
        } as any).select("id").single();
        if (error) throw error;
        createdTxId = insertedTx?.id ?? null;

        // 🔑 Escreve FK event_forecasts.transaction_id ↔ TX criada.
        // Defesa universal: o trigger trg_enforce_tx_category_l2_match valida que a L3 escolhida
        // pertence ao mesmo L2 do BP. Sem FK, a TX fica "órfã" (qualquer L3 aceite).
        if (insertedTx?.id && selectedForecastId) {
          const { error: fkErr } = await supabase
            .from("event_forecasts")
            .update({ transaction_id: insertedTx.id } as any)
            .eq("id", selectedForecastId)
            .is("transaction_id", null); // não sobrepor vínculo existente
          if (fkErr) {
            console.error("[BP FK link] failed", fkErr);
            toast({
              title: "TX criada, mas não foi possível vincular à linha BP",
              description: "Pode vincular manualmente depois pela edição da linha do BP.",
              variant: "destructive",
            });
          }
        }

        // Audit: log creation
        if (insertedTx?.id) {
          const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
          await supabase.from("transaction_audit_log").insert({
            transaction_id: insertedTx.id,
            changed_by: callerName,
            field_name: "Criação",
            old_value: null,
            new_value: `${data.type === "income" ? "Receita" : "Despesa"} — ${data.description} — ${parseFloat(data.amount).toFixed(2)} €`,
          });
          if (autoApproved && !autoMarkPaid) {
            await supabase.from("transaction_audit_log").insert({
              transaction_id: insertedTx.id,
              changed_by: callerName,
              field_name: "status",
              old_value: "pending",
              new_value: "approved",
              observation: "Aprovação automática — categoria com BP aprovado e dentro do saldo disponível",
            } as any);
          }
        }

        // ===== Parcelamento — N transações irmãs (uma por vencimento) =====
        // A 1ª parcela é a TX já criada acima. Aqui criamos as restantes (2..N)
        // partilhando todos os metadados (categoria, evento, fornecedor, IVA, etc.)
        // para que cada parcela apareça com a sua própria data de vencimento.
        if (useInstallments && insertedTx?.id && installmentRows.length >= 2) {
          const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
          const n = installmentRows.length;
          for (let i = 1; i < n; i++) {
            const inst = installmentRows[i];
            const netAmt = +(Number(inst.amount || 0) / ivaMultiplier).toFixed(2);
            const { data: siblingTx, error: sErr } = await supabase.from("transactions").insert({
              description: `${data.description} (${i + 1}/${n})`,
              type: data.type,
              amount: netAmt,
              iva_rate: data.iva_rate,
              event_id: data.event_id || null,
              category_id: data.category_id || null,
              supplier_id: data.supplier_id || null,
              account_id: accountId,
              specification: data.type === "expense" ? (data.specification || null) : null,
              pl_override_note: data.pl_override_note.trim() || null,
              date: data.date,
              due_date: inst.scheduled_date,
              status: partnerStatus,
              paid_amount: 0,
              payment_date: null,
              is_reimbursement: false,
              is_transitory: principalIsTransitory,
              exclude_from_result: isExcludeFromResult,
              invoice_ref: data.invoice_ref.trim() || null,
              payment_method: data.payment_method || "transfer",
              payment_entity: data.payment_method === "service_payment" ? (data.payment_entity.trim() || null) : null,
              payment_reference: data.payment_method !== "transfer" ? (data.payment_reference.trim() || null) : null,
              currency,
              original_amount: currency === "EUR" ? null : (parseFloat(originalAmount) || null),
              fx_rate: currency === "EUR" ? null : (parseFloat(fxRate) || null),
              fx_rate_source: currency === "EUR" ? null : fxRateSource,
              parent_transaction_id: insertedTx.id,
              split_percentage: null,
              split_amount: null,
            } as any).select("id").single();
            if (sErr) throw sErr;
            if (siblingTx?.id) {
              await supabase.from("transaction_audit_log").insert({
                transaction_id: siblingTx.id,
                changed_by: callerName,
                field_name: "Criação",
                old_value: null,
                new_value: `Parcela ${i + 1}/${n} de "${data.description}" — ${Number(inst.amount).toFixed(2)} € (bruto)`,
              });
            }
          }
        }

        // Link to Master forecast if user chose "master" in reinforcement dialog

        if (reinforcementChoice === "master" && insertedTx?.id && data.event_id && data.category_id) {
          const masterForecast = masterDetection.getMasterForecastForCategory(data.category_id);
          if (masterForecast) {
            await supabase.from("event_forecasts").insert({
              event_id: data.event_id,
              type: "expense",
              description: data.description || "(sem descrição)",
              category_id: data.category_id,
              amount: parseFloat(data.amount),
              iva_rate: data.iva_rate,
              status: "approved",
              transaction_id: insertedTx.id,
              master_forecast_id: masterForecast.id,
            } as any);
          }
        }

        // Auto-link to partner if paid by partner (com data em que o sócio pagou)
        if (isPaidByPartner && paidByPartnerId && insertedTx?.id && data.event_id) {
          await supabase.from("partner_paid_expenses").insert({
            event_id: data.event_id,
            partner_id: paidByPartnerId,
            transaction_id: insertedTx.id,
            paid_date: partnerPaidDate || data.date,
          } as any);
        }

        // Auto-link as Extra do Sócio (despesa paga pela empresa, descontada do sócio no fecho)
        if (isPartnerExtra && partnerExtraId && insertedTx?.id && data.event_id) {
          if (isPartnerExtraPartial) {
            // Split parcial: cria transação irmã transitória com o valor parcial,
            // partilhando o invoice_group_id da fatura. É essa irmã que vai a partner_advance_expenses.
            const { data: siblingTx, error: siblingErr } = await supabase
              .from("transactions")
              .insert({
                description: `${data.description} — extra sócio (parcial)`,
                type: data.type,
                amount: partnerExtraPartialNum,
                iva_rate: data.iva_rate,
                event_id: data.event_id,
                category_id: data.category_id || null,
                supplier_id: data.supplier_id || null,
                account_id: null,
                date: data.date,
                due_date: parseDueDateForDb(data.due_date),
                status: "paid",
                paid_amount: partnerExtraPartialNum,
                payment_date: data.date,
                is_transitory: true,
                exclude_from_result: false,
                invoice_ref: data.invoice_ref.trim() || null,
                invoice_group_id: sharedInvoiceGroupId,
                payment_method: "transfer",
                currency,
              } as any)
              .select("id")
              .single();
            if (siblingErr) throw siblingErr;
            await supabase.from("partner_advance_expenses").insert({
              event_id: data.event_id,
              partner_id: partnerExtraId,
              transaction_id: siblingTx!.id,
              notes: `Parcela do sócio na fatura "${data.description}" (total ${totalAmtNum.toFixed(2)} €)`,
            } as any);
          } else {
            await supabase.from("partner_advance_expenses").insert({
              event_id: data.event_id,
              partner_id: partnerExtraId,
              transaction_id: insertedTx.id,
            } as any);
          }
        }

        // Auto-link to reimbursement note
        if (data.is_reimbursement && insertedTx?.id) {
          let noteId = data.reimbursement_note_id;

          // Create new note if needed
          if (!noteId && showNewReimbursementNote && newReimbursementEmployeeName.trim()) {
            const { data: newNote, error: noteError } = await supabase
              .from("reimbursement_notes")
              .insert({
                employee_name: newReimbursementEmployeeName.trim(),
                created_by: "system",
                code: "",
              } as any)
              .select("id")
              .single();
            if (noteError) throw noteError;
            noteId = newNote.id;
          }

          if (noteId) {
            // Link transaction to the note
            await supabase.from("reimbursement_note_items").insert({
              reimbursement_note_id: noteId,
              transaction_id: insertedTx.id,
            });

            // Update note total
            const txAmount = parseFloat(data.amount);
            const { data: currentNote } = await supabase
              .from("reimbursement_notes")
              .select("total_amount")
              .eq("id", noteId)
              .single();
            await supabase
              .from("reimbursement_notes")
              .update({ total_amount: (Number(currentNote?.total_amount) || 0) + txAmount } as any)
              .eq("id", noteId);
          }
        }
      }
      return createdTxId;
    },
    onSuccess: async (newTxId) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-map-by-supplier"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-check"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes-active"] });
      queryClient.invalidateQueries({ queryKey: ["settlement_eligible_txns"] });
      // Single-tx path: anexa fatura lida pelo OCR (IVA médio ou OCR só com 1 taxa).
      // No path multi-IVA, attachAfterCreateFile fica null e o anexo é gerido pelo loop.
      if (newTxId && attachAfterCreateFile) {
        await attachInvoiceToTransactions(attachAfterCreateFile, [newTxId]);
        setAttachAfterCreateFile(null);
        setPendingInvoiceFile(null);
      }
      if (newTxId) onCreated?.(newTxId);
      onClose();
      toast({
        title: isSplit
          ? "Rateio criado com sucesso!"
          : useInstallments && installmentRows.length >= 2
            ? `${installmentRows.length} parcelas criadas com sucesso!`
            : (autoMarkPaid ? "Despesa registada e liquidada!" : "Transação criada com sucesso!"),
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar transação", description: err.message, variant: "destructive" });
    },
  });

  const getRootFlags = (categoryId: string) => {
    if (!categoryId) return { event_required: false };
    let cat = categories.find((c: any) => c.id === categoryId);
    while (cat && cat.parent_id) {
      cat = categories.find((c: any) => c.id === cat!.parent_id);
    }
    return { event_required: cat?.event_required ?? true };
  };

  const rootFlags = getRootFlags(form.category_id);

  /** Faz upload do ficheiro e cria N rows em transaction_documents — um por id. */
  const attachInvoiceToTransactions = async (file: File, txIds: string[]) => {
    if (!file || txIds.length === 0) return;
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      // Faz upload uma vez (path baseado na 1ª tx) e reutiliza o mesmo path em todos os rows.
      const path = `${txIds[0]}/${Date.now()}-invoice.${ext}`;
      const { error: uploadError, path: filePath } = await uploadToCompanyBucket(
        "transaction-documents",
        path,
        file,
      );
      if (uploadError) throw uploadError;
      const docType = ext === "pdf" ? "pdf" : (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext) ? "imagem" : "outro");
      const rows = txIds.map((tid) => ({
        transaction_id: tid,
        name: file.name,
        file_url: filePath,
        doc_type: docType,
        uploaded_by: user?.email ?? "sistema",
        is_accounting: true,
      }));
      const { error: dbError } = await supabase.from("transaction_documents").insert(rows as any);
      if (dbError) throw dbError;
      toast({ title: "Fatura anexada", description: `Anexada a ${txIds.length} transação(ões).` });
    } catch (err: any) {
      console.error("attachInvoiceToTransactions", err);
      toast({
        title: "Erro a anexar fatura",
        description: err?.message ?? "Podes anexar manualmente depois.",
        variant: "destructive",
      });
    }
  };

  const proceedWithCreate = async () => {
    setShowDuplicateConfirm(false);
    setShowProrationConfirm(false);
    // Validação de parcelamento (Fase 1.5)
    if (useInstallments) {
      if (form.type === "income") {
        toast({ title: "Parcelamento indisponível", description: "Nesta fase, parcelamento só está disponível para despesas.", variant: "destructive" });
        return;
      }
      if (isSplit) {
        toast({ title: "Parcelamento indisponível", description: "Parcelamento não é compatível com rateio entre eventos nesta fase.", variant: "destructive" });
        return;
      }
      if (autoMarkPaid || isPaidByPartner || isPartnerExtra || form.is_reimbursement) {
        toast({ title: "Parcelamento indisponível", description: "Parcelamento não é compatível com este fluxo (auto-liquidada, pago por sócio, extra do sócio ou reembolso).", variant: "destructive" });
        return;
      }
      const { validateInstallments } = await import("@/components/TransactionInstallmentsEditor");
      const grossTotal = +(parseFloat(form.amount || "0") * (1 + Number(form.iva_rate || 0) / 100)).toFixed(2);
      const err = validateInstallments(installmentRows, grossTotal);
      if (err) {
        toast({ title: "Cronograma inválido", description: err, variant: "destructive" });
        return;
      }
    }
    // Multi-IVA split path: create N sibling transactions sharing invoice_ref + invoice_group_id.
    if (pendingIvaSplit && pendingIvaSplit.length >= 2 && !isSplit) {
      const sharedInvoiceRef =
        form.invoice_ref.trim() ||
        `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { newInvoiceGroupId } = await import("@/lib/invoice-group");
      const sharedGroupId = newInvoiceGroupId();
      const createdIds: string[] = [];
      try {
        for (const line of pendingIvaSplit) {
          const desc = line.suffix
            ? `${form.description} (${line.suffix})`
            : form.description;
          const newId = await createMutation.mutateAsync({
            ...form,
            description: desc,
            amount: String(line.base),
            iva_rate: line.iva_rate,
            invoice_ref: sharedInvoiceRef,
            invoice_group_id: sharedGroupId,
          });
          if (newId) createdIds.push(newId);
        }
        // Anexa a fatura a todas as transações criadas, se solicitado.
        if (attachIvaSplitFile && createdIds.length > 0) {
          await attachInvoiceToTransactions(attachIvaSplitFile, createdIds);
        }
        toast({
          title: "Transações criadas",
          description: `${pendingIvaSplit.length} linhas vinculadas pelo Nº fatura ${sharedInvoiceRef}. Eliminar, liquidar ou aprovar uma propaga às outras.`,
        });
        setPendingIvaSplit(null);
        setAttachIvaSplitFile(null);
        setPendingInvoiceFile(null);
        onClose();
      } catch (e) {
        // mutation onError already toasts; nothing else to do
        console.error("multi-iva submit", e);
      }
      return;
    }
    createMutation.mutate(form);
  };

  // Reinforcement dialog handler
  const handleReinforcementConfirm = (choice: "local" | "master") => {
    setReinforcementChoice(choice);
    setShowReinforcementDialog(false);
    // Re-trigger submit flow (choice is now set, dialog won't re-appear)
    setTimeout(() => checkDuplicatesAndSubmit(), 0);
  };

  // Reset reinforcement choice when event/category changes
  const resetReinforcementOnChange = () => {
    if (reinforcementChoice) setReinforcementChoice(null);
  };

  const checkDuplicatesAndSubmit = async () => {
    // Check for existing transactions with same description + event + similar amount
    try {
      let query = supabase
        .from("transactions")
        .select("id, description, amount, status, due_date, supplier_id, event_id, specification, invoice_ref")
        .ilike("description", form.description.trim());

      if (form.event_id) {
        query = query.eq("event_id", form.event_id);
      }

      const { data: matches } = await query.limit(10);

      if (matches && matches.length > 0) {
        const amount = parseFloat(form.amount) || 0;
        const norm = (s: any) => (s ?? "").toString().trim().toLowerCase();
        const newSpec = norm(form.specification);
        const newInv = norm(form.invoice_ref);
        const relevant = matches.filter((m: any) => {
          const diff = Math.abs(Number(m.amount) - amount);
          const amountOrSupplierMatch = diff < 0.01 || form.supplier_id === m.supplier_id;
          if (!amountOrSupplierMatch) return false;
          // Se ambos têm fatura preenchida, têm de coincidir; se só um tem, não é duplicado
          const mInv = norm(m.invoice_ref);
          if (newInv || mInv) {
            if (newInv !== mInv) return false;
          }
          // Idem para especificação (quando ambos preenchidos)
          const mSpec = norm(m.specification);
          if (newSpec && mSpec && newSpec !== mSpec) return false;
          return true;
        });
        if (relevant.length > 0) {
          setDuplicateMatches(relevant);
          setShowDuplicateConfirm(true);
          return;
        }
      }
    } catch {
      // If check fails, proceed anyway
    }

    // Caução / Transitória nunca é rateada — vai sempre direto ao Master sem confirmação
    if (isParentMultiDay && !showProrationConfirm && !isTransitory) {
      setShowProrationConfirm(true);
      return;
    }
    proceedWithCreate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.type === "expense" && !form.supplier_id && form.payment_method === "transfer") {
      toast({ title: "Fornecedor obrigatório", description: "Selecione (ou crie) o fornecedor da despesa.", variant: "destructive" });
      return;
    }
    if (currency !== "EUR") {
      const orig = parseFloat(originalAmount) || 0;
      const rate = parseFloat(fxRate) || 0;
      if (orig <= 0 || rate <= 0) {
        toast({ title: `Define valor em ${currency} e câmbio`, variant: "destructive" });
        return;
      }
    }
    if (form.is_reimbursement && !form.reimbursement_note_id && !showNewReimbursementNote) {
      toast({ title: "Selecione ou crie uma Nota de Reembolso", variant: "destructive" });
      return;
    }
    if (form.is_reimbursement && showNewReimbursementNote && !newReimbursementEmployeeName.trim()) {
      toast({ title: "Indique o nome do funcionário para a nova nota", variant: "destructive" });
      return;
    }
    if (isPaidByPartner && !paidByPartnerId) {
      toast({ title: "Selecione o sócio que pagou a despesa", variant: "destructive" });
      return;
    }
    if (isPaidByPartner && !partnerPaidDate) {
      toast({ title: "Indique a data em que o sócio pagou", variant: "destructive" });
      return;
    }
    if (isPartnerExtra && !partnerExtraId) {
      toast({ title: "Selecione o sócio para o Extra", variant: "destructive" });
      return;
    }
    if (isPartnerExtra && !form.event_id && !(isSplit && splitMasterEventId)) {
      toast({ title: "Extra do Sócio exige um evento associado", variant: "destructive" });
      return;
    }
    // Validação do split parcial: se preenchido, tem de ser > 0 e < total
    if (isPartnerExtra && !isSplit && partnerExtraPartialAmount.trim() !== "") {
      const totalAmt = parseFloat(form.amount) || 0;
      const partialAmt = parseFloat(partnerExtraPartialAmount) || 0;
      if (partialAmt <= 0 || partialAmt >= totalAmt) {
        toast({ title: "Valor parcial do extra inválido", description: `Tem de ser maior que 0 e menor que o total (${totalAmt.toFixed(2)} €). Deixe vazio para abater a fatura inteira.`, variant: "destructive" });
        return;
      }
    }

    // Split validation — bypassed para Caução/Transitória, que sempre vai
    // como lançamento único no Master, ignorando o rateio.
    if (isSplit && !isTransitory) {
      if (splitCategoryBlockReason) {
        toast({ title: "Categoria bloqueada para rateio", description: splitCategoryBlockReason, variant: "destructive" });
        return;
      }
      if (splitEntries.length < 2) {
        toast({ title: "Selecione pelo menos 2 eventos para rateio", variant: "destructive" });
        return;
      }
      const totalPct = splitEntries.reduce((s, e) => s + e.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        toast({ title: "A soma das percentagens deve ser 100%", variant: "destructive" });
        return;
      }
      if (splitNeedsBypass && !plOverride) {
        toast({ title: "Rateio inclui eventos com BP que requerem justificação. Ative 'Fora do BP'.", variant: "destructive" });
        return;
      }
      if (plOverride && !form.pl_override_note.trim()) {
        toast({ title: "Justificação obrigatória para categorias fora do BP", variant: "destructive" });
        return;
      }
    } else if (!isSplit) {
      if (rootFlags.event_required && !form.event_id && !splitMasterEventId) {
        toast({ title: "Selecione o evento (obrigatório para esta categoria)", variant: "destructive" });
        return;
      }

      // Reinforcement dialog: show FIRST for sub-event expenses with category in Master BP.
      // Must precede the BP-Active block, since "Reforço Local" legitimately bypasses the
      // requirement that the category exists in the sub-event's own BP.
      if (!reinforcementChoice && masterDetection.shouldShowReinforcementDialog(form.category_id, form.type)) {
        setShowReinforcementDialog(true);
        return;
      }

      // BP-Active enforcement — skipped when user explicitly chose either reinforcement option:
      // • "local"  → expense is local-only, category lives in Master BP only (legitimate bypass)
      // • "master" → expense consumes Master BP rateio (sub-event BP not required)
      const reinforcementBypass = reinforcementChoice === "local" || reinforcementChoice === "master";
      if (hasPLRestriction && effectiveEventId && allowedCategoryIds.length > 0 && !plOverride && !reinforcementBypass) {
        if (!form.category_id) {
          toast({ title: "Evento com BP: selecione uma categoria existente no BP", variant: "destructive" });
          return;
        }
        if (!allowedCategoryIds.includes(form.category_id)) {
          toast({ title: "Esta categoria não existe no BP do evento", variant: "destructive" });
          return;
        }
      }
    }
    if (plOverride && !form.pl_override_note.trim()) {
      toast({ title: "Justificação obrigatória para categorias fora do BP", variant: "destructive" });
      return;
    }
    // Warning (non-blocking) when amount exceeds BP forecast
    if (hasPL && effectiveEventId && form.category_id) {
      const budgetKey = `${form.type}_${form.category_id}`;
      const forecast = forecastBudgetByCategory[budgetKey] || 0;
      const used = usedBudgetByCategory[budgetKey] || 0;
      const newAmount = parseFloat(form.amount) || 0;
      const remaining = forecast - used;
      if (forecast > 0 && newAmount > remaining) {
        toast({
          title: "⚠️ Valor ultrapassa o previsto no BP",
          description: `Previsto: ${forecast.toFixed(2)}€ | Utilizado: ${used.toFixed(2)}€ | Disponível: ${remaining.toFixed(2)}€ | Lançando: ${newAmount.toFixed(2)}€`,
        });
      }
    }

    // Skip duplicate check if already confirmed
    if (showDuplicateConfirm) {
      if (isParentMultiDay && !showProrationConfirm && !isTransitory) {
        setShowProrationConfirm(true);
        return;
      }
      proceedWithCreate();
      return;
    }

    checkDuplicatesAndSubmit();
  };

  const filteredCategories = categories.filter((c) => {
    const typeMatch = form.type === "income" ? c.type === "income" : c.type === "expense";
    if (!typeMatch) return false;
    // Only leaf categories (no children)
    const isLeaf = !categories.some((ch) => ch.parent_id === c.id);
    if (!isLeaf) return false;
    // Regra L2: se vinculado a linha BP, restringe a L3 do mesmo L2.
    if (selectedForecastL2Id) {
      const parent = categories.find((p) => p.id === c.parent_id);
      const l2Id = parent && parent.parent_id ? parent.id : c.id;
      if (l2Id !== selectedForecastL2Id) return false;
    }
    if (hasPLRestriction && effectiveEventId && !plOverride) {
      // Allow sub-event's BP categories OR Master BP categories (for "Reforço Local" flow)
      const isInSubEventBP = allowedCategoryIds.includes(c.id);
      const isInMasterBP = masterDetection.masterCategoryIds.includes(c.id);
      if (isParentMultiDay) {
        return isInSubEventBP || isInMasterBP;
      }
      if (allowedCategoryIds.length > 0) {
        return isInSubEventBP || isInMasterBP;
      }
    }
    return true;
  });

  // Build hierarchical category options: L1/L2 as headers, L3 as selectable
  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string; description?: string; isHeader?: boolean; indentLevel?: number; searchText?: string }[] = [];

    // Build parent maps
    const catById = new Map(categories.map(c => [c.id, c]));
    
    // Group filtered (leaf) categories by their ancestry
    const leafSet = new Set(filteredCategories.map(c => c.id));
    
    // Collect all ancestor chains for visible leaves
    type TreeNode = { cat: any; children: TreeNode[] };
    const rootNodes: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    // Find all ancestors needed
    const neededIds = new Set<string>();
    filteredCategories.forEach(c => {
      neededIds.add(c.id);
      let cur = c;
      while (cur.parent_id && catById.has(cur.parent_id)) {
        neededIds.add(cur.parent_id);
        cur = catById.get(cur.parent_id)!;
      }
    });

    // Build tree from needed categories
    const neededCats = Array.from(neededIds).map(id => catById.get(id)!).filter(Boolean);
    neededCats.forEach(c => nodeMap.set(c.id, { cat: c, children: [] }));
    neededCats.forEach(c => {
      const node = nodeMap.get(c.id)!;
      if (c.parent_id && nodeMap.has(c.parent_id)) {
        nodeMap.get(c.parent_id)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // Sort by code
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => compareHierarchicalCodes(a.cat.code, b.cat.code));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(rootNodes);

    // Flatten tree into options
    const flatten = (nodes: TreeNode[], level: number) => {
      nodes.forEach(node => {
        const isLeaf = leafSet.has(node.cat.id);
        if (isLeaf) {
          // BP description enrichment
          let description: string | undefined;
          if (hasPL && effectiveEventId && !plOverride) {
            const bpLines = relevantForecasts.filter(f => f.category_id === node.cat.id && f.type === form.type);
            if (bpLines.length > 0) {
              description = bpLines.map(l => l.description).join(", ");
            }
          }
          opts.push({ value: node.cat.id, label: `${node.cat.code} ${node.cat.name}`, description, indentLevel: level, searchText: description });
        } else {
          // Header (L1 or L2)
          opts.push({ value: `header-${node.cat.id}`, label: `${node.cat.code} ${node.cat.name}`, isHeader: true, indentLevel: level });
        }
        if (node.children.length > 0) {
          flatten(node.children, level + 1);
        }
      });
    };
    flatten(rootNodes, 0);

    return opts;
  }, [filteredCategories, categories, hasPL, form.event_id, form.type, plOverride, relevantForecasts]);
  const supplierOptions = suppliers.map((s: any) => ({ value: s.id, label: s.trade_name ? `${s.name} (${s.trade_name})` : s.name, searchText: s.trade_name ?? undefined }));
  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
        <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{titleOverride ?? "Nova Transação"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setForm({ ...form, type: t, category_id: "", supplier_id: "", pl_override_note: "" }); setPlOverride(false); }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  form.type === t
                    ? t === "income" ? "bg-success/20 text-success ring-1 ring-success/40" : "bg-warning/20 text-warning ring-1 ring-warning/40"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {t === "income" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          {/* Split toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSplit(!isSplit);
                if (!isSplit) {
                  setForm({ ...form, event_id: "" });
                   setSplitAutoConfigured(false);
                   setSplitMasterEventId("");
                  setSplitExpanded(true);
                } else {
                  setSplitEntries([]);
                   setSplitAutoConfigured(false);
                   setSplitMasterEventId("");
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isSplit
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-dashed border-muted-foreground/30"
              }`}
            >
              <Split className="h-3.5 w-3.5" />
              {isSplit ? "Rateio Ativo" : "💡 Dividir por vários eventos"}
            </button>
            <HelpTooltip text={helpTexts.splitTransaction} size={14} />
          </div>

          {/* Event selector (single) — hidden when split */}
          {!isSplit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Evento {rootFlags.event_required ? "*" : ""}
                {isActivePL && <span className="ml-1 text-success">(BP Ativo)</span>}
                {hasPL && !isActivePL && <span className="ml-1 text-blue-500">(BP Passivo)</span>}
              </label>
              <SearchableSelect
                options={eventOptions}
                value={form.event_id}
                onValueChange={(v) => {
                  setForm({ ...form, event_id: v, category_id: "", pl_override_note: "" });
                  setPlExpanded(true);
                  setShowProrationConfirm(false);
                  setPlOverride(false);
                  // Auto-enable split when selecting a parent (multi_day) event with children
                  const ev = events.find((e: any) => e.id === v);
                  const children = subEventsByParent[v] || [];
                  if (ev?.event_type === "multi_day" && children.length > 0) {
                    setIsSplit(true);
                    setSplitAutoConfigured(true);
                    setSplitMasterEventId(v);
                    setSplitExpanded(false);
                    setForm(prev => ({ ...prev, event_id: "" }));
                    const pct = +(100 / children.length).toFixed(2);
                    const entries: SplitEntry[] = children.map((child: any, idx: number) => {
                      const parentName = ev.name;
                      const name = `${parentName} — ${child.name}`;
                      const percentage = idx === children.length - 1
                        ? +(100 - pct * (children.length - 1)).toFixed(2)
                        : pct;
                      return { event_id: child.id, event_name: name, percentage };
                    });
                    setSplitEntries(entries);
                    setSplitMethod("equal");
                  }
                }}
                placeholder={rootFlags.event_required ? "Selecionar…" : "Sem evento"}
                searchPlaceholder="Pesquisar evento…"
              />
            </div>
          )}

          {/* Split config panel — shown when split is active */}
          {isSplit && (
            <>
              {/* Aviso: caução/transitória nunca rateia — vai para o Master */}
              {isTransitory && splitMasterEventId && (
                <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3 text-xs text-cyan-700 dark:text-cyan-300 leading-relaxed">
                  🛡️ <strong>Caução / Transitória sem rateio:</strong> esta despesa será gravada como
                  lançamento único no evento Master ({events.find((e: any) => e.id === splitMasterEventId)?.name ?? "—"}),
                  sem dividir entre as cidades. Cauções não compõem o resultado de cada sub-evento e por isso
                  não fazem rateio — entram apenas no fecho final.
                </div>
              )}
              {/* When auto-configured from tour, show collapsed summary */}
              {splitAutoConfigured && !splitExpanded ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                      <Split className="h-3.5 w-3.5" />
                      Rateio Multi-Evento ({splitEntries.length} cidades)
                      <HelpTooltip text={helpTexts.splitTransaction} size={13} />
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {splitEntries.map((entry) => {
                      const shortName = entry.event_name.includes("—") ? entry.event_name.split("—").pop()?.trim() : entry.event_name;
                      return (
                        <span key={entry.event_id} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {shortName} <span className="font-semibold text-foreground">{entry.percentage.toFixed(1)}%</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <TransactionSplitConfig
                  events={events}
                  splitEntries={splitEntries}
                  onChange={setSplitEntries}
                  splitMethod={splitMethod}
                  onMethodChange={setSplitMethod}
                  totalAmount={parseFloat(form.amount) || 0}
                  bpInfoByEvent={splitBPInfoByEvent}
                  inputMode={splitInputMode}
                  onInputModeChange={setSplitInputMode}
                />
              )}
              {splitCategoryBlockReason && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Categoria bloqueada para rateio
                  </div>
                  <p className="text-xs text-destructive/90 leading-relaxed">{splitCategoryBlockReason}</p>
                </div>
              )}
              {splitCategoryWarning && !splitCategoryBlockReason && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Aviso
                  </div>
                  <p className="text-xs text-warning/90 leading-relaxed">{splitCategoryWarning}</p>
                </div>
              )}
              {/* BP Override toggle for split mode */}
              {splitNeedsBypass && !splitCategoryBlockReason && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setPlOverride(!plOverride); setForm({ ...form, pl_override_note: "" }); }}
                    className={`text-xs font-medium transition-colors ${plOverride ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {plOverride ? "⚠️ Fora do BP — Clique para reverter" : "⚠️ Rateio excede BP em alguns eventos. Clique para justificar"}
                  </button>
                </div>
              )}
              {plOverride && splitNeedsBypass && !splitCategoryBlockReason && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-warning">Justificação *</label>
                  <input
                    value={form.pl_override_note}
                    onChange={(e) => setForm({ ...form, pl_override_note: e.target.value })}
                    className="w-full rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50"
                    placeholder="Ex: Despesa partilhada não prevista no orçamento individual"
                  />
                </div>
              )}
            </>
          )}

          {/* BP forecast lines — auto-expand when event selected */}
          {hasPL && effectiveEventId && plExpanded && (() => {
            const typeForecasts = relevantForecasts.filter(f => f.type === form.type);

            // Calculate cachê lines for expense view
            const cacheLines = form.type === "expense" && cacheConfigs.length > 0
              ? calculateCacheLinesForPL(
                  cacheConfigs,
                  cacheDeductions,
                  ticketRevenueNet,
                  relevantForecasts.map(f => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
                  ticketRevenueGross
                )
              : [];
            const totalCache = cacheLines.reduce((s, c) => s + c.amount, 0);

            if (typeForecasts.length === 0 && cacheLines.length === 0) return null;

            // Build hierarchy using category lookup
            const catLookup = buildCategoryLookup(categories);

            // Aggregate forecasts and transactions by L2 group → L3 detail
            interface PLDetail {
              catId: string;
              catName: string;
              catCode: string;
              forecast: number;
              used: number;
              lines: typeof typeForecasts;
            }
            interface PLGroup {
              groupName: string;
              groupCode: string;
              totalForecast: number;
              totalUsed: number;
              details: PLDetail[];
            }

            const groupMap: Record<string, PLGroup> = {};
            typeForecasts.forEach(f => {
              const catId = f.category_id || "none";
              const info = catLookup[catId];
              const groupName = info?.groupName ?? "Sem categoria";
              const groupCode = info?.groupCode ?? "Z";
              const detailName = info?.name ?? "Sem categoria";
              const detailCode = info?.code ?? "Z.Z";

              if (!groupMap[groupCode]) {
                groupMap[groupCode] = { groupName, groupCode, totalForecast: 0, totalUsed: 0, details: [] };
              }
              const grp = groupMap[groupCode];
              let detail = grp.details.find(d => d.catId === catId);
              if (!detail) {
                detail = { catId, catName: detailName, catCode: detailCode, forecast: 0, used: 0, lines: [] };
                grp.details.push(detail);
              }
              detail.forecast += Number(f.amount);
              detail.lines.push(f);
              grp.totalForecast += Number(f.amount);
            });

            eventTransactions.filter(t => t.type === form.type).forEach(t => {
              const catId = t.category_id || "none";
              const info = catLookup[catId];
              const groupCode = info?.groupCode ?? "Z";
              const grp = groupMap[groupCode];
              if (grp) {
                const detail = grp.details.find(d => d.catId === catId);
                if (detail) {
                  detail.used += Number(t.amount);
                  grp.totalUsed += Number(t.amount);
                }
              }
            });

            // Inject cachê lines into Artístico group (2.1)
            if (totalCache > 0) {
              if (!groupMap["2.1"]) {
                groupMap["2.1"] = { groupName: "Artístico", groupCode: "2.1", totalForecast: 0, totalUsed: 0, details: [] };
              }
              const artGroup = groupMap["2.1"];
              // Find real category for Cachês (code 2.1.01)
              const cacheCat = categories.find(c => c.code === "2.1.01");
              const cacheCatId = cacheCat?.id ?? "cache-auto";
              let cacheDetail = artGroup.details.find(d => d.catCode === "2.1.01");
              if (!cacheDetail) {
                const artistNames = cacheLines.map(c => `Cachê ${c.artistName}`).join(", ");
                cacheDetail = {
                  catId: cacheCatId,
                  catName: cacheCat?.name ?? "Cachês (auto)",
                  catCode: "2.1.01",
                  forecast: 0,
                  used: 0,
                  lines: [{
                    id: "cache-auto",
                    event_id: form.event_id,
                    type: "expense" as const,
                    category_id: cacheCatId,
                    amount: totalCache,
                    status: "draft",
                    description: artistNames || "Cachê",
                    iva_rate: 0,
                    specification: cacheLines.map(c => `${c.artistName}: ${c.amount.toFixed(2)}€ (${c.cacheType === "fixed" ? "fixo" : "variável"})`).join("; "),
                  }],
                };
                artGroup.details.push(cacheDetail);
              }
              cacheDetail.forecast += totalCache;
              artGroup.totalForecast += totalCache;
            }

            const groups = Object.values(groupMap)
              .map(g => ({ ...g, details: sortByHierarchicalCode(g.details, (detail) => detail.catCode) }))
              .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));

            const isUuid = (v: any) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

            const handleLineClick = (line: any, detail: PLDetail) => {
              if (detail.catId === "none") return;
              const switched = tryAutoSplitFromSubEvent(detail.catId, form.type, line);
              if (switched) return; // disambiguation dialog will handle it
              setForm(prev => ({
                ...prev,
                category_id: detail.catId,
                description: line.description || "",
                amount: String(Number(line.amount) || ""),
                iva_rate: (line.iva_rate ?? 23) as IvaRate,
                specification: line.specification || "",
              }));
              // Vincula à linha BP (FK escrita no INSERT). Ignora pseudo-ids (ex: "cache-auto").
              if (isUuid(line.id)) setSelectedForecastId(line.id);
              setPlExpanded(false);
            };

            const handleDetailClick = (detail: PLDetail) => {
              if (detail.catId === "none") return;
              if (detail.lines.length === 1) {
                handleLineClick(detail.lines[0], detail);
                return;
              }
              const switched = tryAutoSplitFromSubEvent(detail.catId, form.type);
              if (switched) return; // disambiguation dialog will handle it
              setForm(prev => ({
                ...prev,
                category_id: detail.catId,
              }));
              // Múltiplas linhas: não vinculamos automaticamente; user precisa clicar uma linha específica.
              setSelectedForecastId(null);
              setPlExpanded(false);
            };

            return (
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
                <button type="button" onClick={() => setPlExpanded(false)} className="w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  BP{hasPLRestriction ? " 🔒" : ""} — {form.type === "income" ? "Receitas" : "Despesas"} previstas ▲
                </button>
                <p className="text-[10px] text-muted-foreground">Clique numa linha de previsão para preencher automaticamente os dados da transação</p>
                <div
                  className="max-h-64 overflow-y-auto overscroll-contain border border-border/30 rounded"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  onWheel={(e) => {
                    const el = e.currentTarget;
                    const atTop = el.scrollTop === 0 && e.deltaY < 0;
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0;
                    if (!atTop && !atBottom) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/30">
                        <th className="text-left pb-1 font-medium">Conta / Previsão</th>
                        <th className="text-right pb-1 font-medium">Previsto</th>
                        <th className="text-right pb-1 font-medium">Utilizado</th>
                        <th className="text-right pb-1 font-medium">Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(group => {
                        const groupRemaining = group.totalForecast - group.totalUsed;
                        return (
                          <React.Fragment key={group.groupCode}>
                            {/* L2 Group header */}
                            <tr className="bg-muted/30 border-t border-border/20">
                              <td className="py-1.5 pr-2 font-semibold text-foreground">
                                <span className="text-muted-foreground mr-1">{group.groupCode}</span>
                                {group.groupName}
                              </td>
                              <td className="py-1.5 text-right font-mono font-semibold">{group.totalForecast.toFixed(2)}€</td>
                              <td className="py-1.5 text-right font-mono font-semibold">{group.totalUsed.toFixed(2)}€</td>
                              <td className={`py-1.5 text-right font-mono font-bold ${groupRemaining <= 0 ? "text-destructive" : "text-success"}`}>
                                {groupRemaining.toFixed(2)}€
                              </td>
                            </tr>
                            {/* L3 Detail lines with individual forecasts */}
                            {group.details.map(detail => {
                              const remaining = detail.forecast - detail.used;
                              const isSelected = form.category_id === detail.catId;
                              const hasMultipleLines = detail.lines.length > 1;
                              return (
                                <React.Fragment key={detail.catId}>
                                  <tr
                                    onClick={() => handleDetailClick(detail)}
                                    className={`cursor-pointer transition-colors ${
                                      isSelected
                                        ? "bg-primary/10 font-medium"
                                        : "hover:bg-muted/40"
                                    }`}
                                  >
                                    <td className="py-1.5 pr-2 pl-4">
                                      <span className="text-muted-foreground mr-1">{detail.catCode}</span>
                                      {detail.catName}
                                      {hasMultipleLines && (
                                        <span className="ml-1 text-[9px] text-muted-foreground">({detail.lines.length} linhas)</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right font-mono">{detail.forecast.toFixed(2)}€</td>
                                    <td className="py-1.5 text-right font-mono">{detail.used.toFixed(2)}€</td>
                                    <td className={`py-1.5 text-right font-mono font-semibold ${
                                      remaining <= 0 ? "text-destructive" : "text-success"
                                    }`}>
                                      {remaining.toFixed(2)}€
                                    </td>
                                  </tr>
                                  {/* Individual forecast lines */}
                                  {detail.lines.map((line: any) => (
                                    <tr
                                      key={line.id}
                                      onClick={() => handleLineClick(line, detail)}
                                      className={`cursor-pointer transition-colors border-l-2 ${
                                        form.category_id === detail.catId && form.description === line.description
                                          ? "border-l-primary bg-primary/5 font-medium"
                                          : "border-l-transparent hover:bg-muted/20 hover:border-l-primary/30"
                                      }`}
                                    >
                                      <td className="py-1 pr-2 pl-8 text-[10px]">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${line.status === "approved" ? "bg-success" : "bg-warning"}`} />
                                          <span className="truncate">{line.description}</span>
                                          {line.specification && (
                                            <span className="text-muted-foreground truncate">· {line.specification}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-1 text-right font-mono text-[10px]">{Number(line.amount).toFixed(2)}€</td>
                                      <td className="py-1 text-right font-mono text-[10px] text-muted-foreground">
                                        {line.iva_rate}%
                                      </td>
                                      <td className="py-1 text-right font-mono text-[10px]">
                                        {(Number(line.amount) * (1 + Number(line.iva_rate) / 100)).toFixed(2)}€
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {hasPL && effectiveEventId && !plExpanded && (
            <button type="button" onClick={() => setPlExpanded(true)} className="w-full rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
              BP — {form.type === "income" ? "Receitas" : "Despesas"} previstas ▼
            </button>
          )}

          {/* BP Override toggle — only when restriction is active */}
          {hasPLRestriction && effectiveEventId && allowedCategoryIds.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPlOverride(!plOverride); setForm({ ...form, category_id: "", pl_override_note: "" }); }}
                className={`text-xs font-medium transition-colors ${plOverride ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
              >
                {plOverride ? "⚠️ Categoria fora do BP — Clique para reverter" : "Categoria não prevista? Clique aqui"}
              </button>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Categoria {hasPLRestriction && !plOverride ? "*" : ""}
              {plOverride && <span className="ml-1 text-warning font-semibold">⚠️ Fora do BP</span>}
            </label>
            <SearchableSelect
              options={categoryOptions}
              value={form.category_id}
              onValueChange={(v) => {
                const switched = tryAutoSplitFromSubEvent(v, form.type);
                if (!switched) {
                  setForm({ ...form, category_id: v });
                }
                // If switched, disambiguation dialog handles everything
              }}
              placeholder={hasPLRestriction && !plOverride ? "Selecionar do BP…" : "Selecionar categoria…"}
              searchPlaceholder="Pesquisar categoria…"
            />
            {selectedForecastL2Label && (
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground">
                  🔒 Categoria limitada pelo BP: <span className="font-mono text-primary/80">{selectedForecastL2Label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedForecastId(null);
                    setPlExpanded(true);
                  }}
                  className="text-primary hover:underline font-medium shrink-0"
                >
                  Trocar linha BP
                </button>
              </div>
            )}
          </div>

          {/* Justification field when BP override is active */}
          {plOverride && (
            <div>
              <label className="mb-1 block text-xs font-medium text-warning">Justificação *</label>
              <input
                value={form.pl_override_note}
                onChange={(e) => setForm({ ...form, pl_override_note: e.target.value })}
                className="w-full rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50"
                placeholder="Ex: Despesa urgente não prevista no orçamento inicial"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Venda de bilhetes" />
          </div>

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Especificação</label>
              <input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: Detalhes adicionais da despesa" />
            </div>
          )}

          <div className="space-y-2">
            {currency === "EUR" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Base *</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="EUR">EUR</option>
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            ) : (
              <CurrencyAmountInput
                currency={currency}
                onCurrencyChange={setCurrency}
                originalAmount={originalAmount}
                onOriginalAmountChange={setOriginalAmount}
                fxRate={fxRate}
                onFxRateChange={setFxRate}
                onFxRateSourceChange={setFxRateSource}
                onEurAmountChange={setEurFromCurrency}
                label="Valor Base"
              />
            )}
            <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-muted-foreground">Taxa IVA</label>
                  {form.type === "expense" && !isSplit && (
                    <div className="flex items-center gap-1">
                      <label
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80",
                          extractingInvoice && "pointer-events-none opacity-60",
                        )}
                        title="Anexar PDF/imagem da fatura — IA preenche valor + IVA. Se a fatura tiver várias taxas, abre Dividir por IVA já pré-preenchido."
                      >
                        {extractingInvoice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {extractingInvoice ? "A ler…" : "Ler fatura (IA)"}
                        <input
                          type="file"
                          accept="image/*,application/pdf,.dng,.tif,.tiff,image/x-adobe-dng"
                          className="hidden"
                          disabled={extractingInvoice}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleExtractInvoice(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {pendingInvoiceFile && !extractingInvoice && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingInvoiceFile(null);
                            setAiPrefilledLines(null);
                            setPendingIvaSplit(null);
                            setAttachIvaSplitFile(null);
                            setAttachAfterCreateFile(null);
                            toast({
                              title: "Leitura limpa",
                              description: "Podes anexar uma nova fatura.",
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={`Limpar fatura lida (${pendingInvoiceFile.name}) e ler outra`}
                        >
                          <X className="h-3 w-3" />
                          Limpar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAiPrefilledLines(null);
                          setShowSplitByIvaModal(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80"
                        title="Fatura com várias taxas de IVA — cria várias transações ligadas pelo mesmo Nº fatura"
                      >
                        <Receipt className="h-3 w-3" />
                        Dividir por IVA{pendingIvaSplit ? ` (${pendingIvaSplit.length})` : ""}
                      </button>
                    </div>
                  )}
                </div>
              <IvaRateSelect
                eventId={effectiveEventId || null}
                value={form.iva_rate}
                onChange={(r) => setForm({ ...form, iva_rate: r as IvaRate })}
                disabled={!!pendingIvaSplit}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
              />

              {pendingIvaSplit && (
                <div className="mt-1 flex items-center justify-between rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary">
                  <span>
                    ✓ Vão ser criadas {pendingIvaSplit.length} transações: {pendingIvaSplit.map((l) => `${l.base.toFixed(2)}€@${l.iva_rate}%`).join(" · ")}
                  </span>
                  <button type="button" onClick={() => setPendingIvaSplit(null)} className="text-[10px] font-medium underline">
                    cancelar
                  </button>
                </div>
              )}
            </div>
            {/* IVA breakdown */}
            {(() => {
              const baseForm = parseFloat(form.amount) || 0;
              // Quando há split de IVA pendente, mostrar agregados reais das linhas (não aplicar form.iva_rate sobre toda a base)
              if (pendingIvaSplit && pendingIvaSplit.length > 0) {
                const baseSum = pendingIvaSplit.reduce((s, l) => s + (Number(l.base) || 0), 0);
                const ivaSum = pendingIvaSplit.reduce((s, l) => s + (Number(l.base) || 0) * ((Number(l.iva_rate) || 0) / 100), 0);
                const totalSum = baseSum + ivaSum;
                if (baseSum <= 0) return null;
                return (
                  <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">
                      Σ Bases (EUR): {baseSum.toFixed(2)}€
                      {currency !== "EUR" && (
                        <CurrencyBadge currency={currency} originalAmount={parseFloat(originalAmount) || 0} fxRate={parseFloat(fxRate) || 0} className="ml-2" />
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      + Σ IVA ({pendingIvaSplit.length} taxas): {ivaSum.toFixed(2)}€
                    </span>
                    <span className="font-semibold text-foreground">
                      Total: {totalSum.toFixed(2)}€
                    </span>
                  </div>
                );
              }
              const ivaValue = baseForm * (form.iva_rate / 100);
              const total = baseForm + ivaValue;
              if (baseForm <= 0) return null;
              return (
                <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">
                    Base (EUR): {baseForm.toFixed(2)}€
                    {currency !== "EUR" && (
                      <CurrencyBadge currency={currency} originalAmount={parseFloat(originalAmount) || 0} fxRate={parseFloat(fxRate) || 0} className="ml-2" />
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    + IVA ({form.iva_rate}%): {ivaValue.toFixed(2)}€
                  </span>
                  <span className="font-semibold text-foreground">
                    Total: {total.toFixed(2)}€
                  </span>
                </div>
              );
            })()}
          </div>

          {form.type === "expense" && (() => {
            const base = parseFloat(form.amount) || 0;
            const ivaRate = parseFloat(String(form.iva_rate)) || 0;
            const totalCIva = +(base + base * ivaRate / 100).toFixed(2);
            return (
              <WithholdingDeclaredFields
                baseAmount={totalCIva}
                rate={form.declared_withholding_rate}
                amount={form.declared_withholding_amount}
                onRateChange={(v) => setForm((f) => ({ ...f, declared_withholding_rate: v }))}
                onAmountChange={(v) => setForm((f) => ({ ...f, declared_withholding_amount: v }))}
              />
            );
          })()}

          {/* Duplicate detection warning */}
          {showDuplicateConfirm && duplicateMatches.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">⚠️ Possível duplicação detectada</p>
                  <p className="text-xs text-muted-foreground">
                    Já existe(m) {duplicateMatches.length} transação(ões) com descrição e valores semelhantes:
                  </p>
                  <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                    {duplicateMatches.map((m: any) => {
                      const evName = events.find((e: any) => e.id === m.event_id)?.name;
                      const suppName = suppliers.find((s: any) => s.id === m.supplier_id)?.name;
                      return (
                        <div key={m.id} className="text-xs bg-background/60 rounded px-2 py-1.5 border border-border">
                          <span className="font-medium">{m.description}</span>
                          <span className="text-muted-foreground"> — {Number(m.amount).toFixed(2)}€</span>
                          {evName && <span className="text-muted-foreground"> · {evName}</span>}
                          {suppName && <span className="text-muted-foreground"> · {suppName}</span>}
                          <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            m.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                          }`}>
                            {m.status === "paid" ? "Pago" : m.status === "approved" ? "Aprovado" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isParentMultiDay && !isTransitory) {
                      setShowDuplicateConfirm(false);
                      setShowProrationConfirm(true);
                    } else {
                      proceedWithCreate();
                    }
                  }}
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-lg bg-destructive/20 py-2 text-xs font-medium text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? "A guardar…" : "Criar Mesmo Assim"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDuplicateConfirm(false); setDuplicateMatches([]); }}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Proration confirmation for multi_day parent */}
          {showProrationConfirm && isParentMultiDay && !isTransitory && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-warning">Lançamento master (rateio)</p>
                  <p className="text-xs text-muted-foreground">
                    Este valor será rateado igualmente por {(subEventsByParent[effectiveEventId] || subEventsByParent[form.event_id] || []).length} datas nos relatórios DRE e BP.
                    Se pretende lançar para uma cidade específica, selecione a data correspondente.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 rounded-lg bg-warning/20 py-2 text-xs font-medium text-warning hover:bg-warning/30 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? "A guardar…" : "Confirmar Rateio"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProrationConfirm(false)}
                  className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  Voltar e Escolher Data
                </button>
              </div>
            </div>
          )}

          {/* Budget indicator for BP */}
          {hasPL && form.category_id && effectiveEventId && (() => {
            const budgetKey = `${form.type}_${form.category_id}`;
            const forecast = forecastBudgetByCategory[budgetKey] || 0;
            const used = usedBudgetByCategory[budgetKey] || 0;
            const remaining = forecast - used;
            const pct = forecast > 0 ? (used / forecast) * 100 : 0;
            const newAmount = parseFloat(form.amount) || 0;
            const exceedsForcast = forecast > 0 && newAmount > remaining;
            return (
              <div className={`rounded-lg border p-3 space-y-1.5 ${exceedsForcast ? "border-warning bg-warning/10" : "border-border/50 bg-secondary/30"}`}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Orçamento BP</span>
                  <span className="font-mono font-medium">{pct.toFixed(0)}% utilizado</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Previsto: {forecast.toFixed(2)}€</span>
                  <span>Utilizado: {used.toFixed(2)}€</span>
                  <span className={remaining < 0 ? "text-destructive" : "text-success"}>Disponível: {remaining.toFixed(2)}€</span>
                </div>
                {exceedsForcast && (
                  <p className="flex items-center gap-1.5 text-xs text-warning font-medium pt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Valor ultrapassa o disponível em {(newAmount - remaining).toFixed(2)}€
                  </p>
                )}
              </div>
            );
          })()}

          {form.type === "income" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Destino *</label>
              <SearchableSelect
                options={accountOptions}
                value={form.account_id}
                onValueChange={(v) => setForm({ ...form, account_id: v })}
                placeholder="Selecionar conta…"
                searchPlaceholder="Pesquisar conta…"
              />
            </div>
          )}

          {form.type === "expense" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor *</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    options={supplierOptions}
                    value={form.supplier_id}
                    onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                    placeholder="Selecionar fornecedor…"
                    searchPlaceholder="Pesquisar fornecedor…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors"
                  title="Cadastrar novo fornecedor"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <SupplierFormModal
                open={showNewSupplier}
                onOpenChange={setShowNewSupplier}
                onCreated={(id) => setForm((prev) => ({ ...prev, supplier_id: id }))}
                overlayClassName="z-[110]"
                contentClassName="z-[111]"
              />
              {selectedSupplier && (
                <div className="mt-2">
                  <SupplierBankDetails supplier={selectedSupplier} defaultExpanded />
                </div>
              )}
            </div>
          )}

          {/* Reimbursement toggle — only for expenses */}
          {form.type === "expense" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const next = !form.is_reimbursement;
                    setForm({ ...form, is_reimbursement: next, reimbursement_to: "", reimbursement_note_id: "", account_id: next ? "" : form.account_id });
                    if (next) {
                      setIsPaidByPartner(false); setPaidByPartnerId("");
                      setIsPartnerExtra(false); setPartnerExtraId(""); setPartnerExtraPartialAmount("");
                      setShowNewReimbursementNote(false); setNewReimbursementEmployeeName("");
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    form.is_reimbursement
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  💰 {form.is_reimbursement ? "Reembolso Ativo" : "Marcar como Reembolso"}
                  <HelpTooltip text={helpTexts.reimbursementToggle} size={12} />
                </button>

                {/* Paid by partner toggle — when event (or split Master) has partners */}
                {(form.event_id || (isSplit && splitMasterEventId)) && eventPartners.length > 0 && !form.is_reimbursement && !isPartnerExtra && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isPaidByPartner;
                      setIsPaidByPartner(next);
                      setPaidByPartnerId("");
                      if (next) {
                        setForm({ ...form, account_id: "" });
                        setPartnerPaidDate(form.date || new Date().toISOString().split("T")[0]);
                      } else {
                        setPartnerPaidDate("");
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isPaidByPartner
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🤝 Pago por Sócio
                    <HelpTooltip text={helpTexts.paidByPartnerToggle} size={12} />
                  </button>
                )}

                {/* Extra do Sócio toggle — despesa paga pela empresa que será descontada do sócio no fecho */}
                {(form.event_id || (isSplit && splitMasterEventId)) && eventPartners.length > 0 && !form.is_reimbursement && !isPaidByPartner && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isPartnerExtra;
                      setIsPartnerExtra(next);
                      setPartnerExtraId("");
                      setPartnerExtraPartialAmount("");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isPartnerExtra
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🧳 Extra do Sócio
                    <HelpTooltip text="Despesa paga pela empresa (ex: hotel, voos) que será descontada do sócio no fecho. Não entra no DRE." size={12} />
                  </button>
                )}

                {/* Caução / Transitória shortcut — admin/manager only.
                    Ativa is_transitory e abre selector "Pago por" (MP ou um sócio).
                    Se um sócio for escolhido, vincula via partner_paid_expenses (igual a "Pago por Sócio"). */}
                {(authIsAdmin || authIsManager) && !isPartnerExtra && !form.is_reimbursement && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !cautionShortcut;
                    setCautionShortcut(next);
                    if (next) {
                      setIsTransitory(true);
                      setIsExcludeFromResult(false);
                      setCautionPayer("__mp__");
                      // limpa estado de "Pago por Sócio" — será reativado se selecionar sócio
                      setIsPaidByPartner(false);
                      setPaidByPartnerId("");
                    } else {
                      setIsTransitory(false);
                      setCautionPayer("");
                      setIsPaidByPartner(false);
                      setPaidByPartnerId("");
                      setPartnerPaidDate("");
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    cautionShortcut
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🛡️ Caução / Transitória
                  <HelpTooltip text="Despesa transitória (caução, garantia) que não compõe o resultado do evento. Selecione quem desembolsou: Mundo Propício (caixa da empresa) ou um sócio. O valor entra no acerto societário como crédito até ser devolvido." size={12} />
                </button>
                )}

                {/* Botão antigo "🔄 Marcar como Transitória" removido — era duplicado do
                    atalho "🛡️ Caução / Transitória" acima (ambos definem is_transitory=true).
                    O atalho novo é mais rico: pede também quem desembolsou (MP ou sócio). */}

                {/* Exclude from result toggle — admin/manager only, mutually exclusive with transitory */}
                {(authIsAdmin || authIsManager) && !isTransitory && !isPartnerExtra && (
                <button
                  type="button"
                  onClick={() => setIsExcludeFromResult(!isExcludeFromResult)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    isExcludeFromResult
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📋 {isExcludeFromResult ? "Fora do Resultado" : "Excluir do Resultado"}
                  <HelpTooltip text={helpTexts.excludeFromResultToggle} size={12} />
                </button>
                )}

                {/* Limpar marcações: repõe todos os toggles do bloco ao estado inicial */}
                {(form.is_reimbursement || isPaidByPartner || isPartnerExtra || isTransitory || isExcludeFromResult || cautionShortcut) && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        is_reimbursement: false,
                        reimbursement_to: "",
                        reimbursement_note_id: "",
                      }));
                      setIsPaidByPartner(false);
                      setPaidByPartnerId("");
                      setPartnerPaidDate("");
                      setIsPartnerExtra(false);
                      setPartnerExtraId("");
                      setPartnerExtraPartialAmount("");
                      setIsTransitory(false);
                      setIsExcludeFromResult(false);
                      setCautionShortcut(false);
                      setCautionPayer("");
                      setShowNewReimbursementNote(false);
                      setNewReimbursementEmployeeName("");
                    }}
                    className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Remove todas as marcações especiais (Reembolso, Pago por Sócio, Extra do Sócio, Caução, Transitória, Fora do Resultado)"
                  >
                    ✕ Limpar marcações
                  </button>
                )}
              </div>

              {/* Selector "Pago por" do shortcut Caução / Transitória */}
              {cautionShortcut && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">Pago por *</label>
                  <SearchableSelect
                    options={[
                      { value: "__mp__", label: "Mundo Propício (caixa da empresa)" },
                      ...((form.event_id || (isSplit && splitMasterEventId))
                        ? eventPartners.map((p: any) => ({
                            value: p.id,
                            label: `${p.suppliers?.name} (${p.percentage}%)`,
                          }))
                        : []),
                    ]}
                    value={cautionPayer}
                    onValueChange={(v) => {
                      setCautionPayer(v);
                      if (v === "__mp__" || !v) {
                        setIsPaidByPartner(false);
                        setPaidByPartnerId("");
                        setPartnerPaidDate("");
                      } else {
                        setIsPaidByPartner(true);
                        setPaidByPartnerId(v);
                        setPartnerPaidDate(form.date || new Date().toISOString().split("T")[0]);
                        setForm((prev) => ({ ...prev, account_id: "" }));
                      }
                    }}
                    placeholder="Selecionar pagador…"
                    searchPlaceholder="Pesquisar…"
                  />
                  {cautionPayer && cautionPayer !== "__mp__" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Data em que o sócio pagou *</label>
                      <DatePicker
                        value={partnerPaidDate}
                        onChange={(v) => setPartnerPaidDate(v)}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {cautionPayer === "__mp__" || !cautionPayer
                      ? "Caução paga pela empresa — credita automaticamente Mundo Propício no acerto societário."
                      : "Caução paga pelo sócio — entra no acerto societário a seu favor até ser devolvida."}
                  </p>
                </div>
              )}
              {form.is_reimbursement && (
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota de Reembolso *</label>
                  {!showNewReimbursementNote ? (
                    <div className="space-y-2">
                      <SearchableSelect
                        options={reimbursementNotes.map((n: any) => ({
                          value: n.id,
                          label: `${n.code} — ${n.employee_name}`,
                        }))}
                        value={form.reimbursement_note_id}
                        onValueChange={(v) => {
                          const note = reimbursementNotes.find((n: any) => n.id === v);
                          setForm({ ...form, reimbursement_note_id: v, reimbursement_to: note?.employee_name || "" });
                        }}
                        placeholder="Selecionar nota existente…"
                        searchPlaceholder="Pesquisar por código ou funcionário…"
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewReimbursementNote(true); setForm({ ...form, reimbursement_note_id: "" }); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Criar nova nota
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={newReimbursementEmployeeName}
                        onChange={(e) => {
                          setNewReimbursementEmployeeName(e.target.value);
                          setForm({ ...form, reimbursement_to: e.target.value });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Nome do funcionário"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewReimbursementNote(false); setNewReimbursementEmployeeName(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        ← Selecionar nota existente
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    A transação será vinculada automaticamente à nota de reembolso — sem conta financeira associada
                  </p>
                </div>
              )}
              {isPaidByPartner && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Sócio que pagou *</label>
                    <SearchableSelect
                      options={eventPartners.map((p: any) => ({
                        value: p.id,
                        label: `${p.suppliers?.name} (${p.percentage}%)`,
                      }))}
                      value={paidByPartnerId}
                      onValueChange={setPaidByPartnerId}
                      placeholder="Selecionar sócio…"
                      searchPlaceholder="Pesquisar…"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Data em que o sócio pagou *</label>
                    <DatePicker
                      value={partnerPaidDate}
                      onChange={(v) => setPartnerPaidDate(v)}
                    />
                  </div>
                  <p className="sm:col-span-2 text-[10px] text-muted-foreground">
                    Despesa fica imediatamente liquidada — sem conta financeira da empresa nem método de pagamento. Entra no acerto com o sócio.
                  </p>
                </div>
              )}
              {isPartnerExtra && (() => {
                const totalAmt = parseFloat(form.amount) || 0;
                const partialAmt = parseFloat(partnerExtraPartialAmount) || 0;
                const isPartial = partialAmt > 0 && partialAmt < totalAmt;
                const partialInvalid = partnerExtraPartialAmount.trim() !== "" && (partialAmt <= 0 || partialAmt >= totalAmt);
                return (
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Sócio a abater *</label>
                      <SearchableSelect
                        options={eventPartners.map((p: any) => ({
                          value: p.id,
                          label: `${p.suppliers?.name} (${p.percentage}%)`,
                        }))}
                        value={partnerExtraId}
                        onValueChange={setPartnerExtraId}
                        placeholder="Selecionar sócio…"
                        searchPlaceholder="Pesquisar…"
                      />
                    </div>
                    {!isSplit && (
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          Apenas parte da fatura é extra (€)
                          <HelpTooltip text={`Deixe vazio se a fatura inteira é extra do sócio. Preencha um valor menor que o total da fatura para abater apenas essa parcela — a fatura é registada pelo total e entra normalmente no DRE/BP; a parcela do sócio vai como transação irmã transitória vinculada à mesma fatura.`} size={12} />
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={totalAmt > 0 ? totalAmt : undefined}
                          value={partnerExtraPartialAmount}
                          onChange={(e) => setPartnerExtraPartialAmount(e.target.value)}
                          disabled={totalAmt <= 0}
                          placeholder={
                            totalAmt > 0
                              ? `Vazio = fatura inteira (${totalAmt.toFixed(2)} €)`
                              : "Preenche o Valor (€) da fatura primeiro"
                          }
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                            partialInvalid
                              ? "border-destructive bg-destructive/5 focus:ring-destructive/40"
                              : "border-border bg-background focus:ring-primary/50"
                          }`}
                        />
                        {partialInvalid && (
                          <p className="mt-1 text-[10px] text-destructive">
                            O valor parcial deve ser maior que 0 e menor que o total da fatura ({totalAmt.toFixed(2)} €).
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {isPartial
                        ? `🧳 Fatura registada por ${totalAmt.toFixed(2)} € (entra DRE/BP). ${partialAmt.toFixed(2)} € serão descontados do sócio no fecho via transação irmã transitória vinculada à mesma fatura.`
                        : "🧳 Despesa paga pela empresa, descontada do sócio no fecho. Marcada como transitória — não entra no DRE nem consome BP."}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Fatura</label>
            <input
              type="text"
              value={form.invoice_ref}
              onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })}
              placeholder="Ex: FT 002/5944"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">Transações com o mesmo nº de fatura serão agrupadas automaticamente</p>
          </div>

          {/* Método de Pagamento — escondido quando pago por sócio (não há pagamento da empresa) */}
          {form.type === "expense" && !isPaidByPartner && (() => {
            const selectedCat = categories.find((c: any) => c.id === form.category_id);
            const isStateCategory = selectedCat?.code?.startsWith("10.4") || selectedCat?.code?.startsWith("10.5");
            const methods = [
              { value: "transfer" as const, label: "Transferência", icon: Building },
              { value: "service_payment" as const, label: "Pag. Serviços", icon: FileText },
              ...(isStateCategory ? [{ value: "state_payment" as const, label: "Pag. Estado", icon: Landmark }] : []),
            ];
            return (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Método de Pagamento</label>
                <div className={cn("grid gap-1.5", isStateCategory ? "grid-cols-3" : "grid-cols-2")}>
                  {methods.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm({ ...form, payment_method: m.value, ...(m.value === "transfer" ? { payment_entity: "", payment_reference: "" } : m.value === "state_payment" ? { payment_entity: "" } : {}) })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-all",
                        form.payment_method === m.value
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Define como esta despesa deverá ser paga</p>
              </div>
            );
          })()}

          {form.type === "expense" && !isPaidByPartner && form.payment_method === "service_payment" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Entidade</label>
                <input type="text" value={form.payment_entity}
                  onChange={(e) => setForm({ ...form, payment_entity: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: 10611" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência</label>
                <input type="text" value={form.payment_reference}
                  onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Referência MB" />
              </div>
            </div>
          )}

          {form.type === "expense" && !isPaidByPartner && form.payment_method === "state_payment" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência de Pagamento</label>
              <input type="text" value={form.payment_reference}
                onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Referência AT / SS" />
            </div>
          )}


          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Lançamento</label>
              <DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} placeholder="Data…" />
            </div>
            {form.type === "expense" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Vcto</label>
                <input
                  key={`due-date-${form.type}-${form.event_id || "none"}`}
                  type="text"
                  inputMode="numeric"
                  name="transaction_due_date"
                  autoComplete="off"
                  placeholder="dd/mm/aaaa"
                  value={form.due_date || ""}
                  onChange={(e) => setForm({ ...form, due_date: formatDueDateInput(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}
          </div>

          {/* ===== Parcelamento (Fase 1.5) ===== */}
          {form.type === "expense" && !isSplit && !autoMarkPaid && !isPaidByPartner && !isPartnerExtra && !form.is_reimbursement && parseFloat(form.amount || "0") > 0 && (() => {
            const grossTotal = +(parseFloat(form.amount || "0") * (1 + Number(form.iva_rate || 0) / 100)).toFixed(2);
            return (
              <div className="space-y-2">
                <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/60">
                  <input
                    type="checkbox"
                    checked={useInstallments}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setUseInstallments(v);
                      if (v && installmentRows.length === 0) {
                        setInstallmentWizard((w) => ({
                          ...w,
                          firstDate: w.firstDate || parseDueDateForDb(form.due_date) || form.date,
                        }));
                      }
                    }}
                  />
                  <span className="font-medium">Pagar em parcelas</span>
                  <span className="text-xs text-muted-foreground">
                    (1 transação fiscal · N pagamentos planeados; total = {grossTotal.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })})
                  </span>
                </label>
                {useInstallments && (
                  <TransactionInstallmentsEditor
                    grossTotal={grossTotal}
                    defaultFirstDate={parseDueDateForDb(form.due_date) || form.date}
                    installments={installmentRows}
                    onChange={setInstallmentRows}
                    count={installmentWizard.count}
                    firstDate={installmentWizard.firstDate}
                    interval={installmentWizard.interval}
                    onWizardChange={setInstallmentWizard}
                  />
                )}
              </div>
            );
          })()}



          {!showProrationConfirm && !showDuplicateConfirm && (
            <div className="flex gap-2">
              <label
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-secondary/80 cursor-pointer"
                title={attachAfterCreateFile ? `Anexo selecionado: ${attachAfterCreateFile.name}` : "Anexar documento — será associado após criar a transação"}
              >
                <Paperclip className="h-4 w-4" />
                {attachAfterCreateFile ? "Anexado" : "Anexar"}
                <input
                  type="file"
                  accept="image/*,application/pdf,.dng,.tif,.tiff,image/x-adobe-dng"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setAttachAfterCreateFile(f);
                      toast({ title: "Anexo selecionado", description: `${f.name} será anexado ao criar.` });
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {attachAfterCreateFile && (
                <button
                  type="button"
                  onClick={() => setAttachAfterCreateFile(null)}
                  className="rounded-lg border border-border bg-secondary px-2 py-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={`Remover anexo (${attachAfterCreateFile.name})`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button type="submit" disabled={createMutation.isPending || !!(isSplit && !isTransitory && splitCategoryBlockReason)}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                {createMutation.isPending ? "A guardar…" : "Criar Transação"}
              </button>
            </div>
          )}
        </form>

        {/* Split disambiguation dialog */}
        {showSplitDisambiguation && disambiguationForecast && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowSplitDisambiguation(false)}>
            <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Split className="h-4 w-4 text-primary" />
                  Rateio ou Exclusivo?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Esta categoria existe no BP do evento Master (rateio). Como deseja lançar esta despesa?
                </p>
              </div>

              {(() => {
                const catInfo = categories.find((c: any) => c.id === disambiguationCategoryId);
                const catLabel = catInfo ? `${catInfo.code} ${catInfo.name}` : "Categoria";
                const parentEvent = events.find((e: any) => e.id === disambiguationForecast.parentId);
                const masterAmount = Number(disambiguationForecast.parentForecast?.amount || 0);
                const subForecast = disambiguationForecast.subEventForecast;
                const siblingCount = disambiguationForecast.siblings?.length || 0;
                const fmtMoney = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + "€";

                return (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
                      <p className="font-medium text-foreground">{catLabel}</p>
                      <p className="text-muted-foreground">Master: {parentEvent?.name} — BP: {fmtMoney(masterAmount)}</p>
                      {subForecast && (
                        <p className="text-muted-foreground">Sub-evento: BP local — {fmtMoney(Number(subForecast.amount))}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={confirmSplitFromDisambiguation}
                      className="w-full rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-left transition-all hover:border-primary/60 hover:bg-primary/10"
                    >
                      <div className="flex items-center gap-2">
                        <Split className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Rateio — Dividir por {siblingCount} cidades</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            O valor será dividido por todos os sub-eventos. Usa os dados do BP Master.
                          </p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={confirmExclusiveFromDisambiguation}
                      className="w-full rounded-lg border-2 border-border bg-background p-3 text-left transition-all hover:border-accent hover:bg-accent/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">📌</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">Exclusivo deste evento</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {subForecast
                              ? "Despesa específica desta cidade. Usa os dados do BP local."
                              : "Despesa específica desta cidade. Sem previsão no BP — será marcada como 'Fora do BP'."}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => setShowSplitDisambiguation(false)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <LocalReinforcementDialog
        open={showReinforcementDialog}
        onOpenChange={setShowReinforcementDialog}
        categoryName={categories.find((c: any) => c.id === form.category_id)?.name ?? ""}
        masterDescription={masterDetection.getMasterForecastForCategory(form.category_id)?.description ?? ""}
        onConfirm={handleReinforcementConfirm}
      />

      <SplitByIvaModal
        open={showSplitByIvaModal}
        onClose={() => {
          setShowSplitByIvaModal(false);
          setAiPrefilledLines(null);
        }}
        initialBase={parseFloat(form.amount) || undefined}
        initialRate={form.iva_rate}
        prefilledLines={aiPrefilledLines ?? undefined}
        attachmentFile={pendingInvoiceFile}
        supplierName={selectedSupplier?.name ?? null}
        transactionDescription={form.description ?? null}
        expectedTotal={
          (parseFloat(form.amount) || 0) > 0
            ? (parseFloat(form.amount) || 0) * (1 + form.iva_rate / 100)
            : undefined
        }
        onConfirm={(lines, attach, replacementFile) => {
          const fileToAttach = replacementFile ?? pendingInvoiceFile;
          if (replacementFile) setPendingInvoiceFile(replacementFile);
          setPendingIvaSplit(lines);
          setAttachIvaSplitFile(attach && fileToAttach ? fileToAttach : null);
          setShowSplitByIvaModal(false);
          setAiPrefilledLines(null);
          // Reflete o total no campo amount apenas como referência visual (somatório das bases).
          const totalBase = lines.reduce((s, l) => s + l.base, 0);
          setForm((f) => ({ ...f, amount: String(totalBase) }));
          toast({
            title: "Divisão por IVA pronta",
            description: `Ao guardar, serão criadas ${lines.length} transações ligadas pelo mesmo Nº fatura${attach && fileToAttach ? " (com fatura anexa)" : ""}.`,
          });
        }}
        onApplyBlended={(baseNet, rate, attach, replacementFile) => {
          // IVA médio (snap): preenche o formulário com 1 só transação.
          const fileToAttach = replacementFile ?? pendingInvoiceFile;
          if (replacementFile) setPendingInvoiceFile(replacementFile);
          setPendingIvaSplit(null);
          setAttachIvaSplitFile(null);
          setAttachAfterCreateFile(attach && fileToAttach ? fileToAttach : null);
          setShowSplitByIvaModal(false);
          setAiPrefilledLines(null);
          setForm((f) => ({ ...f, amount: String(baseNet), iva_rate: rate }));
          toast({
            title: "IVA médio aplicado",
            description: `1 transação a ${rate}% sobre base ${baseNet.toFixed(2)}€${attach && fileToAttach ? " — fatura será anexada" : ""}. Verifica e guarda.`,
          });
        }}
      />
    </div>
  );
}
