// TEMPORÁRIO — diagnóstico do formato da service role key no runtime.
// NUNCA devolve a chave; só a forma (nº de segmentos, prefixo genérico, role do JWT).
Deno.serve(() => {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const segs = k.split(".").length;
  let role: string | null = null;
  try {
    role = JSON.parse(atob(k.split(".")[1] ?? "")).role ?? null;
  } catch {
    role = null;
  }
  return new Response(
    JSON.stringify({
      present: Boolean(k),
      length: k.length,
      segments: segs,
      looks_like_jwt: segs === 3,
      starts_with_sb_secret: k.startsWith("sb_secret_"),
      jwt_role: role,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
