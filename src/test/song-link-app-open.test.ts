// AJ19/AJ14: testes herméticos do app_open, slots de entrega e dedup ViewContent.
// Sem rede, sem base de dados, sem credenciais: helpers puros + asserções de fonte.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_OPEN_ARRIVAL_MAX_AGE_MS,
  APP_OPEN_MAX_ELAPSED_MS,
  canonicalOpenId,
  destinationConfigured,
  isDuplicateArrival,
  isUuid,
  parseAppOpenBody,
  validateArrivalForAppOpen,
  VIEWCONTENT_DEDUP_WINDOW_MS,
} from "../../supabase/functions/song-link-event/app-open";

const ARRIVAL = "0f3b2a1c-1111-4222-8333-444455556666";
const SRC = readFileSync("supabase/functions/song-link-event/index.ts", "utf8");

const validBody = {
  event: "app_open",
  slug: "rs-meta",
  arrival_event_id: ARRIVAL,
  event_id: `${ARRIVAL}:open`,
  destination: "spotify",
  opened: "app",
  mode: "android_intent",
  elapsed_ms: 850,
};

describe("parseAppOpenBody", () => {
  it("aceita o corpo válido e deriva o event_id canónico", () => {
    const r = parseAppOpenBody(validBody);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.arrival_event_id).toBe(ARRIVAL);
      expect(r.value.event_id).toBe(`${ARRIVAL}:open`);
      expect(r.value.destination).toBe("spotify");
      expect(r.value.elapsed_ms).toBe(850);
    }
  });
  it("aceita event_id ausente (o servidor deriva o canónico)", () => {
    const { event_id, ...rest } = validBody;
    const r = parseAppOpenBody(rest);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.event_id).toBe(`${ARRIVAL}:open`);
  });
  it.each([
    [{}, "arrival_invalido"],
    [{ ...validBody, arrival_event_id: "nao-uuid" }, "arrival_invalido"],
    [{ ...validBody, destination: "" }, "destino_invalido"],
    [{ ...validBody, destination: undefined }, "destino_invalido"],
    [{ ...validBody, opened: "web" }, "opened_invalido"],
    [{ ...validBody, elapsed_ms: -1 }, "elapsed_invalido"],
    [{ ...validBody, elapsed_ms: APP_OPEN_MAX_ELAPSED_MS + 1 }, "elapsed_invalido"],
    [{ ...validBody, elapsed_ms: "abc" }, "elapsed_invalido"],
    [{ ...validBody, event_id: "outro-id" }, "event_id_invalido"],
  ])("rejeita payload inválido (%j → %s)", (body, error) => {
    const r = parseAppOpenBody(body as Record<string, unknown>);
    expect(r).toEqual({ ok: false, error });
  });
  it("aceita elapsed_ms no limite 0 e 6000", () => {
    expect(parseAppOpenBody({ ...validBody, elapsed_ms: 0 }).ok).toBe(true);
    expect(parseAppOpenBody({ ...validBody, elapsed_ms: 6000 }).ok).toBe(true);
  });
});

describe("destinationConfigured", () => {
  const destinations = { spotify: { app: "spotify:track:x", web: "https://open.spotify.com/track/x" } };
  it("aceita destino configurado", () => {
    expect(destinationConfigured(destinations, "spotify")).toBe(true);
  });
  it.each([null, undefined, [], "spotify", 42])("rejeita destinations inválido (%j)", (d) => {
    expect(destinationConfigured(d, "spotify")).toBe(false);
  });
  it("rejeita destino não configurado", () => {
    expect(destinationConfigured(destinations, "instagram")).toBe(false);
    expect(destinationConfigured(destinations, "apple_music")).toBe(false);
  });
});

describe("validateArrivalForAppOpen", () => {
  const now = Date.now();
  const ssrRecent = { origin: "ssr", created_at: new Date(now - 60_000).toISOString() };
  it("aceita chegada SSR recente", () => {
    expect(validateArrivalForAppOpen(ssrRecent, now)).toEqual({ ok: true });
  });
  it("rejeita chegada inexistente", () => {
    expect(validateArrivalForAppOpen(null, now)).toEqual({ ok: false, error: "chegada_invalida" });
  });
  it("rejeita chegada não-SSR (browser)", () => {
    expect(validateArrivalForAppOpen({ origin: "browser", created_at: ssrRecent.created_at }, now))
      .toEqual({ ok: false, error: "chegada_invalida" });
  });
  it("rejeita chegada futura", () => {
    expect(validateArrivalForAppOpen({ origin: "ssr", created_at: new Date(now + 60_000).toISOString() }, now))
      .toEqual({ ok: false, error: "chegada_invalida" });
  });
  it("rejeita chegada com mais de 2 h", () => {
    const old = new Date(now - APP_OPEN_ARRIVAL_MAX_AGE_MS - 1000).toISOString();
    expect(validateArrivalForAppOpen({ origin: "ssr", created_at: old }, now))
      .toEqual({ ok: false, error: "chegada_expirada" });
  });
  it("aceita chegada mesmo no limite de 2 h", () => {
    const edge = new Date(now - APP_OPEN_ARRIVAL_MAX_AGE_MS).toISOString();
    expect(validateArrivalForAppOpen({ origin: "ssr", created_at: edge }, now)).toEqual({ ok: true });
  });
});

