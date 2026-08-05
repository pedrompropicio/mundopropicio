import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Plus, Trash2, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { calcIvaAmount, calcTotalWithIva, roundCents, snapToStandardRate } from "@/lib/iva";
import type { IvaRate } from "@/lib/mock-data";
import { prepareFileForInvoiceOcr, fileToBase64 } from "@/lib/invoice-ocr-prepare";
import { detectNonDeductibleHint } from "@/lib/iva-non-deductible-hint";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";

export interface IvaSplitLine {
  /** Base (sem IVA) em EUR */
  base: number;
  /** Taxa de IVA inteira: 0/6/13/23 */
  iva_rate: IvaRate;
  /** Descrição extra opcional para acrescentar à descrição principal (ex.: "(IVA 13%)") */
  suffix?: string;
}

interface SplitByIvaModalProps {
  open: boolean;
  onClose: () => void;
  /** Confirma a divisão. Recebe N linhas (≥2). O caller cria as transações. */
  /** Confirma criação de N transações (≥2). Recebe `attach` se o utilizador quer anexar a fatura.
   *  `replacementFile` vem preenchido se o utilizador escolheu um novo ficheiro dentro do modal
   *  (substitui o que foi lido inicialmente no formulário pai). */
  onConfirm: (lines: IvaSplitLine[], attach: boolean, replacementFile?: File | null) => void;
  /**
   * Alternativa contabilisticamente aceite: aplica a fatura como **uma única**
   * transação usando IVA médio (snap para a taxa-padrão PT mais próxima do
   * rácio total). O caller deve preencher os campos `amount` (base) e
   * `iva_rate` no formulário e fechar o modal.
   */
  onApplyBlended?: (baseNet: number, rate: IvaRate, attach: boolean, replacementFile?: File | null) => void;
  /** Total esperado da fatura (incl. IVA). Mostra alerta se as linhas não fecham. */
  expectedTotal?: number;
  /** Pré-preencher com base inicial (ex.: o valor já digitado no form). */
  initialBase?: number;
  initialRate?: IvaRate;
  /**
   * Linhas já pré-extraídas (ex.: vindas de extract-invoice-total). Se fornecido,
   * o modal abre já populado com estas linhas em vez do par padrão.
   */
  prefilledLines?: IvaSplitLine[];
  /**
   * Ficheiro original lido pelo OCR (se houver). Quando presente, mostra a
   * checkbox "Anexar fatura às transações" e passa o sinal de volta ao caller.
   */
  attachmentFile?: File | null;
  /** Nome amigável a mostrar na checkbox quando attachmentFile não está disponível. */
  attachmentLabel?: string | null;
  /**
   * Nome do fornecedor e descrição da transação — usados apenas como
   * heurística para sugerir visualmente o botão "IVA médio" em despesas
   * tipicamente sem dedução de IVA (Art.º 21 CIVA: alojamento, refeições,
   * combustíveis, representação, etc.). Nunca esconde o botão.
   */
  supplierName?: string | null;
  transactionDescription?: string | null;
  /** Evento associado — define as taxas aplicáveis (PT 23/13/6/0 · ES 21/10/4/0). */
  eventId?: string | null;
}


const blankLine = (rate: IvaRate = 23): IvaSplitLine => ({ base: 0, iva_rate: rate, suffix: `IVA ${rate}%` });

