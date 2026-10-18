import { describe, expect, it, vi } from "vitest";
import { createHandler } from "../../supabase/functions/portal-track/handler";

const arrival = "95b8aa49-b6b7-4b2e-aee1-21b902b68ec4";
function harness() {
  const transport = vi.fn(async () => new Response(null, { status: 201 }));
  const geo = vi.fn();
  const handler = createHandler({ fetch: transport as typeof fetch, env: () => "fixture", lookupIpGeo: geo, isPrivateOrInvalid: () => false });
  const send = (payload: object, origin = "https://mundopropicio.com", kind = "diag") => handler(new Request("https://fixture.invalid", {
    method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: JSON.stringify({ kind, consent: true, payload }),
  }));
  return { transport, geo, send };
}

describe("portal-track diagnostic kinds", () => {
  it.each(["shown", "tap_button", "tap_other", "hidden", "visible", "pagehide", "redirect", "prefetch", "feedback_shown", "tap_repeat_blocked"])("persists %s with the diagnostic envelope", async kind => {
    const h = harness();
    expect((await h.send({ kind, slug: "teste_chat2", ms: 123, in_app: "instagram", detail: "x".repeat(70), arrival_event_id: arrival })).status).toBe(200);
    expect(h.transport).toHaveBeenCalledTimes(1);
    const [url, options] = h.transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("fixture/rest/v1/song_link_diag");
    expect(JSON.parse(String(options.body))).toEqual({ kind, slug: "teste_chat2", ms: 123, in_app: "instagram", detail: "x".repeat(60), arrival_event_id: arrival });
    expect(h.geo).not.toHaveBeenCalled();
  });
  it.each([{ kind: "unknown", slug: "test" }, { kind: "feedback_shown", slug: "" }, { kind: "feedback_shown", slug: "test", ms: -1 }, { kind: "feedback_shown", slug: "test", ms: 86400001 }, { kind: "feedback_shown", slug: "test", in_app: "ios" }, { kind: "feedback_shown", slug: "test", arrival_event_id: "invalid" }])("rejects invalid diagnostic input %j", async payload => {
    const h = harness();
    expect((await h.send(payload)).status).toBe(400);
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("rejects an unapproved origin without writing", async () => {
    const h = harness();
    expect((await h.send({ kind: "feedback_shown", slug: "test" }, "https://unapproved.invalid")).status).toBe(403);
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("accepts the song_link_diag envelope", async () => {
    const h = harness();
    expect((await h.send({ kind: "tap_repeat_blocked", slug: "test" }, undefined, "song_link_diag")).status).toBe(200);
  });
});