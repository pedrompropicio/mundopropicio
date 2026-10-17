/** #333 pure contracts; no provider, database or delivery capabilities. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const OPERATIONS = ["standalone_invoice_v1"] as const;
export type DocumentType = "application/pdf" | "image/jpeg" | "image/png";
export function documentType(bytes: Uint8Array): DocumentType | null {
  if (bytes.length >= 5 && [37,80,68,70,45].every((n,i) => bytes[i] === n)) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return "image/png";
  return null;
}
export function validateDocument(bytes: Uint8Array, declared: string): DocumentType {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Ficheiro vazio ou superior a 20 MB.");
  const type = documentType(bytes);
  if (!type || type !== declared) throw new Error("Conteúdo e tipo do ficheiro não correspondem. Aceites PDF, JPEG e PNG.");
  return type;
}
export function validCivilDate(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === day;
}
export function allowedRole(rows: {role:string;company_id:string|null}[], company:string): boolean {
  return rows.some(r => r.role === "platform_admin" || (r.company_id === company && ["admin","manager"].includes(r.role)));
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer))).map(n => n.toString(16).padStart(2,"0")).join("");
}
export function finalDocumentPath(company:string, document:string, hash:string, type:DocumentType): string {
  if (![company,document].every(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Identidade documental inválida.");
  return `${company}/assistant333/${document}/${hash}.${type === "application/pdf" ? "pdf" : type === "image/jpeg" ? "jpg" : "png"}`;
}