describe("canonicalOpenId e isUuid", () => {
  it("ID canónico é arrival + ':open'", () => {
    expect(canonicalOpenId(ARRIVAL)).toBe(`${ARRIVAL}:open`);
  });
  it("isUuid valida o formato", () => {
    expect(isUuid(ARRIVAL)).toBe(true);
    expect(isUuid(ARRIVAL.toUpperCase())).toBe(true);
    expect(isUuid(`${ARRIVAL}:open`)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("isDuplicateArrival (dedup ViewContent, janela 30 min)", () => {
  const now = Date.now();
  it("duplicada dentro da janela (< 30 min)", () => {
    expect(isDuplicateArrival(new Date(now - 10_000).toISOString(), now)).toBe(true);
    expect(isDuplicateArrival(new Date(now - VIEWCONTENT_DEDUP_WINDOW_MS).toISOString(), now)).toBe(true);
  });
  it("não duplicada fora da janela (> 30 min)", () => {
    expect(isDuplicateArrival(new Date(now - VIEWCONTENT_DEDUP_WINDOW_MS - 1000).toISOString(), now)).toBe(false);
  });
  it("sem chegada anterior não é duplicada", () => {
    expect(isDuplicateArrival(null, now)).toBe(false);
  });
  it("data inválida ou futura não é duplicada", () => {
    expect(isDuplicateArrival("lixo", now)).toBe(false);
    expect(isDuplicateArrival(new Date(now + 60_000).toISOString(), now)).toBe(false);
  });
});

describe("index.ts — asserções de fonte (integração AJ19/AJ14)", () => {
  it("aceita app_open e mantém arrival/choice", () => {
    expect(SRC).toContain('event !== "arrival" && event !== "choice" && event !== "app_open"');
  });
  it("reserva atómica: upsert ignoreDuplicates na tabela de slots (= INSERT ON CONFLICT DO NOTHING RETURNING)", () => {
    expect(SRC).toContain('admin.from("song_link_delivery_slots")');
    expect(SRC).toContain('ignoreDuplicates: true');
    expect(SRC).toContain('onConflict: "arrival_event_id,provider,event_name"');
  });
  it("ListenClick Meta partilhado: choice com chegada e app_open usam o ID canónico ':open'", () => {
    expect(SRC).toContain('const metaSlot = (appOpen || (event === "choice" && choiceArrivalLinked)) ? "ListenClick" : null');
    expect(SRC).toContain("const metaEventId = metaSlot ? openId! : (eventId ?? undefined)");
  });
  it("TikTok: CompleteRegistration só no app_open; choice fica ClickButton", () => {
    expect(SRC).toContain('const ttSlot = appOpen ? "CompleteRegistration" : null');
    expect(SRC).toContain('appOpen ? "CompleteRegistration" : "ClickButton"');
  });
  it("slot perdido não entrega e marca 'slot_perdido'; resultado fecha o slot sem ID novo", () => {
    expect(SRC).toContain('capi_status = "slot_perdido"');
    expect(SRC).toContain('tiktok_status = "slot_perdido"');
    expect(SRC).toContain('finishSlot(admin, arrivalEventId!, "meta", metaSlot, r.ok ? "delivered" : "failed")');
    expect(SRC).toContain('finishSlot(admin, arrivalEventId!, "meta", metaSlot, "unknown")');
    expect(SRC).toContain('finishSlot(admin, arrivalEventId!, "tiktok", ttSlot, tiktok_status === "enviado" ? "delivered" : "failed")');
  });
  it("dedup ViewContent por fornecedor com marca 'duplicate' (chegada sempre gravada)", () => {
    expect(SRC).toContain('capi_status = "duplicate"');
    expect(SRC).toContain('tiktok_status = "duplicate"');
    expect(SRC).toContain('recentDuplicate(admin, link.id, "fbclid"');
    expect(SRC).toContain('recentDuplicate(admin, link.id, "ttclid"');
  });
  it("app_open: máximo 1 registo por chegada (23505 → 200 duplicate), chegada SSR obrigatória", () => {
    expect(SRC).toContain('insErr.code === "23505"');
    expect(SRC).toContain('delivery: "app_open_ja_registado"');
    expect(SRC).toContain('validateArrivalForAppOpen(arr, Date.now())');
    expect(SRC).toContain('destinationConfigured(link.destinations');
  });
  it("choice sem arrival_event_id mantém o comportamento atual (sem slot, ID próprio)", () => {
    // metaSlot só existe para app_open ou choice COM vínculo; choice legada usa eventId próprio.
    expect(SRC).toContain('event === "choice" && isUuid(body?.arrival_event_id) && destination');
    expect(SRC).toContain("const metaEventName = event === \"arrival\" ? \"ViewContent\" : \"ListenClick\"");
  });
  it("ViewContent da chegada única inalterado: nome e ID próprio", () => {
    expect(SRC).toContain('const metaEventName = event === "arrival" ? "ViewContent" : "ListenClick"');
    expect(SRC).toContain('const ttEventName = event === "arrival" ? "ViewContent"');
  });
});
