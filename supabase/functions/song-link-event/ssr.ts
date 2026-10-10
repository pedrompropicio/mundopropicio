// Shared by the handler and focused tests; no credentials are stored here.
import { isIP } from "node:net";

export function ssrClientIp(value: unknown): { ip: string | null; reason: string | null } {
  if (value === undefined) return { ip: null, reason: "client_ip ausente" };
  if (value === null) return { ip: null, reason: "client_ip null" };
  if (typeof value !== "string" || isIP(value.trim()) === 0) {
    return { ip: null, reason: "client_ip inválido" };
  }
  return { ip: value.trim(), reason: null };
}

export async function validSsrKey(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(provided), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function botName(ua: string): string | null {
  return ua.match(/facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|TelegramBot|Googlebot|bingbot|Applebot|LinkedInBot|Discordbot|Pinterestbot|(?:[a-z0-9_-]*(?:bot|crawler|spider))/i)?.[0] ?? null;
}

export function prefetchDetail(prefetch: boolean, purpose: unknown, ua: string): string | null {
  const bot = botName(ua);
  if (!prefetch && !bot) return null;
  const text = typeof purpose === "string" ? purpose.trim() : "";
  return (text || bot || "prefetch").slice(0, 60);
}