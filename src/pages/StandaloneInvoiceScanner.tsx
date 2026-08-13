import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Upload, Loader2, Check, ArrowLeft, ScanLine } from "lucide-react";
import { HEIC_ACCEPT, isHeicFile, normalizeImageFile } from "@/lib/image-upload";
import { fileToBase64, prepareFileForInvoiceOcr } from "@/lib/invoice-ocr-prepare";
import { uploadToCompanyBucket } from "@/lib/storage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountantStandaloneInvoicesTab } from "@/pages/contabilidade/AccountantStandaloneInvoicesTab";

const ACCEPT = `image/*,application/pdf,${HEIC_ACCEPT}`;

export default function StandaloneInvoiceScanner() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "convert" | "ocr" | "save">(null);
  const [saved, setSaved] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [supplierNif, setSupplierNif] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [total, setTotal] = useState("");
  const [iva, setIva] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setSupplierName("");
    setSupplierNif("");
    setInvoiceDate("");
    setTotal("");
    setIva("");
    setNotes("");
    setSaved(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
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
    }
    setFile(normalized);
    setPreviewUrl(normalized.type.startsWith("image/") ? URL.createObjectURL(normalized) : null);

    setBusy("ocr");
    try {
      const prep = await prepareFileForInvoiceOcr(normalized);
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
      if (data.supplier_name) setSupplierName(String(data.supplier_name));
      if (data.supplier_nif) setSupplierNif(String(data.supplier_nif));
      if (data.document_date) setInvoiceDate(String(data.document_date));
      if (data.total_amount != null) setTotal(String(data.total_amount));
      if (data.iva_amount != null) setIva(String(data.iva_amount));
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

  const save = async () => {
    if (!file || !companyId) return;
    setBusy("save");
    try {
      const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? ".jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const up = await uploadToCompanyBucket("standalone-invoices", path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw up.error;

      const num = (v: string) => {
        const n = Number(v.replace(",", "."));
        return v.trim() === "" || Number.isNaN(n) ? null : n;
      };

      const { error } = await (supabase as any).from("standalone_invoices").insert({
        company_id: companyId,
        storage_path: up.path,
        file_name: file.name,
        supplier_name: supplierName.trim() || null,
        supplier_nif: supplierNif.trim() || null,
        invoice_date: invoiceDate || null,
        total_amount: num(total),
        iva_amount: num(iva),
        notes: notes.trim() || null,
        status: "new",
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      setSaved(true);
      toast({ title: "Fatura guardada", description: "Disponível no portal da contabilidade." });
    } catch (err: any) {
      toast({ title: "Não foi possível guardar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg p-4 space-y-4">
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

      <Tabs defaultValue="scan">
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
                      <Label htmlFor="si-total">Total (€)</Label>
                      <Input id="si-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="si-iva">IVA (€)</Label>
                      <Input id="si-iva" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="si-notes">Nota (opcional)</Label>
                    <Input id="si-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>

                <Button className="w-full h-14 text-base" onClick={save} disabled={busy !== null}>
                  {busy === "save" ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Check className="h-5 w-5 mr-2" />}
                  Guardar fatura
                </Button>
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
