// Match determinístico — escolhe, no catálogo de meta_custom_audiences, a
// audiência de COMPRADORES do EVENTO da estratégia, para excluir em adsets
// de conversão (issue #21 #4, alavanca B).
//
// REGRA DE OURO: ambiguidade (top vs runner-up < 20 pontos) OU nenhuma forte
// → devolve null (não adivinha). Pior aplicar a menos do que excluir a
// audiência errada e cortar tráfego válido.
//
// Testes unitários: ./purchase-audience-match.test.ts

export interface CatalogAudience {
  audience_id_meta: string;
  name: string;
}

export interface MatchInput {
  catalog: CatalogAudience[];
  eventName: string | null | undefined;
  eventSlug: string | null | undefined;
}

export interface MatchDecisionMatched {
  status: "matched";
  audience_id_meta: string;
  audience_name: string;
  score: number;
  runner_up_score: number;
  margin: number;
}
export interface MatchDecisionAmbiguous {
  status: "ambiguous";
  candidates: Array<{ audience_id_meta: string; name: string; score: number }>;
  reason: string;
}
export interface MatchDecisionNone {
  status: "none";
  reason: string;
  candidates_inspected: number;
}
export type MatchDecision =
  | MatchDecisionMatched
  | MatchDecisionAmbiguous
  | MatchDecisionNone;

// Margem mínima entre top e runner-up para desempate (afinação Pedro: 20).
const TIE_MARGIN = 20;

const PURCHASE_TOKENS = ["purchase", "compra", "compras"];
const NEGATIVE_HINTS = [
  "viewcontent",
  "view content",
  "addtocart",
  "add to cart",
  "atc",
  "lookalike",
  "lal",
  "exclud",
  "engaj",
  "engaged",
  "video",
  "initiate",
  "ic ",
];

const STOPWORDS = new Set([
  "site",
  "compra",
  "compras",
  "purchase",
  "purchasers",
  "purchases",
  "novo",
  "new",
  "180d",
  "90d",
  "30d",
  "60d",
  "14d",
  "7d",
  "180",
  "90",
  "30",
  "60",
  "all",
  "time",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "the",
  "and",
  "ou",
  "em",
  "no",
  "na",
  "view",
  "content",
  "tickets",
  "tix",
]);

export function normalize(input: string): string {
  return (input ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[\[\]\-_/().,:;!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const re = new RegExp(`(^|\\W)${needle}(\\W|$)`);
  return re.test(haystack);
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function extractWindowDays(n: string): number {
  // ex.: "180d", "90 d", "180 dias"
  const m = n.match(/(\d{1,3})\s*d(ias)?\b/);
  return m ? Math.min(parseInt(m[1], 10), 365) : 0;
}

export interface ScoreResult {
  score: number;
  window_days: number;
  hasNegative: boolean;
  reason?: string;
}

export function scoreCandidate(
  audName: string,
  eventName: string | null | undefined,
  eventSlug: string | null | undefined,
): ScoreResult {
  const n = normalize(audName);
  const ev = normalize(eventName ?? "");
  const sl = normalize(eventSlug ?? "");

  // GATE 1 — tem de ter token de PURCHASE como palavra inteira
  const hasPurchase = PURCHASE_TOKENS.some((t) => wholeWord(n, t));
  if (!hasPurchase) return { score: 0, window_days: 0, hasNegative: false, reason: "no_purchase_token" };

  // GATE 2 — correspondência forte com o evento (por nome OU slug)
  const evTokens = tokens(ev);
  const slCompact = sl.replace(/\s+/g, "");
  const nCompact = n.replace(/\s+/g, "");

  const evMatch = evTokens.length >= 2 && evTokens.every((t) => n.includes(t));
  const slMatch = slCompact.length >= 6 && nCompact.includes(slCompact);

  if (!(evMatch || slMatch)) {
    return { score: 0, window_days: 0, hasNegative: false, reason: "event_not_matched" };
  }

  // Pontuação base
  let score = 100;
  const hasNegative = NEGATIVE_HINTS.some((tok) => n.includes(tok));
  if (hasNegative) score -= 30;

  const window = extractWindowDays(n);
  score += window / 10; // 180D → +18; 30D → +3

  if (n.includes("novo") || n.includes(" new ") || n.endsWith(" new")) score += 5;

  return { score, window_days: window, hasNegative };
}

export function resolvePurchaseAudience(input: MatchInput): MatchDecision {
  const { catalog, eventName, eventSlug } = input;

  if (!catalog || catalog.length === 0) {
    return { status: "none", reason: "empty_catalog", candidates_inspected: 0 };
  }
  if (!eventName && !eventSlug) {
    return { status: "none", reason: "no_event_identifier", candidates_inspected: catalog.length };
  }

  const scored = catalog
    .map((a) => ({ a, ...scoreCandidate(a.name, eventName, eventSlug) }))
    .filter((c) => c.score > 0)
    .sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      // desempate determinístico final: por audience_id mais recente (string desc)
      return String(y.a.audience_id_meta).localeCompare(String(x.a.audience_id_meta));
    });

  if (scored.length === 0) {
    return { status: "none", reason: "no_candidate_passed_gates", candidates_inspected: catalog.length };
  }

  const top = scored[0];
  const runnerUp = scored[1];
  const runnerUpScore = runnerUp?.score ?? 0;
  const margin = top.score - runnerUpScore;

  if (runnerUp && margin < TIE_MARGIN) {
    return {
      status: "ambiguous",
      reason: `top_runner_up_margin_${margin}_lt_${TIE_MARGIN}`,
      candidates: scored.slice(0, 5).map((c) => ({
        audience_id_meta: c.a.audience_id_meta,
        name: c.a.name,
        score: Math.round(c.score * 100) / 100,
      })),
    };
  }

  return {
    status: "matched",
    audience_id_meta: top.a.audience_id_meta,
    audience_name: top.a.name,
    score: Math.round(top.score * 100) / 100,
    runner_up_score: Math.round(runnerUpScore * 100) / 100,
    margin: Math.round(margin * 100) / 100,
  };
}
