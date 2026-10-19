/** Shared scanner extraction only: no identity, storage, writers, retries or effects. */
export const SCANNER_MODEL = "google/gemini-2.5-flash";
export const SCANNER_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const SCANNER_SYSTEM_PROMPT = `Analisa esta foto de talão / recibo / fatura de uma compra de camarim (alimentação, bebidas, snacks, descartáveis, frutas, etc.) e devolve APENAS um JSON válido com a seguinte estrutura:

{
  "supplier_name": "Nome do estabelecimento (ex: Pingo Doce, Continente, Café Central)",
  "supplier_nif": "NIF/contribuinte do fornecedor emitente (só dígitos, se visível)",
  "document_number": "Nº do talão/fatura/recibo (se visível)",
  "invoice_number": "Nº da fatura (se o documento for uma fatura; caso contrário null)",
  "document_type": "invoice" | "receipt" | "simplified_invoice" | "other",
  "document_date": "YYYY-MM-DD (data da compra)",
  "total_amount": 12.45,
  "iva_amount": 0.69,
  "iva_rate": 6,
  "currency": "EUR",
  "service_description": "Resumo curto dos itens (ex: Águas, refrigerantes, frutas)",
  "analytic_tag": "bebidas" | "comida" | "higiene" | "equipa" | "outros" | null,
  "confidence": "high" | "medium" | "low",
  "notes": "Observações relevantes (ex: talão ilegível, falta NIF)"
}

REGRAS:
- Em Portugal o IVA do camarim é normalmente 6% (alimentação) ou 23% (outros).
- Se não conseguires ler um campo, devolve null nesse campo.
- "confidence" reflecte a qualidade da extracção (high se talão nítido com totais claros).
- "supplier_nif" é o NIF DO EMITENTE (fornecedor), nunca o NIF do cliente/adquirente. Se só existir o NIF do cliente, devolve null.
- "invoice_number" repete o número da fatura quando aplicável; mantém "document_number" para compatibilidade com os restantes fluxos.
- Não inventes valores. Se incerto, devolve null e usa "low" em confidence.
- "analytic_tag" classifica o talão para análise interna (NÃO afeta a categoria contabilística):
  · "bebidas": águas, refrigerantes, sumos, álcool, café/chá engarrafado.
  · "comida": pratos quentes, refeições, take-away, sandes, sopa, doces, frutas frescas, frutos secos, snacks salgados/doces, mercearia leve.
  · "higiene": toalhas, copos, talheres descartáveis, gelo, papel, sabonete.
  · "equipa": despesas pessoais da equipa de camarim (refeições/bebidas só para a crew).
  · "outros": qualquer outro caso (ou se não tens certeza).
  Se não conseguires inferir, devolve null em vez de adivinhar.
- Devolve APENAS o JSON, sem markdown, sem explicações.`;


export function scannerRequest(imageBase64: string, mime: string, options?: { system: string; question: string; maxTokens: number }) {
  return {
    model: SCANNER_MODEL,
    messages: [
      { role: "system", content: options?.system ?? SCANNER_SYSTEM_PROMPT },
      { role: "user", content: [
        { type: "text", text: options?.question ?? "Extrai os dados deste talão de camarim." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
      ] },
    ],
    ...(options ? { max_tokens: options.maxTokens } : {}),
  };
}
/** Legacy-compatible JSON recovery. Callers must validate before trusting any fields. */
export function parseScannerContent(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  try { return JSON.parse(fenced ? fenced[1].trim() : content); }
  catch {
    const object = content.match(/\{[\s\S]*\}/);
    if (object) { try { return JSON.parse(object[0]); } catch { /* invalid */ } }
    throw new Error("invalid_scanner_json");
  }
}
