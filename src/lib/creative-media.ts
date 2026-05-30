/**
 * Helpers para decidir como renderizar um criativo do Meta (crm.meta_creatives).
 *
 * Contexto: a tabela tem ~367 criativos com type='video', mas apenas 1 tem
 * ficheiro de vídeo real (mp4 em storage). Os restantes 366 têm file_url a
 * apontar para https://www.facebook.com/ads/image/?d=... — ou seja, são
 * THUMBNAILS de vídeo, não vídeos reproduzíveis. Renderizar <video src=...>
 * sobre uma thumbnail JPEG falha silenciosamente (poster fixo, não reproduz).
 *
 * Regra de reprodução (decidida com o Pedro):
 *  1. file_mime_type começa por "video/"            -> vídeo real
 *  2. senão file_url termina em .mp4/.mov/.webm      -> vídeo real (fallback)
 *  3. senão                                          -> thumbnail / imagem
 */

export type CreativeKind = "video" | "thumbnail" | "image" | "placeholder";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

/**
 * Devolve o "path" da URL sem query string nem fragmento, em minúsculas.
 * Trata casos como ".mp4?token=xyz" ou ".mov#t=10".
 */
function urlPathname(fileUrl: string): string {
  const noFragment = fileUrl.split("#")[0];
  const noQuery = noFragment.split("?")[0];
  return noQuery.toLowerCase();
}

/** True se o file_url termina (ignorando query/fragmento) numa extensão de vídeo. */
export function hasVideoExtension(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false;
  const path = urlPathname(fileUrl);
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Decide se um criativo é um vídeo REPRODUZÍVEL (renderizável em <video>).
 * Mantém a assinatura (file_url, type, file_mime_type) acordada; `type` fica
 * disponível para futuras heurísticas mas a regra atual baseia-se em
 * mime + extensão, que são determinantes do ficheiro real.
 */
export function isPlayableVideo(
  fileUrl: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type: string | null | undefined,
  fileMimeType: string | null | undefined,
): boolean {
  if (!fileUrl) return false;
  if (fileMimeType && fileMimeType.toLowerCase().startsWith("video/")) return true;
  return hasVideoExtension(fileUrl);
}

/**
 * Classifica o criativo para efeitos de renderização:
 *  - "placeholder": sem file_url
 *  - "video":       vídeo reproduzível (ver isPlayableVideo)
 *  - "thumbnail":   type='video' mas sem ficheiro reproduzível (thumbnail do Meta)
 *  - "image":       imagem normal (banner / unknown / etc.)
 */
export function classifyCreative(
  fileUrl: string | null | undefined,
  type: string | null | undefined,
  fileMimeType: string | null | undefined,
): CreativeKind {
  if (!fileUrl) return "placeholder";
  if (isPlayableVideo(fileUrl, type, fileMimeType)) return "video";
  if (type === "video") return "thumbnail";
  return "image";
}

/**
 * Constrói uma URL do Meta Ads Manager ao NÍVEL DA CONTA.
 *
 * Honesto por design: o Ads Manager não tem deep-link público fiável por
 * creative_id, por isso isto abre a vista de anúncios da conta. Quem chama
 * passa o ad_account_id (com ou sem prefixo "act_"); a obtenção do id é
 * responsabilidade do caller (ex.: query a crm.ad_platform_connections).
 *
 * @returns a URL, ou null se não houver ad_account_id.
 */
export function metaAdsManagerUrl(
  adAccountId: string | null | undefined,
): string | null {
  if (!adAccountId) return null;
  const id = adAccountId.replace(/^act_/, "");
  if (!id) return null;
  return `https://business.facebook.com/adsmanager/manage/ads?act=${id}`;
}
