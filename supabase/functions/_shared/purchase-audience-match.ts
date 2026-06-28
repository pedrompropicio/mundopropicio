// Match determinístico — escolhe, no catálogo de meta_custom_audiences, a
// audiência de COMPRADORES do EVENTO da estratégia, para excluir em adsets
// de conversão (issue #21 #4, alavanca B).
//
// HIERARQUIA (Peça 2 — ligação determinística audiência↔evento):
//   NÍVEL 1 — matched_primary       : event_id=E + is_primary_purchase=true (única por construção)
//   NÍVEL 2 — matched_linked        : event_id=E, sem principal; desempate por total_records_meta desc
//             ambiguous_linked      : empate no topo de total_records_meta entre ≥2 ligadas
//   NÍVEL 3 — suggested_by_name     : nenhuma ligada; match por nome (gates+score) resolve sem ambiguidade
//             ambiguous_by_name     : nenhuma ligada; match por nome ambíguo (margem<20)
//             none                  : nenhuma ligada e nenhuma candidata por nome
//
// REGRA DE OURO: o caller (strategy-deploy) só deve EXCLUIR AUTOMATICAMENTE
// para matched_primary / matched_linked. suggested_by_name é só sugestão para UI.
//
// Testes unitários: ./purchase-audience-match.test.ts

export interface CatalogAudience {
  audience_id_meta: string;
  name: string;
  event_id?: string | null;
  is_primary_purchase?: boolean | null;
  total_records_meta?: number | null;
}

export interface MatchInput {
  catalog: CatalogAudience[];
  eventId: string | null | undefined;
  eventName: string | null | undefined;
  eventSlug: string | null | undefined;
}

// NÍVEL 1
export interface MatchDecisionMatchedPrimary {
  status: "matched_primary";
  audience_id_meta: string;
  audience_name: string;
  event_id: string;
}
// NÍVEL 2
export interface MatchDecisionMatchedLinked {
  status: "matched_linked";
  audience_id_meta: string;
  audience_name: string;
  event_id: string;
  total_records_meta: number;
  linked_count: number;
}
export interface MatchDecisionAmbiguousLinked {
  status: "ambiguous_linked";
  event_id: string;
  reason: string;
  candidates: Array<{ audience_id_meta: string; name: string; total_records_meta: number }>;
}
// NÍVEL 3
export interface MatchDecisionSuggestedByName {
  status: "suggested_by_name";
  audience_id_meta: string;
  audience_name: string;
  score: number;
  runner_up_score: number;
  margin: number;
  candidates: Array<{ audience_id_meta: string; name: string; score: number; total_records_meta: number }>;
}
export interface MatchDecisionAmbiguousByName {
  status: "ambiguous_by_name";
  reason: string;
  candidates: Array<{ audience_id_meta: string; name: string; score: number; total_records_meta: number }>;
}
export interface MatchDecisionNone {
  status: "none";
  reason: string;
  candidates_inspected: number;
}
export type MatchDecision =
  | MatchDecisionMatchedPrimary
  | MatchDecisionMatchedLinked
  | MatchDecisionAmbiguousLinked
  | MatchDecisionSuggestedByName
  | MatchDecisionAmbiguousByName
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
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^(19|20)\d{2}$/.test(t));
}

function extractWindowDays(n: string): number {
  // ex.: "180d", "90 d", "180 dias"
  const m = n.match(/(\d{1,3})\s*d(ias)?\b/);
  return m ? Math.min(parseInt(m[1], 10), 365) : 0;
}

function records(a: CatalogAudience): number {
  const v = a?.total_records_meta;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export interface ScoreResult {
  score: number;
  window_days: number;
  hasNegative: boolean;
  reason?: string;
}

// Peça 2: REMOVIDO o bónus "(Novo)" +20. Desempate por total_records_meta
// passa a ser feito no resolvePurchaseAudience (não na pontuação).
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

  // NOTA Peça 2: bónus "(Novo)" +20 REMOVIDO. Desempate por total_records_meta.
  return { score, window_days: window, hasNegative };
}

