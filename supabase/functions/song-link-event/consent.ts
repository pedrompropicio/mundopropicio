// #647-d: decisões puras; sem relógio, armazenamento, rede ou identificadores.
export type SongLinkEvent = "arrival" | "choice" | "app_open" | "consent";
export type ConsentStatus = "pending" | "granted" | "denied" | "not_applicable";

export function consentPolicy(protectedZone: boolean, consent: unknown, event: SongLinkEvent, ssr = false) {
  // SSR antecede sempre a resposta ao aviso. Um sinal granted do SSR não é prova.
  const status: ConsentStatus = protectedZone ? "not_applicable"
    : ssr || (consent !== "granted" && consent !== "denied") ? "pending" : consent;
  const allowed = status === "granted";
  return {
    storeIdentifiers: allowed,
    send: allowed && (!ssr || event !== "arrival"),
    status,
    deliveryStatus: protectedZone ? "nao_aplicavel_zona_protegida"
      : status === "denied" ? "recusado_consentimento"
      : allowed ? "pendente" : "aguarda_consentimento",
  };
}

export function consentVersion(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 40 ? value.trim() : null;
}

// Consentimento pode completar chegadas browser ou SSR; nunca outro link/evento,
// datas inválidas/futuras ou uma chegada com 2 h ou mais.
export function validConsentArrival(
  arrival: { link_id: string; event: string; created_at: string } | null,
  linkId: string, nowMs: number,
): boolean {
  if (!arrival || arrival.link_id !== linkId || arrival.event !== "arrival") return false;
  const age = nowMs - Date.parse(arrival.created_at);
  return Number.isFinite(age) && age >= 0 && age < 2 * 60 * 60 * 1000;
}
