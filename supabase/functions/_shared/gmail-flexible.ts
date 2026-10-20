/**
 * #333 fase11f — pesquisa flexível de assunto no Gmail (só leitura, sem estado persistente).
 * A API Gmail (q = sintaxe da caixa de pesquisa) não documenta pesquisa aproximada nem fonética:
 * só palavras, "frase", OR / {} e AND. Por isso: recuperação LIMITADA de candidatos por consultas
 * fixas e construídas apenas com tokens [a-z0-9] (sem operadores do utilizador) + ranking local
 * explicável sobre o assunto normalizado. Fonética é heurística secundária para nomes PT.
 */

/** Conectores ignorados na comparação ("Henrique & Carlos" = "Henrique e Carlos"). */
const CONNECTORS = new Set(["e", "and", "y", "et", "de", "da", "do", "das", "dos", "the", "of", "a", "o", "em", "para", "com"]);
export const FLEX_MAX_TOKENS = 4;
export const FLEX_MAX_OR_TERMS = 12;

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " e ").replace(/[^a-z0-9]+/g, " ").trim();
}
export function subjectTokens(s: string): string[] {
  const all = normalizeText(s).split(" ").filter(Boolean);
  const sig = all.filter((t) => !CONNECTORS.has(t));
  return [...new Set(sig.length ? sig : all)];
}
/** Chave fonética cautelosa (PT): só para nomes/palavras ≥4 letras; nunca equivalência garantida. */
export function phoneticKey(t: string): string {
  if (t.length < 4 || /\d/.test(t)) return t;
  return t.replace(/^h/, "").replace(/ph/g, "f").replace(/ch|sh|x/g, "s").replace(/lh/g, "li").replace(/nh/g, "ni")
    .replace(/qu|q|k|c(?=[aou])/g, "c").replace(/c(?=[ei])|z|ss|ç/g, "s").replace(/w/g, "v").replace(/y/g, "i")
    .replace(/h/g, "").replace(/(.)\1+/g, "$1").replace(/[aeiou]+$/, "");
}
function editDistanceLE(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
const typoBudget = (t: string) => (t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0);

export type MatchKind = "exact" | "words" | "spacing" | "spelling" | "sound";
export const MATCH_LABEL: Record<MatchKind, string> = {
  exact: "Expressão exata",
  words: "Mesmas palavras (ordem, acentos ou ligação diferentes)",
  spacing: "Variação de espaços ou pontuação",
  spelling: "Variação do nome (pequena diferença de grafia)",
  sound: "Variação do nome (som parecido)",
};
const SCORE: Record<MatchKind, number> = { exact: 5, words: 4, spacing: 3, spelling: 2, sound: 1 };

/** Classifica o assunto face à pesquisa. null = não corresponde (descartado, nunca mostrado). */
export function classifySubject(query: string, subject: string): MatchKind | null {
  const q = normalizeText(query), s = normalizeText(subject);
  if (!q) return null;
  if ((" " + s + " ").includes(" " + q + " ")) {
    return subject.toLowerCase().includes(query.trim().toLowerCase()) ? "exact" : "words";
  }
  const qt = subjectTokens(query);
  const st = s.split(" ").filter(Boolean);
  const sset = new Set(st);
  if (qt.every((t) => sset.has(t))) return "words";
  const compactS = st.join("");
  if (qt.join("").length >= 4 && compactS.includes(qt.join(""))) return "spacing";
  // Cada token significativo tem de corresponder; tokens curtos (<5) só exatamente.
  let worst: MatchKind = "words";
  for (const t of qt) {
    if (sset.has(t) || (t.length >= 4 && compactS.includes(t) && st.some((w) => w.length > t.length && w.includes(t)))) {
      if (!sset.has(t) && SCORE[worst] > SCORE.spacing) worst = "spacing";
      continue;
    }
    const b = typoBudget(t);
    if (b > 0 && st.some((w) => editDistanceLE(t, w, b))) { if (SCORE[worst] > SCORE.spelling) worst = "spelling"; continue; }
    const k = phoneticKey(t);
    if (t.length >= 4 && k.length >= 3 && st.some((w) => w.length >= 4 && phoneticKey(w) === k)) { worst = "sound"; continue; }
    return null;
  }
  return worst;
}
export const matchScore = (k: MatchKind) => SCORE[k];

/** Consultas fixas (máx. 4), só tokens [a-z0-9]: nada do utilizador vira operador. */
export function flexibleSubjectQueries(subject: string): { label: string; q: string }[] {
  const tokens = subjectTokens(subject).slice(0, FLEX_MAX_TOKENS);
  if (!tokens.length) return [];
  const out: { label: string; q: string }[] = [];
  const phrase = normalizeText(subject);
  out.push({ label: "expressão", q: `subject:"${phrase}"` });
  if (tokens.length > 1) {
    out.push({ label: "todas as palavras, qualquer ordem", q: `subject:(${tokens.join(" ")})` });
    out.push({ label: "palavras juntas", q: `subject:${tokens.join("")}` });
  }
  // Recuperação ampla limitada: qualquer palavra relevante (≥3 letras) + variantes cautelosas.
  const terms = new Set<string>();
  for (const t of tokens.filter((x) => x.length >= 3)) {
    terms.add(t);
    if (t.length >= 4 && t.startsWith("h")) terms.add(t.slice(1));
    if (t.length >= 4 && !t.startsWith("h") && /^[aeiou]/.test(t)) terms.add("h" + t);
    const collapsed = t.replace(/(.)\1+/g, "$1"); if (collapsed !== t) terms.add(collapsed);
  }
  const list = [...terms].slice(0, FLEX_MAX_OR_TERMS);
  if (list.length) out.push({ label: "qualquer palavra relevante", q: `subject:{${list.join(" ")}}` });
  return out;
}
