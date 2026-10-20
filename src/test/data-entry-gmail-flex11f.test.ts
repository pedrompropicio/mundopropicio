import { describe, expect, it, vi } from "vitest";
vi.mock("npm:zod@3", async () => import("zod"));
import { gmailReadOnly, gmailFilterSchema, FLEX_MAX_CANDIDATES, GmailUnavailable } from "../../supabase/functions/_shared/gmail-readonly";
import { classifySubject, flexibleSubjectQueries, subjectTokens } from "../../supabase/functions/_shared/gmail-flexible";

// Caixa sintética (sem emails reais). Simula a pesquisa Gmail: palavras separadas por não-letras, sem fuzzy.
type Mail = { id: string; subject: string; ms: number };
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function fakeGmail(mail: Mail[]) {
  const calls: { path: string; q: URLSearchParams }[] = [];
  const matches = (clause: string, subj: string) => {
    const w = words(subj);
    let m: RegExpMatchArray | null;
    if ((m = clause.match(/^subject:"(.*)"$/))) { const p = words(m[1]); return w.some((_, i) => p.every((x, j) => w[i + j] === x)); }
    if ((m = clause.match(/^subject:\((.*)\)$/))) return words(m[1]).every((x) => w.includes(x));
    if ((m = clause.match(/^subject:\{(.*)\}$/))) return words(m[1]).some((x) => w.includes(x));
    if ((m = clause.match(/^subject:(\S+)$/))) return w.includes(m[1]);
    return true;
  };
  const transport = vi.fn(async (path: string, q: URLSearchParams) => {
    calls.push({ path, q });
    if (path === "/users/me/messages") {
      const query = q.get("q") ?? "";
      const clause = query.slice(query.indexOf("subject:"));
      const hits = mail.filter((x) => query.includes("subject:") ? matches(clause, x.subject) : true);
      const max = Number(q.get("maxResults"));
      return Response.json({ messages: hits.slice(0, max).map((x) => ({ id: x.id })), ...(hits.length > max ? { nextPageToken: "12345" } : {}) });
    }
    const id = path.split("/").pop();
    const x = mail.find((m) => m.id === id)!;
    return Response.json({ id: x.id, internalDate: String(x.ms), payload: { headers: [{ name: "Subject", value: x.subject }, { name: "From", value: "Agência <a@exemplo.invalid>" }] } });
  });
  return { reader: gmailReadOnly(transport), calls };
}
const base = { from_date: "2026-10-01", to_date: "2026-10-19", sender: "exemplo.invalid", page_size: 10, attachments_only: false };
const MAIL: Mail[] = [
  { id: "msgEXACT01", subject: "Henrique & Carlos — contrato", ms: 1000 },
  { id: "msgGLUED02", subject: "Henrique&Carlos rider", ms: 3000 },
  { id: "msgCONJ003", subject: "Henrique e Carlos — datas", ms: 2000 },
  { id: "msgORDER04", subject: "Carlos and Henrique: técnica", ms: 4000 },
  { id: "msgTYPO005", subject: "Henrqiue e Carlos orçamento", ms: 5000 },
  { id: "msgJOIN006", subject: "HenriqueCarlos hotel", ms: 6000 },
  { id: "msgONLY007", subject: "Henrique Pereira", ms: 7000 },
  { id: "msgOTHER08", subject: "Carlos Sousa fatura", ms: 8000 },
];

describe("#333 fase11f pesquisa flexível (puro)", () => {
  it("normaliza conectores e acentos; tokens só [a-z0-9]", () => {
    expect(subjectTokens("Henrique & Carlos")).toEqual(["henrique", "carlos"]);
    expect(subjectTokens("Henrique e Carlos")).toEqual(["henrique", "carlos"]);
    expect(subjectTokens('Fatura") OR (from:x')).toEqual(["fatura", "or", "from", "x"]);
  });
  it("classifica de forma explicável e recusa falsos positivos", () => {
    expect(classifySubject("Henrique & Carlos", "Henrique & Carlos — contrato")).toBe("exact");
    expect(classifySubject("Henrique & Carlos", "Henrique e Carlos")).toBe("words");
    expect(classifySubject("Henrique & Carlos", "Carlos and Henrique")).toBe("words");
    expect(classifySubject("Henrique & Carlos", "HenriqueCarlos hotel")).toBe("spacing");
    expect(classifySubject("Henrique & Carlos", "Henrqiue e Carlos")).toBe("spelling");
    expect(classifySubject("Henrique & Carlos", "Enrike e Carlos")).toBe("sound");
    expect(classifySubject("Henrique & Carlos", "Henrique Pereira")).toBeNull();
    expect(classifySubject("Henrique & Carlos", "Carlos Sousa")).toBeNull();
  });
  it("tokens curtos não aceitam erro de grafia", () => {
    expect(classifySubject("Bolt", "Volt Lisboa")).toBeNull();
    expect(classifySubject("TAP", "TAB voo")).toBeNull();
  });
  it("consultas fixas e limitadas, sem operadores do utilizador", () => {
    const qs = flexibleSubjectQueries('a b c d e f g h "x" OR (from:evil)');
    expect(qs.length).toBeLessThanOrEqual(4);
    for (const { q } of qs) expect(q).not.toMatch(/from:|OR|\)\s*\(|:evil/);
  });
});

