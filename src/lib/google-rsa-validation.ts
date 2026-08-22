// Validação do anúncio de pesquisa responsivo (RSA) do Google Ads.
//
// Fonte de verdade PARTILHADA entre o painel (GooglePublishPanel) e a edge
// function `crm-google-publish-execute`. O painel NÃO é fonte de verdade: a
// edge re-executa esta validação antes de qualquer :mutate, para nunca criar
// campanha/orçamento e falhar no anúncio.
//
// Limites duros do Google (v24):
//   headlines     3–15, cada ≤ 30 caracteres
//   descriptions  2–4,  cada ≤ 90 caracteres
//   path1/path2   ≤ 15 caracteres
//   final_url     obrigatório, http(s)
//
// Contagem em grafemas (Intl.Segmenter) — acentos/emoji contam como o Google
// os conta e não passamos um título de 31 sem perceber.

export const RSA_LIMITS = {
  headlineMin: 3,
  headlineMax: 15,
  headlineLen: 30,
  descriptionMin: 2,
  descriptionMax: 4,
  descriptionLen: 90,
  pathLen: 15,
  keywordLen: 80,
  keywordMaxWords: 10,
} as const;

export type MatchType = "BROAD" | "PHRASE" | "EXACT";

export interface RsaAd {
  uid?: string;
  headlines: string[];
  descriptions: string[];
  path1?: string | null;
  path2?: string | null;
  final_url?: string | null;
}

export interface KeywordDraft {
  uid?: string;
  text: string;
  match_type: MatchType;
}

export interface AdGroupDraft {
  uid?: string;
  nome: string;
  cpc_max_micros?: number | null;
  keywords: KeywordDraft[];
  negativas?: KeywordDraft[];
  ads: RsaAd[];
}

export interface PlanDraft {
  nome_campanha: string;
  orcamento_diario_micros: number;
  link_destino: string;
  objetivo?: string;
  estrategia_lance?: string;
  conversion_action_ref?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  geo?: { location_ids?: string[]; paises?: string[]; cidade?: string | null; raio_km?: number | null };
  idiomas?: string[];
  ad_groups: AdGroupDraft[];
}

export interface ValidationIssue {
  caminho: string;
  motivo: string;
}

let segmenter: { segment(input: string): Iterable<unknown> } | null = null;
export function graphemeLength(s: string): number {
  const value = (s ?? "").trim();
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: unknown) => { segment(i: string): Iterable<unknown> } }).Segmenter;
  if (typeof Seg === "function") {
    if (!segmenter) segmenter = new Seg("pt", { granularity: "grapheme" });
    let n = 0;
    for (const _ of segmenter.segment(value)) n++;
    return n;
  }
  return Array.from(value).length;
}

function isHttpUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateRsaAd(ad: RsaAd, caminho: string, fallbackUrl?: string | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const headlines = (ad.headlines ?? []).map((h) => (h ?? "").trim()).filter(Boolean);
  const descriptions = (ad.descriptions ?? []).map((d) => (d ?? "").trim()).filter(Boolean);

  if (headlines.length < RSA_LIMITS.headlineMin) {
    issues.push({ caminho: `${caminho}.headlines`, motivo: `São necessários pelo menos ${RSA_LIMITS.headlineMin} títulos (tem ${headlines.length}).` });
  }
  if (headlines.length > RSA_LIMITS.headlineMax) {
    issues.push({ caminho: `${caminho}.headlines`, motivo: `Máximo de ${RSA_LIMITS.headlineMax} títulos (tem ${headlines.length}).` });
  }
  headlines.forEach((h, i) => {
    const n = graphemeLength(h);
    if (n > RSA_LIMITS.headlineLen) {
      issues.push({ caminho: `${caminho}.headlines[${i}]`, motivo: `Título com ${n} caracteres; o limite é ${RSA_LIMITS.headlineLen}.` });
    }
  });

  if (descriptions.length < RSA_LIMITS.descriptionMin) {
    issues.push({ caminho: `${caminho}.descriptions`, motivo: `São necessárias pelo menos ${RSA_LIMITS.descriptionMin} descrições (tem ${descriptions.length}).` });
  }
  if (descriptions.length > RSA_LIMITS.descriptionMax) {
    issues.push({ caminho: `${caminho}.descriptions`, motivo: `Máximo de ${RSA_LIMITS.descriptionMax} descrições (tem ${descriptions.length}).` });
  }
  descriptions.forEach((d, i) => {
    const n = graphemeLength(d);
    if (n > RSA_LIMITS.descriptionLen) {
      issues.push({ caminho: `${caminho}.descriptions[${i}]`, motivo: `Descrição com ${n} caracteres; o limite é ${RSA_LIMITS.descriptionLen}.` });
    }
  });

  for (const p of ["path1", "path2"] as const) {
    const v = (ad[p] ?? "").toString().trim();
    if (v && graphemeLength(v) > RSA_LIMITS.pathLen) {
      issues.push({ caminho: `${caminho}.${p}`, motivo: `Caminho com ${graphemeLength(v)} caracteres; o limite é ${RSA_LIMITS.pathLen}.` });
    }
    if (v && /[\s/]/.test(v)) {
      issues.push({ caminho: `${caminho}.${p}`, motivo: "O caminho não pode conter espaços nem barras." });
    }
  }

  const url = ad.final_url || fallbackUrl;
  if (!isHttpUrl(url)) {
    issues.push({ caminho: `${caminho}.final_url`, motivo: "URL final inválido (tem de começar por http:// ou https://)." });
  }
  return issues;
}

