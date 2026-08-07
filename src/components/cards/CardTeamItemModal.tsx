import { isHeicFile, normalizeImageFile, HEIC_ACCEPT } from "@/lib/image-upload";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import { prepareFileForInvoiceOcr, fileToBase64 } from "@/lib/invoice-ocr-prepare";
import IvaRateSelect from "@/components/IvaRateSelect";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";
import {
  cardBaseFromTotal,
  cardTotalFromBase,
  inferCardRateFromReceipt,
} from "@/lib/card-session-helpers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  primaryEventId: string | null;
  itemId?: string | null;
  autoOpenCamera?: boolean;
  onSaved?: () => void;
}

interface EventOpt {
  id: string;
  name: string;
}

export function CardTeamItemModal({
  open,
  onOpenChange,
  sessionId,
  primaryEventId,
  itemId,
  autoOpenCamera,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [itemDate, setItemDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  /** Valor C/IVA que o utilizador confere contra o talão (o que saiu do cartão). */
  const [total, setTotal] = useState("");
  const [ivaRate, setIvaRate] = useState<number>(0);
  const [eventId, setEventId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState<EventOpt[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingDocPath, setExistingDocPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPayload, setOcrPayload] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Taxas aplicáveis: país da cidade do evento (PT por defeito).
  const { rates } = useEventIvaCountry(eventId || null);

  useEffect(() => {
    if (!open) return;
    void loadEvents();
    if (itemId) {
      void loadItem(itemId);
    } else {
      reset();
      if (autoOpenCamera) {
        const t = setTimeout(() => cameraRef.current?.click(), 250);
        return () => clearTimeout(t);
      }
    }
  }, [open, itemId, autoOpenCamera]);

  const loadEvents = async () => {
    const { data } = await supabase
      .from("events")
      .select("id, name, status")
      .in("status", ["planning", "confirmed", "active"])
      .order("date", { ascending: false })
      .limit(200);
    setEvents(((data ?? []) as any[]).map((e) => ({ id: e.id, name: e.name })));
  };

  const reset = () => {
    setSupplierName("");
    setDescription("");
    setItemDate(new Date().toISOString().slice(0, 10));
    setTotal("");
    setIvaRate(0);
    setEventId(primaryEventId ?? "");
    setNotes("");
    setPhotoFile(null);
    setExistingDocPath(null);
    setPreviewUrl(null);
    setOcrPayload(null);
  };

  const loadItem = async (id: string) => {
    const { data } = await supabase
      .from("card_session_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) return;
    const it = data as any;
    setSupplierName(it.supplier_name ?? "");
    setDescription(it.description ?? "");
    setItemDate(it.item_date ?? new Date().toISOString().slice(0, 10));
    // BD guarda base s/IVA → mostramos o total c/IVA do talão.
    setIvaRate(Number(it.iva_rate ?? 0));
    setTotal(String(cardTotalFromBase(Number(it.amount ?? 0), Number(it.iva_rate ?? 0))));
    setEventId(it.event_id ?? "");
    setOcrPayload(it.ocr_raw_payload);
    setExistingDocPath(it.document_path ?? null);
    if (it.document_path) {
      const { data: signed } = await supabase.storage
        .from("card-documents")
        .createSignedUrl(it.document_path, 60 * 60);
      setPreviewUrl(signed?.signedUrl ?? null);
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    let original = picked;
    if (isHeicFile(picked)) {
      try {
        original = await normalizeImageFile(picked);
      } catch (err: any) {
        toast({ title: "Foto HEIC não suportada", description: err.message, variant: "destructive" });
        e.target.value = "";
        return;
      }
    }
    setPhotoFile(original);
    setPreviewUrl(URL.createObjectURL(original));


    // Prepare + run OCR
    setOcrLoading(true);
    try {
      const prep = await prepareFileForInvoiceOcr(original);
      if (!prep.ok) {
        toast({
          title: "OCR não suportado para este ficheiro",
          description: "Preenche os campos à mão. A foto vai ser anexada.",
        });
        return;
      }
      const base64 = await fileToBase64(prep.file);
      const { data, error } = await supabase.functions.invoke(
        "extract-camarim-receipt",
        { body: { image_base64: base64, mime_type: prep.file.type } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOcrPayload(data);
      if (data.supplier_name && !supplierName) setSupplierName(data.supplier_name);
      if (data.service_description && !description)
        setDescription(data.service_description);
      if (data.document_date) setItemDate(data.document_date);
      if (data.total_amount != null) setTotal(String(data.total_amount));
      // Taxa: preferir IVA € explícito do talão; senão taxa lida; sempre com snap.
      if (data.total_amount != null && data.iva_amount != null)
        setIvaRate(inferCardRateFromReceipt(data.total_amount, data.iva_amount, rates));
      else if (data.iva_rate != null)
        setIvaRate(inferCardRateFromReceipt(1 + Number(data.iva_rate) / 100, Number(data.iva_rate) / 100, rates));
      toast({
        title: "Talão lido com IA",
        description:
          data.confidence === "low" ? "Confiança baixa — confirma os dados." : undefined,
      });
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message ?? "");
      if (msg.includes("429"))
        toast({
          variant: "destructive",
          title: "OCR limitado",
          description: "Muitos pedidos — tenta em alguns segundos.",
        });
      else if (msg.includes("402"))
        toast({
          variant: "destructive",
          title: "Créditos IA esgotados",
          description: "Contacta a gestão.",
        });
      else
        toast({ variant: "destructive", title: "OCR falhou", description: msg });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const gross = parseFloat(total);
    if (!gross || isNaN(gross) || gross <= 0) {
      toast({ variant: "destructive", title: "Total obrigatório" });
      return;
    }
    const rate = Number(ivaRate) || 0;
    const amt = cardBaseFromTotal(gross, rate);
    setSaving(true);
    try {
      let workingId = itemId ?? null;

      if (!workingId) {
        const { data: inserted, error: insErr } = await supabase
          .from("card_session_items")
          .insert({
            session_id: sessionId,
            submitted_by: user.id,
            supplier_name: supplierName.trim() || null,
            description: description.trim() || null,
            item_date: itemDate,
            amount: amt,
            iva_rate: rate,
            event_id: eventId || null,
            ocr_raw_payload: ocrPayload,
            status: "submitted",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        workingId = inserted.id;
      } else {
        const { error: updErr } = await supabase
          .from("card_session_items")
          .update({
            supplier_name: supplierName.trim() || null,
            description: description.trim() || null,
            item_date: itemDate,
            amount: amt,
            iva_rate: rate,
            event_id: eventId || null,
            ocr_raw_payload: ocrPayload,
          })
          .eq("id", workingId);
        if (updErr) throw updErr;
      }

      // Upload photo (nova ou substituição)
      if (photoFile && workingId) {
        const ts = Date.now();
        const ext =
          photoFile.name.split(".").pop()?.toLowerCase() ||
          (photoFile.type.includes("png") ? "png" : "jpg");
        const path = `${sessionId}/${workingId}/${ts}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("card-documents")
          .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (upErr) throw upErr;
        // apagar anterior se existia (só o produtor com sessão aberta)
        if (existingDocPath && existingDocPath !== path) {
          await supabase.storage.from("card-documents").remove([existingDocPath]);
        }
        const { error: updDocErr } = await supabase
          .from("card_session_items")
          .update({ document_path: path })
          .eq("id", workingId);
        if (updDocErr) throw updDocErr;
      }

      toast({ title: itemId ? "Lançamento atualizado" : "Lançamento submetido" });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro ao gravar",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemId) return;
    if (!window.confirm("Eliminar este lançamento?")) return;
    setDeleting(true);
    try {
      if (existingDocPath) {
        await supabase.storage.from("card-documents").remove([existingDocPath]);
      }
      const { error } = await supabase
        .from("card_session_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
      toast({ title: "Lançamento eliminado" });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao eliminar",
        description: err.message,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{itemId ? "Editar lançamento" : "Nova despesa do cartão"}</DialogTitle>
          <DialogDescription className="text-xs">
            Tira foto do talão — a IA preenche o resto. Confirma sempre antes de submeter.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*,application/pdf,image/heic,image/heif,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
        />

        <div className="space-y-3">
          {/* Foto */}
          <div className="rounded-lg border border-dashed border-border p-3">
            {previewUrl ? (
              <div className="space-y-2">
                <img
                  src={previewUrl}
                  alt="Talão"
                  className="max-h-56 w-full rounded object-contain"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => cameraRef.current?.click()}
                  disabled={ocrLoading}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Substituir foto
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => cameraRef.current?.click()}
                disabled={ocrLoading}
              >
                {ocrLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A ler talão…
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" /> Tirar / escolher foto
                  </>
                )}
              </Button>
            )}
            {ocrPayload && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3" /> Pré-preenchido pela IA
                {ocrPayload.confidence ? ` (confiança: ${ocrPayload.confidence})` : ""}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Fornecedor</Label>
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Ex: Pingo Doce, Bomba Galp…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Total (€) *</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="Igual ao talão (c/IVA)"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">IVA (%)</Label>
            <IvaRateSelect eventId={eventId || null} value={Number(ivaRate) || 0} onChange={setIvaRate} />
            {Number(total) > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Total do talão {Number(total).toFixed(2)} € = base{" "}
                {cardBaseFromTotal(total, ivaRate).toFixed(2)} € + IVA {Number(ivaRate) || 0}%
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Evento</Label>
            <Select value={eventId || "__none__"} onValueChange={(v) => setEventId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Sem evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem evento</SelectItem>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.id === primaryEventId ? "  ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              ★ = evento principal da sessão. Podes escolher outro.
            </p>
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhe curto (o que foi comprado)"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            A categoria contabilística é atribuída pela financeira ao aprovar.
          </p>
        </div>

        <DialogFooter className="mt-3 flex-col-reverse gap-2 sm:flex-row">
          {itemId && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
            </Button>
          )}
          <div className="flex flex-1 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || ocrLoading}
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A gravar…
                </>
              ) : itemId ? (
                "Guardar alterações"
              ) : (
                "Submeter"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
