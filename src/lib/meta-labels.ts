// Etiquetas PT-PT para valores enum do Meta.
// O valor guardado em BD continua a ser o enum (SHOP_NOW, OUTCOME_SALES, etc.);
// estas etiquetas são SÓ display. Helpers devolvem o próprio valor se for desconhecido.

export const CTA_LABELS_PT: Record<string, string> = {
  SHOP_NOW: "Comprar agora",
  LEARN_MORE: "Saber mais",
  GET_OFFER: "Obter oferta",
  BOOK_TRAVEL: "Reservar",
  SIGN_UP: "Inscrever-se",
  SUBSCRIBE: "Subscrever",
  CONTACT_US: "Contactar",
  GET_TICKETS: "Comprar bilhetes",
};

export const OBJETIVO_LABELS_PT: Record<string, string> = {
  OUTCOME_SALES: "Vendas",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Interação",
};

export function labelCta(value: string | null | undefined): string {
  if (!value) return "";
  return CTA_LABELS_PT[value] ?? value;
}

export function labelObjetivo(value: string | null | undefined): string {
  if (!value) return "";
  return OBJETIVO_LABELS_PT[value] ?? value;
}
