// Partilhado por artist-youtube-oauth-start e artist-youtube-oauth-callback (D-ERP134).
// O redirect_uri do OAuth Google do YouTube passa por www.mundopropicio.com
// (rota /oauth/google/callback do portal, que faz 302 para a edge function
// mantendo a query intacta), porque a Google exige domínios autorizados
// verificados no Search Console e sfohvvlqccmmebvjgibx.supabase.co não o pode ser.
// O secret GOOGLE_YT_OAUTH_REDIRECT_URI permite sobrepor (ex.: testes).

export function ytRedirectUri(): string {
  return (
    Deno.env.get("GOOGLE_YT_OAUTH_REDIRECT_URI") ??
    "https://www.mundopropicio.com/oauth/google/callback"
  );
}
