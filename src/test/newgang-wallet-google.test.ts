import { afterEach, describe, expect, it, vi } from "vitest";
import * as GW from "../../supabase/functions/newgang-portal/wallet-google";

const ISS = "3388000000012345678";
const M = { id: "6a6ac03e-9333-49dc-bf4a-e0488bad7777", member_no: 42, first_name: "Ana", points: 650, level: "Elite", crew: "A Gang" };

describe("google wallet", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("ids", () => {
    expect(GW.classId(ISS)).toBe(`${ISS}.newgang_clube_2027`);
    expect(GW.objectId(ISS, M.id)).toBe(`${ISS}.ngclub_6a6ac03e933349dcbf4ae0488bad7777`);
  });
  it("classe", () => {
    const c = GW.buildClass(ISS);
    expect(c).toMatchObject({ programName: "Clube Newgang", issuerName: "Newgang Festival", reviewStatus: "UNDER_REVIEW", hexBackgroundColor: "#0b1f14" });
    expect(c.linksModuleData.uris.map((u) => u.uri)).toContain("https://newgangfestival.pt/meu-clube");
  });
  it("objeto: pontos, nível, crew, evento, QR sem email", () => {
    const o = GW.buildObject(ISS, M);
    expect(o).toMatchObject({ state: "ACTIVE", accountId: "42", accountName: "Ana", classId: GW.classId(ISS) });
    expect(o.loyaltyPoints.balance.int).toBe(650);
    expect(o.secondaryLoyaltyPoints.balance.string).toBe("Elite");
    expect(o.barcode).toMatchObject({ type: "QR_CODE", value: "NG-42" });
    expect(o.textModulesData.map((t) => t.body)).toEqual(["A Gang", GW.EVENT_LINE]);
    expect(JSON.stringify(o)).not.toContain("@");
    expect(GW.buildObject(ISS, { ...M, crew: null }).textModulesData).toHaveLength(1);
  });
  it("needsPatch só com mudança", () => {
    expect(GW.needsPatch({ last_points: 650, last_level: "Elite" }, 650, "Elite")).toBe(false);
    expect(GW.needsPatch({ last_points: 600, last_level: "Elite" }, 650, "Elite")).toBe(true);
    expect(GW.needsPatch({ last_points: 650, last_level: "Gang" }, 650, "Elite")).toBe(true);
  });
  it.each([
    ["Gang", "hero-gang-v1.png", "#0b1f14"],
    ["Elite", "hero-elite-v1.png", "#170a2b"],
    ["Lenda", "hero-lenda-v1.png", "#050505"],
  ])("criativo de %s preserva pontos, nível e evento", (level, filename, color) => {
    const obj = GW.buildObject(ISS, { ...M, level }, { artworkReady: true });
    expect(decodeURIComponent(obj.heroImage?.sourceUri.uri ?? "")).toContain(`/newgang/wallet/${filename}`);
    expect(new URL(obj.heroImage?.sourceUri.uri ?? "").hostname).not.toContain(".invalid");
    expect(obj.hexBackgroundColor).toBe(color);
    expect(obj.loyaltyPoints.balance.int).toBe(M.points);
    expect(obj.secondaryLoyaltyPoints.balance.string).toBe(level);
    expect(obj.textModulesData.map((t) => t.body)).toContain(GW.EVENT_LINE);
  });
  it("logo quadrado mantém a classe e os links existentes", () => {
    const cls = GW.buildClass(ISS, { artworkReady: true });
    expect(cls.id).toBe(GW.classId(ISS));
    expect(cls.programLogo.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.logo);
    expect(cls.linksModuleData).toEqual(GW.buildClass(ISS).linksModuleData);
  });
  it("flag desligada preserva o cartão anterior; flag ativa aplica imagens públicas", () => {
    const obj = GW.buildObject(ISS, M, { artworkReady: false });
    expect(obj).not.toHaveProperty("heroImage");
    expect(obj).not.toHaveProperty("hexBackgroundColor");
    expect(GW.buildClass(ISS, { artworkReady: false }).programLogo.sourceUri.uri).toBe(GW.LOGO);
    expect(GW.WALLET_ARTWORK_READY).toBe(true);
    expect(GW.buildObject(ISS, M).heroImage?.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.Elite);
  });
  it("nível desconhecido usa Gang sem alterar o nível mostrado", () => {
    const obj = GW.buildObject(ISS, { ...M, level: "Novo" }, { artworkReady: true });
    expect(obj.heroImage?.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.Gang);
    expect(obj.hexBackgroundColor).toBe(GW.BG);
    expect(obj.secondaryLoyaltyPoints.balance.string).toBe("Novo");
  });
  it("mudança só de nível envia PATCH com hero, cor e pontos", async () => {
    expect(GW.needsPatch({ last_points: 650, last_level: "Gang" }, 650, "Elite")).toBe(true);
    const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pk))}\n-----END PRIVATE KEY-----`;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "fake-test-token", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await GW.patchObject({ client_email: "test@example.invalid", private_key: pem }, GW.buildObject(ISS, M, { artworkReady: true }));
    const patch = fetchMock.mock.calls.find((call) => (call as unknown[])[1] && ((call as unknown[])[1] as RequestInit).method === "PATCH") as unknown[] | undefined;
    expect(patch?.[0]).toBe(`${GW.WALLET_API}/loyaltyObject/${GW.objectId(ISS, M.id)}`);
    const body = JSON.parse(String((patch?.[1] as RequestInit | undefined)?.body));
    expect(body.heroImage.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.Elite);
    expect(body.hexBackgroundColor).toBe("#170a2b");
    expect(body.loyaltyPoints.balance.int).toBe(650);
    expect(body.secondaryLoyaltyPoints.balance.string).toBe("Elite");
    expect(body).not.toHaveProperty("classId");
    fetchMock.mockClear();
    await GW.patchClassLogo({ client_email: "test@example.invalid", private_key: pem }, ISS);
    const classCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(classCall?.[0]).toBe(`${GW.WALLET_API}/loyaltyClass/${GW.classId(ISS)}`);
    expect((classCall?.[1] as RequestInit | undefined)?.method).toBe("PATCH");
    expect(JSON.parse(String((classCall?.[1] as RequestInit | undefined)?.body))).toEqual({ programLogo: GW.buildClass(ISS).programLogo, reviewStatus: "UNDER_REVIEW" });
  });
  it("JWT savetowallet RS256 verificável (chave gerada no teste)", async () => {
    const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    let s = ""; for (const b of pk) s += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${(btoa(s).match(/.{1,64}/g) ?? []).join("\n")}\n-----END PRIVATE KEY-----\n`;
    const key = await GW.importPrivateKey(pem);
    const claims = GW.saveClaims("sa@x.iam.gserviceaccount.com", GW.objectId(ISS, M.id), 1000);
    const jwt = await GW.signJwt(claims, key);
    const [h, b, sig] = jwt.split(".");
    const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, "+").replace(/_/g, "/")));
    expect(dec(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(dec(b)).toMatchObject({ aud: "google", typ: "savetowallet", origins: GW.ORIGINS, payload: { loyaltyObjects: [{ id: GW.objectId(ISS, M.id) }] } });
    const raw = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (sig.length % 4)) % 4)), (c) => c.charCodeAt(0));
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kp.publicKey, raw, new TextEncoder().encode(`${h}.${b}`))).toBe(true);
    expect(GW.saveUrl(jwt)).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
  });
});