export function resolvePurchaseAudience(input: MatchInput): MatchDecision {
  const { catalog, eventId, eventName, eventSlug } = input;

  if (!catalog || catalog.length === 0) {
    return { status: "none", reason: "empty_catalog", candidates_inspected: 0 };
  }

  // ── NÍVEIS 1 e 2 — DETERMINÍSTICOS via event_id ─────────────────────────
  if (eventId) {
    const linked = catalog.filter((a) => a?.event_id && String(a.event_id) === String(eventId));
    if (linked.length > 0) {
      // NÍVEL 1 — principal explícita (única por construção: índice parcial)
      const primaries = linked.filter((a) => a.is_primary_purchase === true);
      if (primaries.length >= 1) {
        const p = primaries[0];
        return {
          status: "matched_primary",
          audience_id_meta: String(p.audience_id_meta),
          audience_name: String(p.name),
          event_id: String(eventId),
        };
      }
      // NÍVEL 2 — ligadas sem principal: desempate por total_records_meta desc
      const sorted = [...linked].sort((x, y) => {
        const rx = records(x); const ry = records(y);
        if (ry !== rx) return ry - rx;
        return String(y.audience_id_meta).localeCompare(String(x.audience_id_meta));
      });
      const top = sorted[0];
      const runnerUp = sorted[1];
      if (runnerUp && records(top) === records(runnerUp)) {
        return {
          status: "ambiguous_linked",
          event_id: String(eventId),
          reason: `tie_on_total_records_meta=${records(top)}`,
          candidates: sorted.slice(0, 5).map((c) => ({
            audience_id_meta: String(c.audience_id_meta),
            name: String(c.name),
            total_records_meta: records(c),
          })),
        };
      }
      return {
        status: "matched_linked",
        audience_id_meta: String(top.audience_id_meta),
        audience_name: String(top.name),
        event_id: String(eventId),
        total_records_meta: records(top),
        linked_count: linked.length,
      };
    }
    // não há ligadas → cai para NÍVEL 3
  }

  // ── NÍVEL 3 — FALLBACK por nome (SUGESTÃO; caller NÃO deve excluir) ─────
  if (!eventName && !eventSlug) {
    return { status: "none", reason: "no_event_identifier", candidates_inspected: catalog.length };
  }

  const scored = catalog
    .map((a) => ({ a, ...scoreCandidate(a.name, eventName, eventSlug) }))
    .filter((c) => c.score > 0)
    .sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      // Peça 2: desempate por total_records_meta desc (substitui o bónus "(Novo)")
      const rx = records(x.a); const ry = records(y.a);
      if (ry !== rx) return ry - rx;
      return String(y.a.audience_id_meta).localeCompare(String(x.a.audience_id_meta));
    });

  if (scored.length === 0) {
    return { status: "none", reason: "no_candidate_passed_gates", candidates_inspected: catalog.length };
  }

  const top = scored[0];
  const runnerUp = scored[1];
  const runnerUpScore = runnerUp?.score ?? 0;
  const margin = top.score - runnerUpScore;
  const candidates = scored.slice(0, 5).map((c) => ({
    audience_id_meta: String(c.a.audience_id_meta),
    name: String(c.a.name),
    score: Math.round(c.score * 100) / 100,
    total_records_meta: records(c.a),
  }));

  if (runnerUp && margin < TIE_MARGIN) {
    // Empate por score: se um tem mais registos, desempata; senão, ambíguo.
    if (records(top.a) !== records(runnerUp.a)) {
      return {
        status: "suggested_by_name",
        audience_id_meta: String(top.a.audience_id_meta),
        audience_name: String(top.a.name),
        score: Math.round(top.score * 100) / 100,
        runner_up_score: Math.round(runnerUpScore * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        candidates,
      };
    }
    return {
      status: "ambiguous_by_name",
      reason: `top_runner_up_margin_${margin}_lt_${TIE_MARGIN}_and_equal_records`,
      candidates,
    };
  }

  return {
    status: "suggested_by_name",
    audience_id_meta: String(top.a.audience_id_meta),
    audience_name: String(top.a.name),
    score: Math.round(top.score * 100) / 100,
    runner_up_score: Math.round(runnerUpScore * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    candidates,
  };
}