export function SplitByIvaModal({ open, onClose, onConfirm, onApplyBlended, expectedTotal, initialBase, initialRate, prefilledLines, attachmentFile, attachmentLabel, supplierName, transactionDescription, eventId }: SplitByIvaModalProps) {
  const { rates: rateOptions } = useEventIvaCountry(eventId ?? null);
  const hasAttachment = !!(attachmentFile || attachmentLabel);
  const [attachInvoice, setAttachInvoice] = useState<boolean>(true);
  useEffect(() => {
    if (open) setAttachInvoice(true);
  }, [open, attachmentFile, attachmentLabel]);
  const [lines, setLines] = useState<IvaSplitLine[]>(() =>
    prefilledLines && prefilledLines.length >= 2
      ? prefilledLines
      : [
          { base: initialBase ?? 0, iva_rate: initialRate ?? 13, suffix: `IVA ${initialRate ?? 13}%` },
          blankLine(23),
        ],
  );
  const [extracting, setExtracting] = useState(false);
  const [extractedNote, setExtractedNote] = useState<string | null>(
    prefilledLines && prefilledLines.length >= 2
      ? `Pré-preenchido a partir da fatura: ${prefilledLines.map((l) => `${l.base.toFixed(2)}€ a ${l.iva_rate}%`).join(" · ")}`
      : null,
  );
  /** Ficheiro re-escolhido dentro do modal (substitui o que veio por prop). */
  const [localFile, setLocalFile] = useState<File | null>(null);
  const lastFileName = localFile?.name ?? attachmentFile?.name ?? attachmentLabel ?? null;
  /** URL leve (objectURL) para pré-visualizar a fatura sem abrir o anexo. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // Reset lines whenever the modal re-opens
  useEffect(() => {
    if (open) {
      setLocalFile(null);
      setPreviewExpanded(false);
      if (prefilledLines && prefilledLines.length >= 2) {
        setLines(prefilledLines);
        setExtractedNote(
          `Pré-preenchido a partir da fatura: ${prefilledLines.map((l) => `${l.base.toFixed(2)}€ a ${l.iva_rate}%`).join(" · ")}`,
        );
      } else {
        setLines([
          { base: initialBase ?? 0, iva_rate: initialRate ?? 13, suffix: `IVA ${initialRate ?? 13}%` },
          blankLine(23),
        ]);
        setExtractedNote(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Gera/limpa preview leve a partir do ficheiro ativo (sem refazer OCR).
  useEffect(() => {
    let cancelled = false;
    const sourceFile = localFile ?? attachmentFile ?? null;
    if (!open || !sourceFile) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    (async () => {
      try {
        const prep = await prepareFileForInvoiceOcr(sourceFile);
        if (cancelled) return;
        if (prep.ok === true) {
          const url = URL.createObjectURL(prep.file);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        } else {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, localFile, attachmentFile]);

  // Cleanup final do objectURL.
  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const totals = useMemo(() => {
    const baseSum = lines.reduce((s, l) => s + (Number(l.base) || 0), 0);
    const ivaSum = lines.reduce((s, l) => s + calcIvaAmount(Number(l.base) || 0, l.iva_rate), 0);
    const grandTotal = roundCents(baseSum + ivaSum);
    const diff = expectedTotal != null ? roundCents(grandTotal - expectedTotal) : 0;
    // IVA médio (snap): rácio real → taxa PT mais próxima; recalcula base líquida
    // a partir do total c/IVA para garantir que `base × (1 + rate/100) ≈ total`.
    const realRatio = baseSum > 0 ? (ivaSum / baseSum) * 100 : 0;
    const blendedRate = snapToStandardRate(realRatio, rateOptions);
    const blendedBase = roundCents(grandTotal / (1 + blendedRate / 100));
    const blendedIva = roundCents(grandTotal - blendedBase);
    const blendedDeviation = roundCents(blendedIva - ivaSum);
    return { baseSum: roundCents(baseSum), ivaSum: roundCents(ivaSum), grandTotal, diff, realRatio, blendedRate, blendedBase, blendedIva, blendedDeviation };
  }, [lines, expectedTotal]);

  const updateLine = (idx: number, patch: Partial<IvaSplitLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, blankLine(prev.some((l) => l.iva_rate === 23) ? 6 : 23)]);
  const removeLine = (idx: number) => setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Ficheiro grande", description: "Limite 50MB.", variant: "destructive" });
      return;
    }
    setExtracting(true);
    setExtractedNote(null);
    setLocalFile(file);
    try {
      // Pipeline partilhado: DNG→JPEG, PDF→1ª página JPEG, compressão ≤1280px
      const prep = await prepareFileForInvoiceOcr(file);
      if (prep.ok !== true) {
        const msgMap = {
          raw_no_preview: { title: "RAW sem preview JPEG", description: "Tenta exportar como JPG ou desligar o ProRAW na câmara." },
          raw_failed: { title: "Erro a processar RAW", description: "Exporta como JPG e tenta de novo." },
          pdf_failed: { title: "Não consegui ler o PDF", description: "Preenche os campos à mão." },
          unsupported_format: { title: "Formato não suportado", description: "Usa JPG, PNG, WEBP, HEIC, PDF ou DNG." },
        } as const;
        const m = msgMap[prep.error.kind];
        toast({ variant: "destructive", title: m.title, description: m.description });
        return;
      }
      const prepared = prep.file;
      const fileBase64 = await fileToBase64(prepared);

      const { data, error } = await supabase.functions.invoke("extract-invoice-total", {
        body: { fileBase64, fileName: prepared.name, mimeType: prepared.type || "image/jpeg" },
      });
      if (error) throw error;
      const breakdown: Array<{ rate: number; base: number; iva: number; total: number }> = Array.isArray(data?.vat_breakdown)
        ? data.vat_breakdown
        : [];
      if (breakdown.length === 0) {
        toast({
          title: "Sem rodapé de IVA detetado",
          description: "Não foi possível ler subtotais por taxa. Preenche manualmente.",
          variant: "destructive",
        });
        return;
      }
      // Mapeia para linhas
      const mapped: IvaSplitLine[] = breakdown
        .filter((r) => rateOptions.includes(r.rate as IvaRate))
        .map((r) => ({
          base: roundCents(Number(r.base) || 0),
          iva_rate: r.rate as IvaRate,
          suffix: `IVA ${r.rate}%`,
        }));
      if (mapped.length === 0) {
        toast({ title: "Taxas inválidas", description: "Subtotais não correspondem a taxas portuguesas.", variant: "destructive" });
        return;
      }
      setLines(mapped.length >= 2 ? mapped : [...mapped, blankLine(mapped[0].iva_rate === 23 ? 13 : 23)]);
      setExtractedNote(
        `Extraído da fatura: ${mapped.map((l) => `${l.base.toFixed(2)}€ a ${l.iva_rate}%`).join(" · ")}`,
      );
      toast({ title: "Subtotais lidos", description: `${mapped.length} taxa(s) detetada(s).` });
    } catch (e) {
      console.error("split-iva extract", e);
      toast({
        title: "Erro a ler fatura",
        description: e instanceof Error ? e.message : "Tenta preencher manualmente.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const canConfirm =
    lines.length >= 2 &&
    lines.every((l) => Number(l.base) > 0) &&
    new Set(lines.map((l) => l.iva_rate)).size === lines.length; // sem taxas duplicadas

  const nonDeductibleHint = useMemo(
    () => detectNonDeductibleHint(supplierName, transactionDescription),
    [supplierName, transactionDescription],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-2xl z-[10001] max-h-[90vh] overflow-y-auto" overlayClassName="z-[10000]">
        <DialogHeader>
          <DialogTitle>Dividir lançamento por taxa de IVA</DialogTitle>
          <DialogDescription>
            Cria várias transações vinculadas pelo mesmo Nº fatura — uma por taxa de IVA. Anexa o PDF para preencher
            automaticamente, ou insere os valores à mão.
          </DialogDescription>
        </DialogHeader>

        {/* Upload ficheiro (PDF ou imagem) */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <Label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
            <FileText className="h-4 w-4" />
            <span>Anexar fatura (PDF, JPG, PNG, WEBP, HEIC, TIFF, DNG) para extrair subtotais por IVA</span>
            <input
              type="file"
              accept="application/pdf,image/*,.dng,.tif,.tiff,.heic,.heif,image/x-adobe-dng"
              className="hidden"
              disabled={extracting}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
                extracting && "opacity-60",
              )}
            >
              {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {extracting ? "A ler…" : lastFileName ? "Escolher outro" : "Escolher ficheiro"}
            </span>
          </Label>
          {extractedNote && <p className="mt-2 text-[11px] text-muted-foreground">{extractedNote}</p>}
          {previewUrl && (
            <div className="mt-2 flex items-start gap-3 rounded-md border border-border bg-card/50 p-2">
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                className="shrink-0 overflow-hidden rounded border border-border bg-background hover:ring-2 hover:ring-primary/50 transition"
                title={previewExpanded ? "Reduzir pré-visualização" : "Ampliar pré-visualização"}
              >
                <img
                  src={previewUrl}
                  alt={`Pré-visualização de ${lastFileName ?? "fatura"}`}
                  className={cn(
                    "object-contain bg-background transition-all",
                    previewExpanded ? "h-72 w-auto max-w-[90vw]" : "h-16 w-16",
                  )}
                  loading="lazy"
                />
              </button>
              <div className="flex-1 text-[11px] text-muted-foreground leading-snug">
                <div className="font-medium text-foreground">Pré-visualização da fatura</div>
                <div className="truncate" title={lastFileName ?? undefined}>{lastFileName}</div>
                <div className="mt-1 italic">
                  {previewExpanded
                    ? "Clica de novo para reduzir."
                    : "Clica na miniatura para ampliar — sem precisar de abrir o anexo."}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Linhas */}
        <div className="space-y-2">
          {lines.map((line, idx) => {
            const ivaValue = calcIvaAmount(Number(line.base) || 0, line.iva_rate);
            const total = calcTotalWithIva(Number(line.base) || 0, line.iva_rate);
            return (
              <div
                key={idx}
                className="grid grid-cols-[1fr_110px_140px_auto] items-end gap-2 rounded-lg border border-border bg-card p-2"
              >
                <div>
                  <Label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Base s/ IVA (EUR)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.base || ""}
                    onChange={(e) => updateLine(idx, { base: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Taxa</Label>
                  <select
                    value={line.iva_rate}
                    onChange={(e) =>
                      updateLine(idx, {
                        iva_rate: Number(e.target.value) as IvaRate,
                        suffix: `IVA ${e.target.value}%`,
                      })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {rateOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-right text-xs font-mono leading-tight">
                  <div className="text-muted-foreground">+ IVA {ivaValue.toFixed(2)}€</div>
                  <div className="font-semibold">= {total.toFixed(2)}€</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 2}
                  className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  aria-label="Remover linha"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= 4}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Adicionar taxa
          </button>
        </div>

        {/* Resumo */}
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Σ Bases</span>
            <span>{totals.baseSum.toFixed(2)}€</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Σ IVA</span>
            <span>{totals.ivaSum.toFixed(2)}€</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total c/ IVA</span>
            <span>{totals.grandTotal.toFixed(2)}€</span>
          </div>
          {expectedTotal != null && expectedTotal > 0 && (
            <div
              className={cn(
                "mt-1 flex items-center justify-between text-[11px]",
                Math.abs(totals.diff) <= 0.02 ? "text-success" : "text-destructive",
              )}
            >
              <span className="flex items-center gap-1">
                {Math.abs(totals.diff) > 0.02 && <AlertTriangle className="h-3 w-3" />}
                vs. total esperado ({expectedTotal.toFixed(2)}€)
              </span>
              <span>
                {totals.diff === 0 ? "✓ fecha" : `${totals.diff > 0 ? "+" : ""}${totals.diff.toFixed(2)}€`}
              </span>
            </div>
          )}
        </div>

        {/* Alternativa IVA médio (snap) — explicação; botão fica no footer */}
        {onApplyBlended && totals.baseSum > 0 && totals.ivaSum > 0 && (
          <div
            className={cn(
              "rounded-lg border border-dashed p-3 text-xs space-y-2",
              nonDeductibleHint.suggested
                ? "border-success/60 bg-success/10"
                : "border-primary/40 bg-primary/5",
            )}
          >
            <div className="font-medium text-foreground flex items-center gap-2 flex-wrap">
              <span>
                Alternativa: aplicar como <span className="text-primary">IVA médio</span> (1 transação)
              </span>
              {nonDeductibleHint.suggested && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                  <Sparkles className="h-3 w-3" />
                  Sugerido ({nonDeductibleHint.reason})
                </span>
              )}
            </div>
            {nonDeductibleHint.suggested && (
              <div className="text-[11px] text-success/90 leading-relaxed">
                Detetámos "<strong>{nonDeductibleHint.matchedTerm}</strong>" no fornecedor/descrição —
                este tipo de despesa normalmente <strong>não tem IVA dedutível</strong> (Art.º 21 CIVA),
                pelo que registar como IVA médio costuma ser suficiente.
              </div>
            )}
            <div className="text-muted-foreground leading-relaxed">
              Em vez de criar {lines.length} transações, regista <strong>uma só</strong> com taxa{" "}
              <strong>{totals.blendedRate}%</strong> (mais próxima do rácio real {totals.realRatio.toFixed(2)}%) e
              base ajustada para que <strong>base + IVA = total da fatura</strong>.
            </div>
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>Usa apenas para despesas sem dedução de IVA</strong> (ex.: representação, camarim,
                viaturas ligeiras). Para faturas com <strong>IVA dedutível</strong>, usa "Aplicar {lines.length} linhas"
                para preservar a discriminação fiscal exigida na Modelo Periódica.
              </div>
            </div>
            <div className="font-mono flex flex-wrap gap-x-4 gap-y-1">
              <span>Base: <strong>{totals.blendedBase.toFixed(2)}€</strong></span>
              <span>IVA {totals.blendedRate}%: <strong>{totals.blendedIva.toFixed(2)}€</strong></span>
              <span>Total: <strong>{totals.grandTotal.toFixed(2)}€</strong></span>
              {Math.abs(totals.blendedDeviation) > 0.01 && (
                <span className="text-amber-600 dark:text-amber-400">
                  Desvio IVA vs. real: {totals.blendedDeviation > 0 ? "+" : ""}{totals.blendedDeviation.toFixed(2)}€
                </span>
              )}
            </div>
          </div>
        )}

        {/* Checkbox anexar fatura — só se houver ficheiro lido pelo OCR */}
        {hasAttachment && (
          <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={attachInvoice}
              onChange={(e) => setAttachInvoice(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="leading-snug">
              <div className="font-medium text-foreground">
                Anexar fatura{attachmentFile ? ` (${attachmentFile.name})` : attachmentLabel ? ` (${attachmentLabel})` : ""} às transações criadas
              </div>
              <div className="text-muted-foreground">
                Em IVA misto, o mesmo ficheiro fica anexado a todas as transações irmãs.
              </div>
            </div>
          </label>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          {onApplyBlended && totals.baseSum > 0 && totals.ivaSum > 0 && (
            <Button
              type="button"
              variant={nonDeductibleHint.suggested ? "default" : "secondary"}
              onClick={() => onApplyBlended(totals.blendedBase, totals.blendedRate, attachInvoice, localFile)}
            >
              Aplicar IVA médio ({totals.blendedRate}%)
            </Button>
          )}
          <Button
            type="button"
            variant={nonDeductibleHint.suggested ? "secondary" : "default"}
            disabled={!canConfirm}
            onClick={() =>
              onConfirm(
                lines.map((l) => ({
                  base: roundCents(Number(l.base) || 0),
                  iva_rate: l.iva_rate,
                  suffix: l.suffix || `IVA ${l.iva_rate}%`,
                })),
                attachInvoice,
                localFile,
              )
            }
          >
            Aplicar {lines.length} linhas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
