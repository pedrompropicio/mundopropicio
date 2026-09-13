// Chamadas internas entre edge functions da Carreira Artística.
//
// Regra: uma função nunca reencaminha o Authorization de quem a chamou — usa
// SEMPRE a service role key do runtime, em `Authorization` e em `apikey` (o
// gateway exige o apikey). A chave pode ser um JWT legacy ou uma publishable/
// secret key nova (`sb_secret_…`); ambas funcionam desde que o `authorize()`
// de _shared/soundcharts.ts as aceite. NUNCA registar a chave em logs.

export type InternalCallResult = {
  ok: boolean;
  status: number;
  body: unknown;
  error: string | null;
};

export async function invokeInternal(
  fnName: string,
  body: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<InternalCallResult> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text.slice(0, 600);
    }
    return {
      ok: res.ok,
      status: res.status,
      body: parsed,
      error: res.ok ? null : `HTTP ${res.status} — ${text.slice(0, 600)}`,
    };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    return { ok: false, status: 0, body: null, error: msg };
  }
}
