// debug-key-check
// Verifica metadata do secret ENCRYPTION_MASTER_KEY sem expor o valor.
// Devolve: length, first 4 chars, last 4 chars, trailing whitespace flag.

Deno.serve(async (_req) => {
  const key = Deno.env.get("ENCRYPTION_MASTER_KEY") ?? "MISSING";

  return new Response(
    JSON.stringify({
      env_var_present: key !== "MISSING",
      key_length: key.length,
      key_first_4: key.substring(0, 4),
      key_last_4: key.substring(Math.max(0, key.length - 4)),
      has_trailing_newline: key.endsWith("\n"),
      has_trailing_space: key.endsWith(" "),
      has_leading_space: key.startsWith(" "),
      deployment_time: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
