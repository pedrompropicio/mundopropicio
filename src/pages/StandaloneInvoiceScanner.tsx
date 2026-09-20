import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Upload, Loader2, Check, ArrowLeft, ScanLine, RefreshCw, X } from "lucide-react";
import { HEIC_ACCEPT, isHeicFile, normalizeImageFile } from "@/lib/image-upload";
import { fileToBase64, prepareFileForInvoiceOcr } from "@/lib/invoice-ocr-prepare";
import { uploadToCompanyBucket } from "@/lib/storage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountantStandaloneInvoicesTab } from "@/pages/contabilidade/AccountantStandaloneInvoicesTab";
import { DocumentScanStep } from "@/components/DocumentScanStep";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { removeFromCompanyBucket } from "@/lib/storage";
import {
  calculateStandaloneEur,
  isStandaloneInvoiceDuplicateError,
  parseStandaloneAmount,
  STANDALONE_INVOICE_CURRENCIES,
  validateStandaloneMonetaryFields,
  type StandaloneInvoiceCurrency,
} from "@/lib/standalone-invoices";

import { fetchSuggestedFxRateDetails, type CurrencyCode } from "@/lib/currency";

const ACCEPT = `image/*,application/pdf,${HEIC_ACCEPT}`;

export default function StandaloneInvoiceScanner() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Quando true, o próximo OCR não sobrescreve campos já preenchidos. */
  const preserveRef = useRef(false);


  const [file, setFile] = useState<File | null>(null);
  const [scanCandidate, setScanCandidate] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "convert" | "ocr" | "save">(null);
  const [saved, setSaved] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [supplierNif, setSupplierNif] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currency, setCurrency] = useState<StandaloneInvoiceCurrency>("EUR");
  const [originalAmount, setOriginalAmount] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [fxRateSource, setFxRateSource] = useState("");
  /** Dia de fixing do BCE usado na taxa sugerida (#212). */
  const [fxDateUsed, setFxDateUsed] = useState<string | null>(null);
  const [fxBusy, setFxBusy] = useState(false);
  const [paidBy, setPaidBy] = useState(user?.id ?? "none");
  const [total, setTotal] = useState("");
  const [iva, setIva] = useState("");
  const [notes, setNotes] = useState("");

  const hasAnyField = () =>
    [supplierName, supplierNif, invoiceNumber, invoiceDate, originalAmount, fxRate, fxRateSource, total, iva, notes].some((v) => v.trim() !== "");

  const { data: companyUsers = [] } = useQuery({
    queryKey: ["standalone-invoice-company-users", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("user_id").eq("company_id", companyId ?? "");
      if (rolesError) throw rolesError;
      const ids = [...new Set((roles ?? []).map((row) => row.user_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (error) throw error;
      return profiles ?? [];
    },
  });

  useEffect(() => {
    if (user?.id && paidBy === "none") setPaidBy(user.id);
  }, [paidBy, user?.id]);

  /**
   * #212 — pede o câmbio de referência do BCE da DATA DA FATURA, a mesma regra da
   * API `ingest-standalone-invoice` (D-ERP88). Sem data preenchida usa a de hoje.
   */
  const loadFxRate = async (ccy: StandaloneInvoiceCurrency, date: string) => {
    if (ccy === "EUR") return;
    setFxBusy(true);
    try {
      const result = await fetchSuggestedFxRateDetails(ccy as CurrencyCode, supabase, date || undefined);
      if (!result) {
        toast({ title: "Câmbio não obtido", description: "Preenche a taxa à mão.", variant: "destructive" });
        return;
      }
      const rate = String(result.rate);
      setFxRate(rate);
      setFxDateUsed(result.dateUsed);
      setFxRateSource(`BCE (frankfurter.app) ${result.dateUsed ?? date}`);
      setTotal(calculateStandaloneEur(originalAmount, rate));
    } finally {
      setFxBusy(false);
    }
  };

  // Volta a pedir a taxa quando a moeda ou a data da fatura mudam.
  useEffect(() => {
    if (currency === "EUR") return;
    void loadFxRate(currency, invoiceDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, invoiceDate]);

  const clearCapture = () => {
    setFile(null);
    setScanCandidate(null);
    setPreviewUrl(null);
    setSaved(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    clearCapture();
    setSupplierName("");
    setSupplierNif("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setCurrency("EUR");
    setOriginalAmount("");
    setFxRate("");
    setFxRateSource("");
    setFxDateUsed(null);
    setPaidBy(user?.id ?? "none");
    setTotal("");
    setIva("");
    setNotes("");
  };

  const dismiss = () => {
    // Upload só acontece no "Guardar fatura" — não há ficheiro órfão no bucket.
    if (hasAnyField() && !window.confirm("Descartar esta captura e os dados preenchidos?")) return;
    reset();
    toast({ title: "Captura descartada" });
  };

  /** Repetir: nova captura do mesmo documento, mantendo o que já foi escrito. */
  const retake = () => {
    preserveRef.current = true;
    clearCapture();
    cameraRef.current?.click();
  };

  /** Aceita o ficheiro final (cru ou processado) e corre o OCR. */
  const acceptFile = async (finalFile: File) => {
    const preserve = preserveRef.current;
    preserveRef.current = false;
    setScanCandidate(null);
    setFile(finalFile);
    setPreviewUrl(finalFile.type.startsWith("image/") ? URL.createObjectURL(finalFile) : null);

    // Se o utilizador já preencheu os campos principais, não vale a pena re-correr o OCR.
    if (preserve && [supplierName, supplierNif, invoiceDate, total].every((v) => v.trim() !== "")) {
      toast({ title: "Imagem substituída", description: "Campos preenchidos mantidos." });
      return;
    }

    /** Só escreve se o campo estiver vazio quando estamos a preservar edições. */
    const put = (setter: (fn: (prev: string) => string) => void, value: string) =>
      setter((prev) => (preserve && prev.trim() !== "" ? prev : value));

    setBusy("ocr");
    try {
      const prep = await prepareFileForInvoiceOcr(finalFile);
      if (!prep.ok) {
        toast({ title: "OCR não disponível para este ficheiro", description: "Preenche os campos à mão (opcional)." });
        return;
      }
      const base64 = await fileToBase64(prep.file);
      const { data, error } = await supabase.functions.invoke("extract-camarim-receipt", {
        body: { image_base64: base64, mime_type: prep.file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.supplier_name) put(setSupplierName, String(data.supplier_name));
      if (data.supplier_nif) put(setSupplierNif, String(data.supplier_nif));
      if (data.invoice_number || data.document_number) put(setInvoiceNumber, String(data.invoice_number ?? data.document_number));
      if (data.document_date) put(setInvoiceDate, String(data.document_date));
      if (data.total_amount != null) put(setTotal, String(data.total_amount));
      if (data.iva_amount != null) put(setIva, String(data.iva_amount));
      toast({
        title: "Fatura lida com IA",
        description: data.confidence === "low" ? "Confiança baixa — confirma os dados." : undefined,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "OCR falhou",
        description: "Podes gravar assim mesmo e preencher depois.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePicked = async (picked: File) => {
    setSaved(false);
    let normalized = picked;
    if (isHeicFile(picked)) {
      setBusy("convert");
      try {
        normalized = await normalizeImageFile(picked);
      } catch (err: any) {
        toast({ title: "Foto HEIC não suportada", description: err.message, variant: "destructive" });
        setBusy(null);
        return;
      }
      setBusy(null);
    }

    // Imagens passam pelo passo de scan (enquadramento + perspetiva).
    if (normalized.type.startsWith("image/")) {
      setFile(null);
      setPreviewUrl(null);
      setScanCandidate(normalized);
      return;
    }

    await acceptFile(normalized);
  };


  const save = async () => {
    if (!file || !companyId) return;
    const monetaryError = validateStandaloneMonetaryFields(currency, originalAmount, fxRate, total);
    if (monetaryError) {
      toast({ title: "Confirma os valores", description: monetaryError, variant: "destructive" });
      return;
    }
    setBusy("save");
    let uploadedPath: string | null = null;
    try {
      if (supplierNif.trim() && invoiceNumber.trim()) {
        const { data: duplicate, error: duplicateError } = await (supabase as any).from("standalone_invoices")
          .select("id").eq("company_id", companyId).eq("supplier_nif", supplierNif.trim())
          .eq("invoice_number", invoiceNumber.trim()).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) throw Object.assign(new Error("Já existe uma fatura deste fornecedor com este número."), { code: "DUPLICATE_INVOICE" });
      }
      const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? ".jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const up = await uploadToCompanyBucket("standalone-invoices", path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw up.error;
      uploadedPath = up.path;

      const { error } = await (supabase as any).from("standalone_invoices").insert({
        company_id: companyId,
        storage_path: up.path,
        file_name: file.name,
        supplier_name: supplierName.trim() || null,
        supplier_nif: supplierNif.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        invoice_date: invoiceDate || null,
        currency,
        original_amount: currency === "EUR" ? null : parseStandaloneAmount(originalAmount),
        fx_rate: currency === "EUR" ? null : parseStandaloneAmount(fxRate),
        fx_rate_source: currency === "EUR" ? null : fxRateSource.trim() || null,
        total_amount: parseStandaloneAmount(total),
        iva_amount: parseStandaloneAmount(iva),
        paid_by_partner_id: paidBy === "none" ? null : paidBy,
        notes: notes.trim() || null,
        status: "new",
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      setSaved(true);
      toast({ title: "Fatura guardada", description: "Disponível no portal da contabilidade." });
    } catch (err: any) {
      if (uploadedPath) await removeFromCompanyBucket("standalone-invoices", [uploadedPath]);
      const duplicate = err?.code === "DUPLICATE_INVOICE" || isStandaloneInvoiceDuplicateError(err);
      toast({ title: duplicate ? "Fatura duplicada" : "Não foi possível guardar", description: duplicate ? "Já existe uma fatura deste fornecedor com este número." : err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const [tab, setTab] = useState("scan");

  return (
    <div className={cn("w-full space-y-4", tab === "scan" && "mx-auto max-w-lg")}>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Scanner de Faturas Avulsas
          </h1>
          <p className="text-xs text-muted-foreground">
            Só documento + metadados. Não cria transação nem movimenta contas.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="scan" className="flex-1">Escanear</TabsTrigger>
          <TabsTrigger value="list" className="flex-1">Conferência</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="pt-4">
          <AccountantStandaloneInvoicesTab />
        </TabsContent>
        <TabsContent value="scan" className="pt-4 space-y-4">

      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handlePicked(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handlePicked(f);
        }}
      />

      {saved ? (
        <Card>
          <CardContent className="p-6 space-y-4 text-center">
            <Check className="h-10 w-10 mx-auto text-primary" />
            <p className="font-medium">Fatura guardada.</p>
            <Button className="w-full h-14 text-base" onClick={reset}>
              <Camera className="h-5 w-5 mr-2" /> Escanear outra
            </Button>
          </CardContent>
        </Card>
      ) : scanCandidate ? (
        <DocumentScanStep
          file={scanCandidate}
          onConfirm={(processed) => void acceptFile(processed)}
          onUseOriginal={() => void acceptFile(scanCandidate)}
          onRetake={retake}
          onCancel={() => (preserveRef.current ? clearCapture() : reset())}
        />
      ) : (
        <>
          <div className="grid gap-2">
            <Button
              className="w-full h-16 text-base"
              onClick={() => cameraRef.current?.click()}
              disabled={busy !== null}
            >
              <Camera className="h-6 w-6 mr-2" /> Tirar foto
            </Button>
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
            >
              <Upload className="h-4 w-4 mr-2" /> Escolher ficheiro
            </Button>
          </div>

          {busy === "convert" && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> A converter foto…
            </p>
          )}
          {busy === "ocr" && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> A ler a fatura com IA…
            </p>
          )}

          {file && (
            <Card>
              <CardContent className="p-4 space-y-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Pré-visualização de ${file.name}`}
                    className="max-h-56 w-full rounded-md object-contain bg-muted"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground truncate">{file.name}</p>
                )}

                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="si-supplier">Fornecedor (opcional)</Label>
                    <Input id="si-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="si-nif">NIF</Label>
                      <Input id="si-nif" inputMode="numeric" value={supplierNif} onChange={(e) => setSupplierNif(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="si-date">Data</Label>
                      <Input id="si-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="si-number">Nº fatura</Label>
                      <Input id="si-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Moeda</Label>
                      <Select value={currency} onValueChange={(value) => {
                        const next = value as StandaloneInvoiceCurrency;
                        setCurrency(next);
                        if (next === "EUR") { setOriginalAmount(""); setFxRate(""); setFxRateSource(""); setFxDateUsed(null); }
                      }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                        {STANDALONE_INVOICE_CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                      </SelectContent></Select>
                    </div>
                  </div>
                  {currency !== "EUR" && <div className="space-y-3 rounded-md border p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label htmlFor="si-original">Valor original</Label><Input id="si-original" inputMode="decimal" value={originalAmount} onChange={(e) => { setOriginalAmount(e.target.value); setTotal(calculateStandaloneEur(e.target.value, fxRate)); }} /></div>
                      <div className="space-y-1"><Label htmlFor="si-fx">Câmbio para EUR</Label><Input id="si-fx" inputMode="decimal" value={fxRate} onChange={(e) => { setFxRate(e.target.value); setTotal(calculateStandaloneEur(originalAmount, e.target.value)); }} /></div>
                    </div>
                    <div className="space-y-1"><Label htmlFor="si-fx-source">Fonte do câmbio</Label><Input id="si-fx-source" value={fxRateSource} onChange={(e) => setFxRateSource(e.target.value)} /></div>
                  </div>}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="si-total">Total (EUR)</Label>
                      <Input id="si-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="si-iva">IVA (€)</Label>
                      <Input id="si-iva" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Pago por</Label>
                    <Select value={paidBy} onValueChange={setPaidBy}><SelectTrigger><SelectValue placeholder="Sem indicação" /></SelectTrigger><SelectContent>
                      <SelectItem value="none">Sem indicação</SelectItem>
                      {companyUsers.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name || profile.email || "Utilizador"}</SelectItem>)}
                    </SelectContent></Select>
                  </div>
                  {supplierNif.trim() && invoiceNumber.trim() && <Alert><AlertDescription>O sistema confirma NIF + nº de fatura antes de guardar.</AlertDescription></Alert>}
                  <div className="space-y-1">
                    <Label htmlFor="si-notes">Nota (opcional)</Label>
                    <Input id="si-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Button className="w-full h-14 text-base" onClick={save} disabled={busy !== null}>
                    {busy === "save" ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Check className="h-5 w-5 mr-2" />}
                    Guardar fatura
                  </Button>
                  <Button variant="outline" className="w-full h-12" onClick={retake} disabled={busy !== null}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Repetir
                  </Button>
                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={dismiss} disabled={busy !== null}>
                    <X className="h-4 w-4 mr-2" /> Dispensar
                  </Button>
                </div>

              </CardContent>
            </Card>
          )}
        </>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
