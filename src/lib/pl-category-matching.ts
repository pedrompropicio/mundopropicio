import { compareHierarchicalCodes } from "@/lib/utils";

export interface ExpenseCategoryLite {
  id: string;
  name: string;
  code: string;
  type: string;
  parent_id?: string | null;
}

export interface CategoryMatchInput {
  description: string;
  specification?: string | null;
}

const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "sem",
  "the", "and", "evento", "show", "servico", "servicos", "serviço", "serviços",
  "fornecedor", "producao", "producoes", "produção", "produções",
]);

const CATEGORY_CODE_SYNONYMS: Record<string, string[]> = {
  // 2.1 - Artistas e Talentos
  "2.1.01": ["cache", "cachê", "cache artista", "cache artistico", "cachê artista", "fee artista", "honorario artista", "honorário artista"],
  "2.1.02": ["dj", "djs", "set dj"],
  "2.1.03": ["participacao artistica", "participação artística", "feat", "participacao especial", "participação especial"],

  // 2.2 - Viagens e Hospedagem
  "2.2.01": ["aereo", "aéreo", "passagem", "passagens", "voo", "voos", "bilhete aviao", "bilhete avião"],
  "2.2.02": ["hotel", "hospedagem", "alojamento", "hospedaria", "estadia"],
  "2.2.03": ["transfer", "transporte", "motorista", "carrinha", "van", "uber", "bolt", "taxi", "táxi"],
  "2.2.04": ["alimentacao", "alimentação", "catering refeicao", "catering refeição", "refeicao", "refeição", "meal", "diaria alimentacao", "diária alimentação"],

  // 2.3 - Palco e Técnica
  "2.3.01": ["estrutura palco", "palco estrutura", "praticavel", "praticável", "estrado palco"],
  "2.3.02": ["som", "luz", "iluminacao", "iluminação", "house light", "audio", "áudio", "pa system"],
  "2.3.03": ["backline", "instrumentos", "amplificador", "bateria musical", "teclado"],
  "2.3.04": ["pirotecnia", "fogos", "efeitos especiais", "fogo artificio", "fogo artifício"],

  // 2.4 - Infraestrutura
  "2.4.01": ["gerador", "geradores"],
  "2.4.02": ["energia evento", "ligacao eletrica", "ligação elétrica", "quadro eletrico", "quadro elétrico"],
  "2.4.03": ["banheiro", "casa de banho", "wc quimico", "wc químico", "sanitario", "sanitário"],
  "2.4.04": ["agua", "água"],
  "2.4.05": ["vedacao", "vedação", "barreira", "barreiras", "anti panico", "anti pânico", "gradeamento"],
  "2.4.06": ["tenda", "tendas", "cobertura"],

  // 2.5 - Cenografia
  "2.5.01": ["cenografia palco", "decoracao palco", "decoração palco", "set design palco", "set design"],
  "2.5.02": ["vip", "cenografia vip", "decoracao vip", "decoração vip", "lounge vip"],
  "2.5.03": ["sinalizacao", "sinalização", "vinil", "vinis", "faixa", "totem", "placa sinaletica", "placa sinalética"],

  // 2.6 - Operação Complementar
  "2.6.04": ["camarim", "catering camarim"],
  "2.6.05": ["locacao espaco", "locação espaço", "aluguel venue", "venue rental", "renda espaco", "renda espaço"],
  "2.6.06": ["montagem", "desmontagem", "rigger", "empilhador", "plataforma elevatoria", "plataforma elevatória", "estrados"],
  "2.6.07": ["ticketeira", "ticketline", "comissao bilheteira", "comissão bilheteira", "comissao ticket", "taxa ticket", "bilheteira online", "comissao vendas", "comissão vendas", "comissao emissao", "comissão emissão"],
  "2.6.08": ["despesa extra", "despesa diversa", "reembolso", "outros custos", "miscelanea", "miscelânea"],

  // 2.7 - Licenças e Seguros
  "2.7.01": ["direitos autorais", "spa", "passmusic", "ecad"],
  "2.7.02": ["seguro", "seguros", "apolice", "apólice"],
  "2.7.03": ["alfandega", "alfândega", "igac", "licenciamento"],

  // 2.8 - Tecnologia
  "2.8.01": ["wifi", "wi fi", "internet evento", "rede evento"],
  "2.8.02": ["equipamento ti", "equipamento it", "computador", "notebook", "router", "roteador"],
  "2.8.03": ["cctv", "camera seguranca", "câmera segurança", "videovigilancia", "videovigilância"],
  "2.8.04": ["radio comunicacao", "rádio comunicação", "intercom", "walkie", "walkie talkie"],

  // 3.1 - Marketing/Divulgação
  "3.1.01": ["spot", "reels", "video", "vídeo", "audiovisual", "captacao", "captação", "filmagem"],
  "3.1.02": ["social media", "conteudo social", "conteúdo social", "gestao redes", "gestão redes"],
  "3.1.03": ["fotografia", "fotografo", "fotógrafo", "photo"],
  "3.1.04": ["assessoria imprensa", "press office", "relacoes publicas", "relações públicas"],
  "3.1.05": ["instagram", "facebook", "meta ads", "google ads", "digital", "trafego pago", "tráfego pago", "campanha digital", "anuncio digital", "anúncio digital"],
  "3.1.06": ["mupi", "mupis", "outdoor", "outdoors", "ooh", "out of home", "painel led rua", "painel led comercial", "ecran led rua", "ecrã led rua", "ecra led", "ecrã led comercial", "led comercial", "jcdecaux", "mop", "dream media", "flyer", "panfletagem", "pulseira", "pulseiras", "merchandising fisico", "midia exterior", "mídia exterior", "publicidade rua", "publicidade exterior"],
  "3.1.07": ["influencer", "influencers", "criador conteudo", "criador conteúdo"],
  "3.1.08": ["radio", "rádio", "tv", "televisao", "televisão", "midia tradicional", "mídia tradicional", "record", "tropical fm"],

  // 4.1 - Produção
  "4.1.01": ["producao executiva", "produção executiva", "equipa producao", "equipe produção"],
  "4.1.02": ["direcao palco", "direção palco", "stage manager"],
  "4.1.03": ["coordenacao", "coordenação", "coordenador"],
  "4.1.04": ["assistente producao", "assistente produção", "staff camarim"],

  // 4.2 - Staff Operacional
  "4.2.01": ["stagehand", "stagehands", "stage hand"],
  "4.2.02": ["runner", "runners"],
  "4.2.03": ["credenciamento", "recepcao", "recepção", "checkin", "check in"],

  // 4.3 - Segurança
  "4.3.01": ["seguranca", "segurança", "seguranca privada", "segurança privada"],
  "4.3.02": ["controlo acessos", "controle acessos", "pulseiras acesso"],

  // 4.4 - Serviços de Apoio
  "4.4.01": ["limpeza", "higienizacao", "higienização"],
  "4.4.02": ["brigada medica", "brigada médica", "ambulancia", "ambulância", "medico", "médico"],
  "4.4.03": ["bombeiro", "bombeiros"],

  // 10 - Operações Financeiras e Administrativas
  "10.3": ["transferencia interna", "transferência interna", "repasse interno", "movimentacao interna", "movimentação interna"],
  "10.4.01": ["ordenado", "ordenados", "salario", "salário", "folha pagamento"],
  "10.4.02": ["seguranca social", "segurança social", "inss", "tsu"],
  "10.4.03": ["seguro trabalho", "seguros trabalho"],
  "10.4.04": ["beneficio", "benefício", "vale", "ajuda custo"],
  "10.5.01": ["iva pagar"],
  "10.5.03": ["irc", "imposto", "impostos", "tributo", "tributos"],
  "10.6.01": ["taxa bancaria", "taxa bancária", "tarifa bancaria", "tarifa bancária", "encargo bancario", "encargo bancário", "comissao mbway", "comissão mbway"],
  "10.6.02": ["juro bancario", "juro bancário", "juros"],
  "10.7.04": ["contabilidade", "contador", "contabilista", "contabil"],
  "10.7.05": ["juridico", "jurídico", "advogado", "advocacia", "legal"],
  "10.7.06": ["consultoria", "consultor", "consulting"],
  "10.7.07": ["aluguel", "aluguer", "renda escritorio", "renda escritório", "escritorio", "escritório"],
  "10.7.08": ["energia escritorio", "energia escritório", "eletricidade"],
  "10.7.09": ["internet", "fibra", "banda larga"],
  "10.7.10": ["software", "softwares", "saas", "licenca software", "licença software", "assinatura software"],
  "10.7.11": ["cloud", "aws", "azure", "google cloud", "hosting", "servidor"],
  "10.7.12": ["equipamento", "equipamentos", "hardware", "monitor", "impressora"],
};

