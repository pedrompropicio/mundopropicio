
/** PDFs stay original; prepared images are new uploads, never replacements behind an existing hash. */
export async function prepareDataEntryScannerFile(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return file;
  const { normalizeImageFile } = await import("./image-upload");
  const { prepareFileForInvoiceOcr } = await import("./invoice-ocr-prepare");
  const normalized = await normalizeImageFile(file);
  const prepared = await prepareFileForInvoiceOcr(normalized);
  if (!prepared.ok) throw new Error("Imagem indisponível para o scanner. Escolhe JPEG, PNG ou uma foto convertível.");
  return prepared.file;
}