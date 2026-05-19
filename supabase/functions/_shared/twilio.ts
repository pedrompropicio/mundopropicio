// Shared Twilio REST helper — uses customer's own Twilio account.
// Requires env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.
// TWILIO_WHATSAPP_FROM may include or omit the "whatsapp:" prefix.

export interface TwilioSendResult {
  sid: string;
  status: string;
}

function normalizeWhatsApp(addr: string): string {
  const trimmed = addr.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed.replace(/\s+/g, "")}`;
}

export async function sendWhatsApp(
  to: string,
  body: string,
  fromOverride?: string,
): Promise<TwilioSendResult> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromEnv = fromOverride || Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid) throw new Error("TWILIO_ACCOUNT_SID not configured");
  if (!authToken) throw new Error("TWILIO_AUTH_TOKEN not configured");
  if (!fromEnv) throw new Error("TWILIO_WHATSAPP_FROM not configured");

  const From = normalizeWhatsApp(fromEnv);
  const To = normalizeWhatsApp(to);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = btoa(`${accountSid}:${authToken}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From, To, Body: body }),
  });

  const data = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    const code = data?.code ?? res.status;
    const message = data?.message ?? "unknown error";
    // Hints for common cases
    let hint = "";
    if (res.status === 401) hint = " (verifica TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN)";
    else if (res.status === 403) hint = " (destinatário pode não ter feito opt-in no sandbox)";
    else if (res.status === 429) hint = " (rate limit Twilio)";
    else if (res.status === 400) hint = " (formato de número inválido ou parâmetros)";
    throw new Error(`Twilio ${res.status} [code=${code}]: ${message}${hint}`);
  }

  return { sid: data.sid, status: data.status };
}
