/** Server-owned finite deadline; abort after POST remains uncertain in durable control. */
export const ANALYSIS_TIMEOUT_MS = 60_000;
export async function boundedAnalysis<T>(caller: AbortSignal, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  caller.addEventListener("abort", cancel, { once: true });
  if (caller.aborted) cancel();
  const timer = setTimeout(cancel, ANALYSIS_TIMEOUT_MS);
  try { return await execute(controller.signal); }
  finally { clearTimeout(timer); caller.removeEventListener("abort", cancel); }
}