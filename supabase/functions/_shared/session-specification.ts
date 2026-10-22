// Issue #343 — cabeçalho curto de transactions.specification para as transações
// consolidadas de Sessão de cartão e de Sessão de Camarim. O detalhe dos itens
// fica só no modal da sessão (sem lista de itens nem linha "Fornecedores:").

export interface CardSessionSpecInput {
  cardName: string;
  holderName: string | null | undefined;
  eventName: string | null | undefined;
  catCode: string | null | undefined;
  catName: string | null | undefined;
  itemCount: number;
  ivaRate: number;
}

export function buildCardSessionSpecification(i: CardSessionSpecInput): string {
  return [
    `Sessão de cartão: ${i.cardName} · portador ${i.holderName ?? ""}`,
    i.eventName ? `Evento: ${i.eventName}` : "Sem evento (custo de estrutura)",
    `Rubrica: ${i.catCode ?? "?"} — ${i.catName ?? "?"}`,
    `Itens consolidados: ${i.itemCount}`,
    `IVA: ${i.ivaRate}%`,
  ].join("\n");
}

export interface CamarimSessionSpecInput {
  title: string;
  itemCount: number;
  originLabel: string;
  ivaRate: number;
  /** Linha do desvio de IVA (sem "\n" inicial), ou null quando não há desvio. */
  ivaDriftNote: string | null;
}

export function buildCamarimSessionSpecification(i: CamarimSessionSpecInput): string {
  return [
    `Sessão de Camarim: ${i.title}`,
    `Itens consolidados: ${i.itemCount}`,
    `Origem: ${i.originLabel}`,
    `IVA: ${i.ivaRate}%`,
    i.ivaDriftNote,
  ].filter(Boolean).join("\n");
}
