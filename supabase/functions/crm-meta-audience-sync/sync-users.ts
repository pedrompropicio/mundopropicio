export type Lead = { email: string | null; phone: string | null };
export type HashPair = [string, string];

export async function collectAllLeads(query: (from: number, to: number) => PromiseLike<{ data: Lead[] | null; error: { message: string } | null }>): Promise<Lead[]> {
  const rows: Lead[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

export async function sendUsers(options: {
  data: HashPair[]; replace: boolean; dryRun?: boolean; audienceId: string;
  accessToken: string; fetcher?: typeof fetch; batchSize?: number; sessionId?: number;
}) {
  if (options.dryRun !== false) return { processed: 0, errors: [] as string[], lastResp: null, totalMeta: undefined };
  const size = options.batchSize ?? 10000;
  const fetcher = options.fetcher ?? fetch;
  const sessionId = options.sessionId ?? Date.now();
  let processed = 0;
  let totalMeta: number | undefined;
  let lastResp: Record<string, any> | null = null;
  const errors: string[] = [];
  // Empty replacement still finalizes a session; it must not silently retain withdrawn members.
  const batches = options.replace ? Math.max(1, Math.ceil(options.data.length / size)) : Math.ceil(options.data.length / size);
  for (let batch = 0; batch < batches; batch++) {
    const chunk = options.data.slice(batch * size, (batch + 1) * size);
    const params = new URLSearchParams({
      payload: JSON.stringify({ schema: ["EMAIL_SHA256", "PHONE_SHA256"], data: chunk }),
      access_token: options.accessToken,
    });
    if (options.replace) params.set("session", JSON.stringify({
      session_id: sessionId, batch_seq: batch + 1,
      last_batch_flag: batch === batches - 1, estimated_num_total: options.data.length,
    }));
    try {
      const response = await fetcher(`https://graph.facebook.com/v19.0/${options.audienceId}/${options.replace ? "usersreplace" : "users"}`, { method: "POST", body: params });
      lastResp = await response.json();
      if (!response.ok || lastResp?.error) throw new Error(lastResp?.error?.message ?? `HTTP ${response.status}`);
      processed += lastResp?.num_received ?? chunk.length;
      if (typeof lastResp?.audience_approximate_count === "number") totalMeta = lastResp.audience_approximate_count;
    } catch (error) {
      errors.push(`batch ${batch + 1}: ${String(error)}`);
      // Never finalize an incomplete replacement, or retry a session with an unknown outcome.
      if (options.replace) break;
    }
  }
  return { processed, errors, lastResp, totalMeta };
}