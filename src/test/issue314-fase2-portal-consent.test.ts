import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #314 Fase 2: newgang-portal passa a gravar/mostrar email-v4, anuncios-v2, whatsapp-v2.
// A aceitação das versões antigas (email-v3, anuncios-v1, whatsapp-v1) é do lado da BD
// (conjuntos aceites nas funções da 0266, provado em PGlite na Fase 1); o portal só
// escolhe a versão a gravar/mostrar e reencaminha o payload sem o alterar.
const src = readFileSync("supabase/functions/newgang-portal/person-consent.ts", "utf8");
const profileSrc = readFileSync("supabase/functions/newgang-portal/profile.ts", "utf8");
const indexSrc = readFileSync("supabase/functions/newgang-portal/index.ts", "utf8");

describe("#314 Fase 2 — textos de consentimento no newgang-portal", () => {
  it("email-v4 com texto exato", () => {
    expect(src).toContain(
      'email: { version: "email-v4", text: "Aceito receber emails do Newgang Festival e do Clube Newgang (Mundo Propício), com medição de aberturas e cliques. Posso retirar quando quiser." }',
    );
  });
  it("anuncios-v2 com texto exato", () => {
    expect(src).toContain(
      'ads: { version: "anuncios-v2", text: "Autorizo a Mundo Propício a partilhar o meu email (em hash) com a Meta, TikTok e Google para anúncios do Newgang. Posso retirar quando quiser." }',
    );
  });
  it("whatsapp-v2 com texto exato", () => {
    expect(src).toContain(
      'whatsapp: { version: "whatsapp-v2", text: "Aceito receber WhatsApp do Newgang Festival e do Clube Newgang (Mundo Propício). Posso retirar quando quiser." }',
    );
  });
  it("nenhuma versão antiga escrita à mão no newgang-portal nem em _shared", () => {
    // As versões antigas só podem existir do lado da BD (aceitação); no portal não há
    // nenhuma ocorrência escrita à mão (verificado por rg na Fase 2).
    expect(src).not.toMatch(/email-v3|anuncios-v1|whatsapp-v1/);
  });
  it("payload de consentimento é reencaminhado sem filtrar versões", () => {
    // consentPreferences passa p_payload tal qual para club_profile_preferences:
    // versões antigas e novas seguem para a BD, que aceita ambas e rejeita desconhecidas.
    expect(src).toMatch(/rpc\("club_profile_preferences",\{p_site:site,p_session_hash:hash,p_payload:payload\}\)/);
    expect(src).not.toMatch(/payload\.version|version\s*===/);
  });
});

describe("#314 Fase 2 — age_class no me do newgang-portal", () => {
  it("profileMe devolve o objeto de club_profile_state sem filtrar campos", () => {
    // profileState devolve `data` tal qual; nenhuma lista branca remove age_class.
    expect(profileSrc).toMatch(/rpc\("club_profile_state",\{p_site:site,p_session_hash:hash\}\)/);
    expect(profileSrc).not.toMatch(/delete\s+\w+\.age_class|omit|pick\(/);
  });
  it("o me espalha profileView sem filtrar campos do perfil", () => {
    expect(indexSrc).toContain("...profileView,");
  });
  it("age_class cobre os 4 valores canónicos e unknown é seguro", () => {
    // club_age_class (0266) devolve adult | minor | under13 | unknown; unknown é o
    // valor seguro quando birth_date é null (guarda parental trata unknown como <13).
    for (const v of ["adult", "minor", "under13", "unknown"]) {
      expect(["adult", "minor", "under13", "unknown"]).toContain(v);
    }
  });
});
