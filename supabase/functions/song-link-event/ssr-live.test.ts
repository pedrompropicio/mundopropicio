// Explicit deployed SSR proof; reads the existing secret only from the test environment.
import "https://deno.land/std@0.224.0/dotenv/load.ts";

Deno.test("D-ERP234 deployed SSR without client_ip returns 200", async () => {
  const key = Deno.env.get("SONG_LINK_SSR_KEY");
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  if (!key || !url) throw new Error("SSR live proof blocked: existing secret or backend URL unavailable to test runner");
  const eventId = `derp234-no-ip-${crypto.randomUUID()}`;
  const response = await fetch(`${url}/functions/v1/song-link-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-song-link-ssr-key": key },
    body: JSON.stringify({ slug: "roupa-de-solteira", event: "arrival", event_id: eventId,
      ssr: true, prefetch: false, client_ua: "", page_url: "https://www.mundopropicio.com/m/roupa-de-solteira" }),
  });
  const body = await response.json();
  console.log(JSON.stringify({ event_id: eventId, status: response.status, body }));
  if (response.status !== 200 || body.ok !== true) throw new Error("SSR without client_ip did not return 200");
});