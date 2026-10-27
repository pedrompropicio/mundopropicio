import { z } from "zod";

const amount = z.number().finite();
const uuid = z.string().uuid();

/** P6b (0285): a_pagar.caches — informativo, já incluído em a_pagar.total. Opcional, estrito se existir. */
export const cachesSchema = z.object({
  total: amount, retencao_irs_total: amount, sem_retencao_total: amount,
  por_artista: z.array(z.object({
    artist_supplier_id: uuid.nullable(), artista: z.string().nullable(),
    total: amount, retencao_irs: amount, sem_retencao: amount,
    por_evento: z.array(z.object({ evento_id: uuid, evento: z.string().nullable(), total: amount, retencao_irs: amount })),
  })),
  sem_contrato: z.object({ total: amount, n: z.number().int().nonnegative() }),
  nota: z.string(),
}).strict();
export type Caches = z.infer<typeof cachesSchema>;

/** Nome do contrato de cachê («Cachê Simone Mendes» → «Simone Mendes»; «DEIVE LEONARDO» → «Deive Leonardo»). */
export function cacheArtistDisplayName(artistName: string | null | undefined): string | null {
  if (!artistName) return null;
  const base = artistName.replace(/^\s*cach[eê]\s+/i, "").trim();
  if (!base) return null;
  return base === base.toUpperCase()
    ? base.toLocaleLowerCase("pt-PT").replace(/(^|\s)(\p{L})/gu, (_m, s, c) => s + c.toLocaleUpperCase("pt-PT"))
    : base;
}

/** «Deive Leonardo (NON STOP PRODUCOES LTDA)»; sem nome de contrato fica só o fornecedor. */
export function cacheArtistLabel(contractName: string | null, supplier: string | null): string {
  if (contractName && supplier) return `${contractName} (${supplier})`;
  return contractName ?? supplier ?? "Artista sem nome";
}

export interface RetainedRowInput {
  account_id: string; name: string; saldo: number | null;
}
/** ECI, Ticketline e BOL sempre; restantes (Fever, Blueticket, …) só quando o saldo não é zero. */
export function retainedRowsToShow<T extends RetainedRowInput>(rows: T[]): T[] {
  const main = /^(eci|el corte|ticketline|bol)\b/i;
  return rows.filter((r) => main.test(r.name.trim()) || (r.saldo !== null && Math.abs(r.saldo) >= 0.01));
}
