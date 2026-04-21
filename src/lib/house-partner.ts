/**
 * Mundo Propício — empresa realizadora/gestora dos eventos da plataforma.
 * É, por defeito, sócia de 100% de todos os eventos. Quando se cadastram sócios
 * externos em event_partners, a sua quota passa a ser `100 − Σ(externos)`.
 *
 * A sua participação NÃO é cadastrada em event_partners: é calculada
 * implicitamente. Este módulo expõe utilitários para injetar a Mundo Propício
 * como uma linha equivalente aos restantes sócios (mesmo shape: id sentinela,
 * percentage, effectivePercentage, etc.) para que UI/PDF/relatórios a tratem
 * com o mesmo grau de importância dos outros sócios.
 */

export const HOUSE_PARTNER_ID = "__house_mundo_propicio__";
export const HOUSE_PARTNER_NAME = "MUNDO PROPÍCIO";

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
  // Se a soma dos externos exceder ou bater 100%, a Mundo Propício não tem
  // quota residual e não deve aparecer no fecho.
  if (housePct <= 0.0001) return null;
  // Arredonda para evitar 49.999999...
  return Math.round(housePct * 10000) / 10000;
}

/**
 * Devolve true se um partnerId for o sentinela da Mundo Propício.
 */
export function isHousePartner(partnerId: string | null | undefined): boolean {
  return partnerId === HOUSE_PARTNER_ID;
}
