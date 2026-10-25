// Teste A/B ios-btn-v1 (botão do smart link no iPhone). Puro, sem efeitos.
// Sorteio estável por ip_hash, só em iOS e só dentro da janela do teste.
// Forçar (?ab=A|B, enviado pelo portal em body.ab_force) grava "A_forcado"/"B_forcado",
// que ficam fora da consulta da taxa de toque. A variante nunca vai para Meta/TikTok.

export type AbVariant = "A" | "B" | "A_forcado" | "B_forcado";
export type AbWindow = { start: string; end: string } | null;

// Janela de 7 dias a contar do deploy; preenchida no passo de deploy. null = teste desligado.
export const AB_IOS_BTN_WINDOW: AbWindow = { start: "2026-10-25T22:07:00Z", end: "2026-11-01T22:07:00Z" };
export const AB_IOS_BTN_SALT = "ab-ios-btn-v1:";

export function abForceParam(v: unknown): "A" | "B" | null {
  return v === "A" || v === "B" ? v : null;
}

export async function abVariantFor(input: {
  os: string | null; ipHash: string | null; force: unknown; nowMs: number; window: AbWindow;
}): Promise<AbVariant | null> {
  const forced = abForceParam(input.force);
  if (forced) return forced === "A" ? "A_forcado" : "B_forcado";
  const w = input.window;
  if (!w || input.os !== "ios" || !input.ipHash) return null;
  if (input.nowMs < Date.parse(w.start) || input.nowMs >= Date.parse(w.end)) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(AB_IOS_BTN_SALT + input.ipHash));
  return new Uint8Array(buf)[0] % 2 === 0 ? "A" : "B";
}
