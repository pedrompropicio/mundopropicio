// Chaves de portal_sites.content lidas pelo site newgangfestival.pt.
// Fonte: API-CONTRACT.md do projeto do site, secção "Textos (portal_sites.content)".
// O placeholder é o texto que o site mostra quando a chave não existe.
export type ContentField = { key: string; label: string; placeholder: string; multiline?: boolean };
export type ContentGroup = { title: string; fields: ContentField[] };

export const NEWGANG_CONTENT_GROUPS: ContentGroup[] = [
  {
    title: "Início",
    fields: [
      { key: "hero_date", label: "Topo — data", placeholder: "25 de março de 2027" },
      { key: "hero_venue", label: "Topo — local", placeholder: "MEO Arena · Lisboa" },
      { key: "club_description", label: "Clube — descrição", placeholder: "O Clube Newgang é a waitlist oficial do festival. Quem está nele compra antes da venda geral, sabe primeiro quem vem e ganha prêmios." },
      { key: "club_cta", label: "Clube — botão", placeholder: "Entrar no Clube Newgang →" },
      { key: "club_neon_title", label: "Clube — título néon", placeholder: "Tenha acesso exclusivo" },
      { key: "club_neon_subtitle", label: "Clube — subtítulo néon", placeholder: "ao lote promocional" },
      { key: "history_teaser_title", label: "História — título", placeholder: "Cada edição maior que a outra" },
      { key: "benefit_1_title", label: "Benefício 1 — título", placeholder: "Lote promocional" },
      { key: "benefit_1_description", label: "Benefício 1 — descrição", placeholder: "Preço exclusivo para quem está no Clube, antes da venda geral." },
      { key: "benefit_2_title", label: "Benefício 2 — título", placeholder: "Primeiro a saber" },
      { key: "benefit_2_description", label: "Benefício 2 — descrição", placeholder: "Cada nome do line-up chega ao Clube 24 horas antes de todo mundo." },
      { key: "benefit_3_title", label: "Benefício 3 — título", placeholder: "Prémios do Clube" },
      { key: "benefit_3_description", label: "Benefício 3 — descrição", placeholder: "Convide amigos, acerte palpites e suba no ranking. Os prémios são anunciados em breve." },
    ],
  },
  {
    title: "Clube (/clube)",
    fields: [
      { key: "club_header", label: "Cabeçalho", placeholder: "Newgang Festival 2027 · 25 março · MEO Arena" },
      { key: "club_landing_description", label: "Descrição", placeholder: "O Clube Newgang é a waitlist oficial do festival: quem está nele tem acesso exclusivo ao lote promocional, antes da venda geral." },
    ],
  },
  {
    title: "Bilhetes (/bilhetes)",
    fields: [
      { key: "tickets_title", label: "Título", placeholder: "Primeiro o Clube." },
      { key: "tickets_subtitle", label: "Subtítulo", placeholder: "Depois todo mundo." },
      { key: "tickets_club_title", label: "Clube — título", placeholder: "Lote promocional" },
      { key: "tickets_club_description", label: "Clube — descrição", placeholder: "Preço especial só para quem está na waitlist. A data chega por email aos membros." },
      { key: "tickets_general_title", label: "Venda geral — título", placeholder: "Venda geral" },
      { key: "tickets_general_description", label: "Venda geral — descrição", placeholder: "Abertura para o público depois da pré-venda do Clube." },
      { key: "tickets_zones_title", label: "Zonas — título", placeholder: "Golden Circle · Plateia · Balcão" },
      { key: "tickets_zones_description", label: "Zonas — descrição", placeholder: "Mapa de zonas e preços publicados na Fever quando a venda abrir." },
      { key: "tickets_official_description", label: "Venda oficial — descrição", placeholder: "Os bilhetes são vendidos só na Fever." },
    ],
  },
  {
    title: "Meu Clube (/meu-clube)",
    fields: [
      { key: "ranking_prizes", label: "Prémios do ranking (um por linha; vazio ou \"—\" esconde o bloco)", placeholder: "", multiline: true },
    ],
  },
];

export const NEWGANG_CONTENT_KEYS = NEWGANG_CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

/** Remove chaves vazias (só espaços conta como vazio): o site volta ao texto por omissão. */
export function cleanNewgangContent(content: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(content ?? {})) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}
