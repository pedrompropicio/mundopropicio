// Verificação de assinatura Svix (webhooks Resend). Pura, sem efeitos.
const TOLERANCE_S = 300;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64(b: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(b)));
}

export async function verifySvix(
  secret: string, id: string | null, ts: string | null, sigHeader: string | null, body: string,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !id || !ts || !sigHeader) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(nowS - t) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey(
    "raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const expected = bytesToB64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return sigHeader.split(" ").some((p) => {
    const [v, s] = p.split(",");
    return v === "v1" && s === expected;
  });
}

export type ParsedEvent = { message_id: string; event_type: "opened" | "clicked"; occurred_at: string };

export function parseResendEvent(json: any): ParsedEvent | null {
  const map: Record<string, ParsedEvent["event_type"]> = { "email.opened": "opened", "email.clicked": "clicked" };
  const type = map[json?.type];
  const mid = json?.data?.email_id;
  if (!type || typeof mid !== "string" || !mid) return null;
  const at = typeof json?.created_at === "string" && !isNaN(Date.parse(json.created_at))
    ? new Date(json.created_at).toISOString() : new Date().toISOString();
  return { message_id: mid, event_type: type, occurred_at: at };
}
