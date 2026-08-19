/**
 * Extrai a mensagem real devolvida por uma edge function (json { error }).
 * supabase.functions.invoke devolve um FunctionsHttpError genérico
 * ("Edge Function returned a non-2xx status code"); a mensagem útil está
 * no corpo da resposta, acessível via error.context.
 */
export async function extractFnError(error: unknown, fallback = "Erro inesperado"): Promise<string> {
  const anyErr = error as any;
  const ctx = anyErr?.context;
  try {
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone?.().json?.() ?? await ctx.json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    // corpo não é JSON — tenta texto
    try {
      if (ctx && typeof ctx.text === "function") {
        const txt = await ctx.text();
        if (txt) return txt.slice(0, 300);
      }
    } catch {
      /* ignora */
    }
  }
  return anyErr?.message ?? fallback;
}