describe("#333 fase11f pesquisa flexível (adapter)", () => {
  it("recupera variantes além da frase exata, mantém período/remetente e ordena exatos primeiro", async () => {
    const { reader, calls } = fakeGmail(MAIL);
    const r = await reader.search(gmailFilterSchema.parse({ ...base, subject: "Henrique & Carlos" }));
    const ids = r.messages.map((m) => m.message_id);
    expect(ids[0]).toBe("msgEXACT01");
    expect(new Set(ids)).toEqual(new Set(["msgEXACT01", "msgGLUED02", "msgCONJ003", "msgORDER04", "msgTYPO005", "msgJOIN006"]));
    expect(ids).not.toContain("msgONLY007");
    expect(r.messages.find((m) => m.message_id === "msgTYPO005")?.match?.label).toMatch(/Variação do nome/);
    const lists = calls.filter((c) => c.path === "/users/me/messages");
    expect(lists.length).toBeLessThanOrEqual(4);
    for (const l of lists) expect(l.q.get("q")).toMatch(/^after:2026\/10\/01 before:2026\/10\/20 from:exemplo\.invalid subject:/);
    expect(r.search_info).toMatchObject({ mode: "flexible", coverage_complete: true, candidates: 6 });
    expect(calls.every((c) => !/send|trash|modify|delete/.test(c.path))).toBe(true);
  });
  it("modo exato preserva o comportamento anterior (uma consulta com a expressão)", async () => {
    const { reader, calls } = fakeGmail(MAIL);
    const r = await reader.search(gmailFilterSchema.parse({ ...base, subject: "Henrique & Carlos", match: "exact" }));
    expect(calls.filter((c) => c.path === "/users/me/messages")).toHaveLength(1);
    expect(r.search_info?.mode).toBe("exact");
  });
  it("paginação estável sobre a lista ordenada inteira, sem duplicados", async () => {
    const many: Mail[] = Array.from({ length: 25 }, (_, i) => ({ id: `msgPAGE${String(i).padStart(3, "0")}`, subject: i % 2 ? "Henrique e Carlos" : "Henrique & Carlos", ms: i }));
    const { reader } = fakeGmail(many);
    const f = gmailFilterSchema.parse({ ...base, subject: "Henrique & Carlos" });
    const seen: string[] = []; let token: string | null | undefined;
    do {
      const r = await reader.search({ ...f, ...(token ? { page_token: token } : {}) });
      seen.push(...r.messages.map((m) => m.message_id)); token = r.next_page_token;
    } while (token);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen.slice(0, 13).every((id) => Number(id.slice(7)) % 2 === 0)).toBe(true); // exatos primeiro
  });
  it("sinaliza cobertura incompleta quando o limite de candidatos é atingido", async () => {
    const many: Mail[] = Array.from({ length: FLEX_MAX_CANDIDATES + 30 }, (_, i) => ({ id: `msgCAP${String(i).padStart(4, "0")}`, subject: "Henrique Carlos", ms: i }));
    const { reader, calls } = fakeGmail(many);
    const r = await reader.search(gmailFilterSchema.parse({ ...base, subject: "Henrique Carlos" }));
    expect(r.search_info?.coverage_complete).toBe(false);
    expect(r.search_info?.note).toMatch(/podem existir mais/);
    expect(calls.length).toBeLessThanOrEqual(4 + FLEX_MAX_CANDIDATES + 10);
  });
  it("token de página inválido é recusado", async () => {
    const { reader } = fakeGmail(MAIL);
    await expect(reader.search(gmailFilterSchema.parse({ ...base, subject: "Henrique", page_token: "fXYZ" }))).rejects.toBeInstanceOf(GmailUnavailable);
  });
});
