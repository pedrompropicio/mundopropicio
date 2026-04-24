/**
 * Extrai o JPEG de preview embutido num ficheiro DNG/TIFF (RAW).
 *
 * DNG é baseado em TIFF: um header + IFDs (Image File Directory) que descrevem
 * cada "subimagem" (preview, thumbnail, RAW). Quase todos os DNG (incluindo
 * iPhone ProRAW) incluem pelo menos um JPEG de preview de boa qualidade
 * marcado com Compression=7 (JPEG) ou um StripByteCounts a apontar para
 * bytes que começam com SOI (FF D8).
 *
 * Em vez de fazer um parser TIFF completo (complexo: endianness, IFDs
 * encadeados, SubIFDs), usamos uma abordagem pragmática: varrer os bytes do
 * ficheiro à procura de marcadores JPEG SOI (FF D8 FF) e EOI (FF D9), e ficar
 * com o maior segmento JPEG válido encontrado. Isso captura o preview em
 * praticamente todos os DNG reais (iPhone ProRAW, Lightroom, câmaras).
 */
export async function extractJpegFromDng(file: File): Promise<File | null> {
  const buf = new Uint8Array(await file.arrayBuffer());

  let best: { start: number; end: number } | null = null;

  // Procurar todos os pares SOI (FF D8 FF) ... EOI (FF D9)
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      // Procurar o EOI seguinte (FF D9)
      for (let j = i + 2; j < buf.length - 1; j++) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
          const len = j + 2 - i;
          // Filtrar JPEGs minúsculos (thumbnails de 1-2 KB) — preferir o maior
          if (len > 8 * 1024 && (!best || len > best.end - best.start)) {
            best = { start: i, end: j + 2 };
          }
          i = j + 1; // saltar para procurar próximo SOI
          break;
        }
      }
    }
  }

  if (!best) return null;

  const jpegBytes = buf.slice(best.start, best.end);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([jpegBytes], `${baseName}.jpg`, { type: "image/jpeg" });
}

export function isDngFile(file: File): boolean {
  const name = file.name.toLowerCase();
  // Apenas DNG (Apple ProRAW e equivalentes). TIFF genérico fica fora — deixa
  // o upload normal tratar e o OCR salta o formato se não for suportado.
  return (
    name.endsWith(".dng") ||
    file.type === "image/x-adobe-dng" ||
    file.type === "image/dng"
  );
}
