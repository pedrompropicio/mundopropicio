/**
 * Cabeçalho institucional partilhado para exportações (PDF e XLSX).
 *
 * Problema que resolve: vários ficheiros gerados pelo sistema saíam sem
 * identificação da empresa. Este helper centraliza o bloco
 * "logo + nome da empresa + título + data de geração".
 *
 * Fonte do logo: `companies.logo_url` (bucket público `company-logos`) da
 * empresa ativa. Fallback: logo MP incluído no bundle. Último recurso: nome da
 * empresa em texto destacado.
 */
import type jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";

export interface ExportBranding {
  displayName: string;
  /** Data URL pronta para `doc.addImage`; null quando não há logo. */
  logoDataUrl: string | null;
}

const DEFAULT_NAME = "MP Gestão Eventos";

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * CONTRATO desta camada: `logoDataUrl` é SEMPRE um data URL de imagem válido ou
 * `null` — nunca um URL de asset. O Vite 5 não inlina `?inline` para imagens
 * (devolve o URL do ficheiro), pelo que o fallback local também tem de passar
 * por aqui e ser convertido. Sem isto, `jsPDF.addImage` e `ExcelJS.addImage`
 * recebem um caminho e a imagem morre silenciosamente (ou pendura o zip).
 * Nunca lança: o logótipo é decoração.
 */
async function ensureDataUrl(candidate: string | null | undefined): Promise<string | null> {
  if (!candidate) return null;
  if (candidate.startsWith("data:image/")) return candidate;
  const converted = await urlToDataUrl(candidate);
  return converted && converted.startsWith("data:image/") ? converted : null;
}

/** Guard-rail: 3s no máximo, e nunca rejeita. */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return await Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Resolve o branding para exportação. Se `companyId` não for dado, usa a
 * empresa ativa (mesmo resolvedor que a RLS usa).
 */
export async function fetchExportBranding(companyId?: string | null): Promise<ExportBranding> {
  const localLogo = () => withTimeout(ensureDataUrl(logoHorizontal as string), 3_000, null);
  let id = companyId ?? null;
  try {
    if (!id) {
      const { data } = await supabase.rpc("current_company_id" as any);
      id = (data as string | null) ?? null;
    }
    if (!id) return { displayName: DEFAULT_NAME, logoDataUrl: await localLogo() };

    const { data: company } = await supabase
      .from("companies" as any)
      .select("display_name, legal_name, logo_url")
      .eq("id", id)
      .maybeSingle();
    const c = company as any;
    const displayName = c?.display_name || c?.legal_name || DEFAULT_NAME;
    const remote = c?.logo_url
      ? await withTimeout(ensureDataUrl(String(c.logo_url)), 3_000, null)
      : null;
    return { displayName, logoDataUrl: remote ?? (await localLogo()) };
  } catch {
    return { displayName: DEFAULT_NAME, logoDataUrl: await localLogo() };
  }
}


export interface PdfHeaderOptions {
  branding: ExportBranding;
  title: string;
  /** Linhas de contexto (evento, estado, datas…). */
  subtitles?: string[];
  marginLeft?: number;
  y?: number;
  logoWidth?: number;
}

/**
 * Desenha o cabeçalho institucional e devolve o `y` seguinte.
 * Sem logo disponível, o nome da empresa aparece em texto destacado.
 */
export function drawPdfExportHeader(doc: jsPDF, opts: PdfHeaderOptions): number {
  const marginLeft = opts.marginLeft ?? 14;
  const logoWidth = opts.logoWidth ?? 52;
  let y = opts.y ?? 14;

  let logoDrawn = false;
  if (opts.branding.logoDataUrl) {
    try {
      const fmt = opts.branding.logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(opts.branding.logoDataUrl, fmt as any, marginLeft, y, logoWidth, logoWidth * 0.28);
      y += logoWidth * 0.28 + 5;
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(opts.branding.displayName, marginLeft, y + 5);
    y += 11;
  }

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(opts.title, marginLeft, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  const lines = [
    ...(opts.subtitles ?? []).filter(Boolean),
    `${opts.branding.displayName} · Gerado em ${new Date().toLocaleString("pt-PT")}`,
  ];
  for (const line of lines) {
    doc.text(line, marginLeft, y);
    y += 5;
  }
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

/** Bloco de cabeçalho equivalente para folhas de Excel (matriz de linhas). */
export function buildXlsxHeaderRows(
  branding: ExportBranding,
  title: string,
  subtitles: string[] = [],
): (string | number | null)[][] {
  return [
    [branding.displayName],
    [title],
    ...subtitles.filter(Boolean).map((s) => [s]),
    [`Gerado em ${new Date().toLocaleString("pt-PT")}`],
    [],
  ];
}
