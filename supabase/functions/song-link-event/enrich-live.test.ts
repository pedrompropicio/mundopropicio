// D-ERP234 adenda 2: SSR seguida de browser com o mesmo event_id → uma só linha com opened.
import "https://deno.land/std@0.224.0/dotenv/load.ts";

Deno.test("D-ERP234 adenda 2: browser enriquece a linha SSR", async () => {
  const key = Deno.env.get("SONG_LINK_SSR_KEY");
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  if (!key || !url) throw new Error("bloqueado: segredo ou URL indisponível");
  const eventId = crypto.randomUUID();
  const fn = `${url}/functions/v1/song-link-event`;
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) TikTok";
  const r1 = await fetch(fn, { method: "POST", headers: { "Content-Type": "application/json", "x-song-link-ssr-key": key },
    body: JSON.stringify({ slug: "rs-tt", event: "arrival", event_id: eventId, ssr: true, prefetch: false, client_ua: ua }) });
  console.log("ssr", r1.status, await r1.text());
  const r2 = await fetch(fn, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.mundopropicio.com", "User-Agent": ua },
    body: JSON.stringify({ slug: "rs-tt", event: "arrival", event_id: eventId, opened: "app", destination: "spotify" }) });
  const b2 = await r2.json();
  console.log("browser", r2.status, JSON.stringify(b2), "event_id", eventId);
  if (r2.status !== 200 || b2.enriched !== true) throw new Error("não enriqueceu");
});