// Context-sensitive disambiguation: LED/ecrã can be technical (2.3.02) or advertising (3.1.06)
const CONTEXT_ADVERTISING = new Set([
  "ooh", "rua", "comercial", "publicidade", "outdoor", "mupi", "jcdecaux", "mop", "dream media",
  "divulgacao", "divulgação", "marketing", "campanha",
]);
const CONTEXT_TECHNICAL = new Set([
  "palco", "stage", "som", "luz", "tecnico", "técnico", "iluminacao", "iluminação",
]);

export function normalizeCategoryCodeKey(code: string | null | undefined): string {
  return (code ?? "")
    .split(".")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const asNumber = Number(trimmed);
      return Number.isNaN(asNumber) ? trimmed.toLowerCase() : String(asNumber);
    })
    .filter(Boolean)
    .join(".");
}

export function normalizeMatcherText(value: string | null | undefined): string {
  return ` ${(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeMatcherText(value)
    .trim()
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function includesPhrase(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return haystack.includes(` ${needle.trim()} `);
}

export function getExpenseLeafCategories<T extends ExpenseCategoryLite>(categories: T[]): T[] {
  const parentIds = new Set(categories.map((category) => category.parent_id).filter(Boolean));
  return categories.filter((category) => category.type === "expense" && !parentIds.has(category.id));
}

export function createExpenseCategoryMatcher(categories: ExpenseCategoryLite[]) {
  const leafCategories = getExpenseLeafCategories(categories);
  const prepared = leafCategories.map((category) => ({
    category,
    normalizedName: normalizeMatcherText(category.name).trim(),
    nameTokens: tokenize(category.name),
    aliases: (CATEGORY_CODE_SYNONYMS[category.code] ?? []).map((alias) => normalizeMatcherText(alias).trim()).filter(Boolean),
  }));

  return (input: CategoryMatchInput): string | null => {
    const fullText = normalizeMatcherText([input.description, input.specification].filter(Boolean).join(" "));
    const textTokens = new Set(tokenize([input.description, input.specification].filter(Boolean).join(" ")));

    // Context detection for LED/ecrã disambiguation
    const hasAdvertisingContext = [...CONTEXT_ADVERTISING].some((w) => includesPhrase(fullText, w));
    const hasTechnicalContext = [...CONTEXT_TECHNICAL].some((w) => includesPhrase(fullText, w));

    let bestMatch: { id: string; code: string; score: number } | null = null;

    for (const item of prepared) {
      let score = 0;

      // Context-based disambiguation for LED/ecrã
      const isLedRelated = ["2.3.02", "3.1.06"].includes(item.category.code);
      if (isLedRelated) {
        const ledTerms = ["led", "ecran", "ecra", "ecrã", "painel led"];
        const hasLedTerm = ledTerms.some((t) => includesPhrase(fullText, t));
        if (hasLedTerm) {
          if (item.category.code === "3.1.06" && hasAdvertisingContext && !hasTechnicalContext) {
            score += 6;
          } else if (item.category.code === "2.3.02" && hasTechnicalContext && !hasAdvertisingContext) {
            score += 6;
          }
        }
      }

      if (item.normalizedName && includesPhrase(fullText, item.normalizedName)) {
        score += 12;
      }

      for (const alias of item.aliases) {
        if (!includesPhrase(fullText, alias)) continue;
        score += Math.max(8, alias.split(" ").length * 4);
      }

      for (const token of item.nameTokens) {
        if (textTokens.has(token)) score += token.length >= 5 ? 3 : 2;
      }

      if (score < 6) continue;

      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && compareHierarchicalCodes(item.category.code, bestMatch.code) < 0)
      ) {
        bestMatch = { id: item.category.id, code: item.category.code, score };
      }
    }

    return bestMatch?.id ?? null;
  };
}
