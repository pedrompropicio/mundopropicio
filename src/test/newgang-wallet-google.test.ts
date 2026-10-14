import { describe, expect, it } from "vitest";
import * as GW from "../../supabase/functions/newgang-portal/wallet-google";

const ISS = "3388000000012345678";
const M = { id: "6a6ac03e-9333-49dc-bf4a-e0488bad7777", member_no: 42, first_name: "Ana", points: 650, level: "Elite", crew: "A Gang" };

describe("google wallet", () => {
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
  it("JWT savetowallet RS256 verificável (chave gerada no teste)", async () => {
    const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    let s = ""; for (const b of pk) s += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(s).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
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
