/**
 * Heurística leve para sugerir "IVA não dedutível" (Art.º 21 CIVA).
 *
 * NÃO é determinística — apenas faz match a palavras-chave no nome do
 * fornecedor e/ou descrição da transação para destacar visualmente o
 * botão "Aplicar IVA médio". A decisão final é sempre do utilizador.
 *
 * Casos típicos do Art.º 21 CIVA (IVA não dedutível, exceto exceções):
 *  - Despesas de representação / camarim
 *  - Alojamento, alimentação e bebidas
 *  - Combustíveis e portagens (viaturas ligeiras de passageiros)
 *  - Transportes de pessoas (táxis, TVDE)
 *  - Tabaco
 */

const KEYWORDS: { tag: string; words: string[] }[] = [
  {
    tag: "alojamento",
    words: ["hotel", "hostel", "alojamento", "estadia", "pousada", "guesthouse", "airbnb", "booking"],
  },
  {
    tag: "alimentação",
    words: [
      "restaurante", "restauração", "café", "cafetaria", "snack", "bar ",
      "tasca", "pizzaria", "pastelaria", "padaria", "marisqueira", "churrascaria",
      "take away", "take-away", "ubereats", "uber eats", "glovo", "bolt food",
    ],
  },
  {
    tag: "transporte de pessoas",
    words: ["táxi", "taxi", "uber", "bolt", "tvde", "cabify", "free now", "freenow"],
  },
  {
    tag: "viatura ligeira",
    words: [
      "combustível", "combustivel", "gasóleo", "gasoleo", "gasolina",
      "galp", "bp ", "repsol", "cepsa", "prio ", "shell",
      "portagem", "via verde", "brisa",
      "estacionamento", "parque ", "saba ", "empark",
    ],
  },
  {
    tag: "representação / camarim",
    words: ["camarim", "representação", "representacao", "florista", "flores ", "rebuçado"],
  },
  { tag: "tabaco", words: ["tabacaria", "tabaco", "cigarro"] },
];

export interface NonDeductibleHint {
  /** True se a heurística sugere despesa potencialmente sem dedução de IVA. */
  suggested: boolean;
  /** Categoria/tag que disparou a sugestão (para mostrar ao utilizador). */
  reason?: string;
  /** Termo concreto detetado (para transparência). */
  matchedTerm?: string;
}

export function detectNonDeductibleHint(
  ...sources: Array<string | null | undefined>
): NonDeductibleHint {
  const haystack = sources
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" \n ")
    .toLowerCase();

  if (!haystack.trim()) return { suggested: false };

  for (const { tag, words } of KEYWORDS) {
    for (const w of words) {
      if (haystack.includes(w)) {
        return { suggested: true, reason: tag, matchedTerm: w.trim() };
      }
    }
  }
  return { suggested: false };
}