export function validateKeyword(kw: KeywordDraft, caminho: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const text = (kw.text ?? "").trim();
  if (!text) {
    issues.push({ caminho, motivo: "Palavra-chave vazia." });
    return issues;
  }
  if (graphemeLength(text) > RSA_LIMITS.keywordLen) {
    issues.push({ caminho, motivo: `Palavra-chave com ${graphemeLength(text)} caracteres; o limite é ${RSA_LIMITS.keywordLen}.` });
  }
  if (text.split(/\s+/).length > RSA_LIMITS.keywordMaxWords) {
    issues.push({ caminho, motivo: `Máximo de ${RSA_LIMITS.keywordMaxWords} palavras por palavra-chave.` });
  }
  if (!["BROAD", "PHRASE", "EXACT"].includes(kw.match_type)) {
    issues.push({ caminho, motivo: "Tipo de correspondência inválido." });
  }
  return issues;
}

export function validatePlan(plan: PlanDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!(plan.nome_campanha ?? "").trim()) {
    issues.push({ caminho: "nome_campanha", motivo: "Dá um nome à campanha." });
  }
  if (!Number.isFinite(plan.orcamento_diario_micros) || plan.orcamento_diario_micros <= 0) {
    issues.push({ caminho: "orcamento_diario_micros", motivo: "O orçamento diário tem de ser maior que zero." });
  }
  if (!isHttpUrl(plan.link_destino)) {
    issues.push({ caminho: "link_destino", motivo: "Link de destino inválido (http:// ou https://)." });
  }
  if (plan.objetivo === "CONVERSIONS" && plan.estrategia_lance === "MAXIMIZE_CONVERSIONS" && !plan.conversion_action_ref) {
    issues.push({ caminho: "conversion_action_ref", motivo: "Escolhe a meta de conversão ou muda a estratégia para maximizar cliques." });
  }
  if (plan.start_date && plan.end_date && plan.end_date < plan.start_date) {
    issues.push({ caminho: "end_date", motivo: "A data de fim é anterior à data de início." });
  }
  const geoIds = plan.geo?.location_ids ?? [];
  if (geoIds.length === 0 && (plan.geo?.paises ?? []).length === 0) {
    issues.push({ caminho: "geo", motivo: "Define pelo menos uma localização (cidade ou país)." });
  }
  if ((plan.idiomas ?? []).length === 0) {
    issues.push({ caminho: "idiomas", motivo: "Define pelo menos um idioma." });
  }

  const groups = plan.ad_groups ?? [];
  if (groups.length === 0) {
    issues.push({ caminho: "ad_groups", motivo: "Cria pelo menos um grupo de anúncios." });
  }
  groups.forEach((g, gi) => {
    const base = `ad_groups[${gi}]`;
    if (!(g.nome ?? "").trim()) issues.push({ caminho: `${base}.nome`, motivo: "Dá um nome ao grupo de anúncios." });
    const kws = g.keywords ?? [];
    if (kws.length === 0) issues.push({ caminho: `${base}.keywords`, motivo: "O grupo precisa de pelo menos uma palavra-chave." });
    kws.forEach((k, ki) => issues.push(...validateKeyword(k, `${base}.keywords[${ki}]`)));
    (g.negativas ?? []).forEach((k, ki) => issues.push(...validateKeyword(k, `${base}.negativas[${ki}]`)));
    const ads = g.ads ?? [];
    if (ads.length === 0) issues.push({ caminho: `${base}.ads`, motivo: "O grupo precisa de pelo menos um anúncio." });
    ads.forEach((a, ai) => issues.push(...validateRsaAd(a, `${base}.ads[${ai}]`, plan.link_destino)));
  });

  return issues;
}
