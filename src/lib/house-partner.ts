/**
 * Mundo Propício — a empresa usuária da plataforma é, por defeito, sócia de todos os eventos.
 *
 * A sua participação NÃO é cadastrada em event_partners: é calculada implicitamente
 * como `100 − Σ(percentagem dos sócios externos cadastrados)`. Quando não há sócios
 * externos, a casa detém 100% e mesmo assim deve aparecer no fecho.
 *
 * Este módulo expõe utilitários para injetar a "casa" como uma linha equivalente
 * aos restantes sócios, partilhando o mesmo shape (id sentinela, percentage,
 * effectivePercentage, etc.) para que UI/PDF/relatórios a tratem de igual modo.
 */

export const HOUSE_PARTNER_ID = "__house_mundo_propicio__";
export const HOUSE_PARTNER_NAME = "Mundo Propício";

export interface HousePartnerLike {
  id: string;
  isHouse: true;
  partnerName: string;
  percentage: number;
  lossPercentage: number | null;
  effectivePercentage: number;
}

/**
 * Calcula a percentagem da casa dado os sócios externos cadastrados.
 * Devolve null se a soma dos externos já cobrir ≥100% (não há quota residual).
 *
 * @param externalPartners array com objetos contendo `percentage` (number)
 */
export function computeHousePercentage(
  externalPartners: { percentage: number | string }[],
): number | null {
  const sum = externalPartners.reduce(
    (s, p) => s + Number(p.percentage || 0),
    0,
  );
  const housePct = 100 - sum;
  // Se a soma dos externos exceder ou bater 100% (ex: 100% para um sócio externo),
  // a casa não tem quota e não deve aparecer.
  if (housePct <= 0.0001) return null;
  // Arredonda para evitar 49.999999...
  return Math.round(housePct * 10000) / 10000;
}

/**
 * Devolve true se um partnerId for o sentinela da casa.
 */
export function isHousePartner(partnerId: string | null | undefined): boolean {
  return partnerId === HOUSE_PARTNER_ID;
}
