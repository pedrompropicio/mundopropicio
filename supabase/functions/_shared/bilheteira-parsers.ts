// Parsers das páginas públicas das bilheteiras (Ticketline, BOL).
// Usado por bilheteira-sync. Puramente funcional e testável sem rede
// (as funções parse* recebem o HTML já descarregado).

export interface ParsedZone {
  /** Nome tal como apresentado ao público, ex. "Bancada | Lote 2" */
  name: string;
  /** Nome da zona sem o sufixo de lote, ex. "Bancada" */
  zone: string;
  /** Número do lote, quando o nome inclui "Lote N" */
  lot: number | null;
  /** Preço BASE (valor facial, sem taxas de operação) */
  basePrice: number | null;
  available: boolean;
  seatsAvailable: number | null;
  /** Zonas ignoradas para lotes/preço mínimo (mobilidade condicionada, etc.) */
  ignored: boolean;
}

export interface ParseResult {
  zones: ParsedZone[];
  /** URL efetivamente lido (pode ser a sessão derivada da página do evento) */
  url: string;
  eventTitle?: string | null;
}

export interface TicketLotItem {
  label_pt: string;
  label_en: string;
  price: number | null;
  status: "esgotado" | "a_venda" | "brevemente";
}

// Ignorar APENAS bilhetes condicionais de mobilidade (cadeira de rodas/acompanhante).
// Zonas de VISIBILIDADE reduzida são bilhetes públicos normais e CONTAM para o
// preço mínimo e para a régua de lotes.
const IGNORE_ZONE_RE = /mobilidade|condicionad|cadeira\s*de\s*rodas|acompanhante/i;

const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const parseMoney = (s: string): number | null => {
  const m = s.replace(/\s/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const splitLot = (name: string): { zone: string; lot: number | null } => {
  const m = name.match(/lote\s*0*(\d+)/i);
  const lot = m ? Number(m[1]) : null;
  const zone = name
    .replace(/\|?\s*lote\s*0*\d+\s*\|?/i, " ")
    .replace(/\s*\|\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return { zone: zone || name.trim(), lot };
};

const titleish = (s: string): string =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();

// ───────────────────────────── Ticketline ─────────────────────────────

/** Extrai o link da página de sessão ("Escolha de lugares") da página do evento. */
export function findTicketlineSessionUrl(eventHtml: string, baseUrl: string): string | null {
  const m = eventHtml.match(/href="([^"]*\/sessao\/[^"]+)"/i);
  if (!m) return null;
  try {
    return new URL(m[1], baseUrl).toString();
  } catch {
    return null;
  }
}

export function parseTicketlineSession(html: string, url: string): ParseResult {
  // 1) mapas de disponibilidade e nomes "bonitos" a partir da lista de zonas
  const listInfo = new Map<string, { name: string; soldout: boolean; parenPrice: number | null }>();
  const liRe = /<li[^>]*class="([^"]*)"[^>]*id="listZone_(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let li: RegExpExecArray | null;
  while ((li = liRe.exec(html))) {
    const cls = li[1] || "";
    const id = li[2];
    const body = li[3] || "";
    const nameM = body.match(/<p class="zone"[^>]*>([\s\S]*?)<\/p>/i);
    const priceBlock = body.match(/<p class="price"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
    const paren = stripTags(priceBlock).match(/\((\d+(?:[.,]\d{1,2})?)\s*€\)/);
    listInfo.set(id, {
      name: nameM ? stripTags(nameM[1]) : "",
      soldout: /\bsoldout\b/i.test(cls),
      parenPrice: paren ? parseMoney(paren[1]) : null,
    });
  }

  // 2) dados estruturados por zona (data-zone-info)
  const zones: ParsedZone[] = [];
  const seen = new Set<string>();
  const areaRe = /data-zone-id=['"](\d+)['"]\s*data-zone-info=['"]([\s\S]*?)['"]\s*>/gi;
  let a: RegExpExecArray | null;
  while ((a = areaRe.exec(html))) {
    const id = a[1];
    if (seen.has(id)) continue;
    seen.add(id);
    let info: Record<string, unknown> = {};
    try {
      info = JSON.parse(decodeEntities(a[2]));
    } catch {
      continue;
    }
    const meta = listInfo.get(id);
    const rawName = String(meta?.name || info.name || "").trim();
    if (!rawName) continue;
    const name = meta?.name ? rawName : titleish(rawName);
    const price = meta?.parenPrice ??
      (typeof (info.seats_price as any)?.total_amount === "number"
        ? Number((info.seats_price as any).total_amount)
        : null);
    const seats = typeof info.seats_available === "number" ? Number(info.seats_available) : null;
    const soldout = meta ? meta.soldout : seats === 0;
    const { zone, lot } = splitLot(name);
    zones.push({
      name,
      zone,
      lot,
      basePrice: price && price > 0 ? price : null,
      available: !soldout && (seats === null || seats > 0),
      seatsAvailable: seats,
      ignored: IGNORE_ZONE_RE.test(name),
    });
  }

  // 3) fallback: só a lista (sem mapa de zonas)
  if (zones.length === 0) {
    for (const [, meta] of listInfo) {
      if (!meta.name) continue;
      const { zone, lot } = splitLot(meta.name);
      zones.push({
        name: meta.name,
        zone,
        lot,
        basePrice: meta.parenPrice,
        available: !meta.soldout,
        seatsAvailable: null,
        ignored: IGNORE_ZONE_RE.test(meta.name),
      });
    }
  }

  const title = html.match(/<p class="title">([\s\S]*?)<\/p>/i);
  return { zones, url, eventTitle: title ? stripTags(title[1]) : null };
}

// ─────────────────────────────── BOL ───────────────────────────────

/**
 * Página de Sectores da BOL (…/Comprar/Bilhetes/<id>/<sessao>/Sectores).
 * A BOL expõe cada sector em `data-sector='{"Sector:":" 1ª Plateia",
 * "Preço:":[{"P":"209,00€",...}]}'` ou, quando esgotado,
 * `{"Sector:":" X","Disponibilidade:":"Lotacão Esgotada"}`.
 */
/**
 * A partir de uma página BOL de EVENTO, encontra o URL da página de Sectores.
 * Devolve `{ url, needsSessoes }`: quando só existe o link `/Sessoes`, é preciso
 * um segundo salto (buscar aí o `/Sectores`).
 */
export function findBolSectoresUrl(
  html: string,
  baseUrl: string,
): { url: string; needsSessoes: boolean } | null {
  const abs = (href: string) => {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  };
  const sect = html.match(/href="([^"]*\/Sectores[^"]*)"/i);
  if (sect) {
    const u = abs(sect[1]);
    if (u) return { url: u, needsSessoes: false };
  }
  // /Sessoes do próprio evento (mesmo id numérico do baseUrl quando existir)
  const idM = baseUrl.match(/Bilhetes\/(\d+)/i);
  const re = /href="([^"]*\/Sessoes[^"]*)"/gi;
  let m: RegExpExecArray | null;
  let fallback: string | null = null;
  while ((m = re.exec(html))) {
    const u = abs(m[1]);
    if (!u) continue;
    if (idM && u.includes(`/${idM[1]}`)) return { url: u, needsSessoes: true };
    fallback ??= u;
  }
  return fallback ? { url: fallback, needsSessoes: true } : null;
}

export function parseBolSectores(html: string, url: string): ParseResult {
  const zones: ParsedZone[] = [];
  const seen = new Set<string>();

  const secRe = /data-sector=['"]([\s\S]*?)['"]\s*(?:\/?>|style=)/gi;
  let m: RegExpExecArray | null;
  while ((m = secRe.exec(html))) {
    let info: Record<string, unknown>;
    try {
      info = JSON.parse(decodeEntities(m[1]));
    } catch {
      continue;
    }
    const name = String(info["Sector:"] ?? "").replace(/\s+/g, " ").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const disp = String(info["Disponibilidade:"] ?? "");
    const soldout = /esgotad/i.test(disp);
    // A BOL usa "Preço:" (1 preço) ou "Preços:" (vários) — aceitar ambos.
    const precos: Array<Record<string, string>> = [];
    for (const [k, v] of Object.entries(info)) {
      if (!/^pre[çc]os?:/i.test(k)) continue;
      if (Array.isArray(v)) precos.push(...(v as Array<Record<string, string>>));
      else if (typeof v === "string") precos.push({ P: v });
    }
    const prices = precos.map((p) => parseMoney(String(p?.P ?? ""))).filter((n): n is number => n !== null && n > 0);
    const price = prices.length ? Math.min(...prices) : null;

    const { zone, lot } = splitLot(name);
    zones.push({
      name,
      zone,
      lot,
      basePrice: price,
      available: !soldout && price !== null,
      seatsAvailable: null,
      ignored: IGNORE_ZONE_RE.test(name),
    });
  }


  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  return { zones, url, eventTitle: title ? stripTags(title[1]) : null };
}

// ──────────────────────── ticket_lots + preço mínimo ────────────────────────

export interface BuildResult {
  ticketLots: TicketLotItem[];
  offerPriceMin: number | null;
  possibleSoldOut: boolean;
}

/**
 * Constrói a régua editorial de lotes a partir das zonas lidas.
 * REGRA CRÍTICA: se nenhuma zona relevante estiver disponível devolve
 * possibleSoldOut=true e NADA deve ser escrito no evento.
 */
export function buildTicketLots(zones: ParsedZone[]): BuildResult {
  const relevant = zones.filter((z) => !z.ignored);
  const available = relevant.filter((z) => z.available && z.basePrice !== null);

  if (relevant.length === 0 || available.length === 0) {
    return { ticketLots: [], offerPriceMin: null, possibleSoldOut: true };
  }

  const lots: TicketLotItem[] = [];

  // Lotes anteriores (esgotados) — inferidos do maior "Lote N" disponível
  const maxLot = available.reduce((m, z) => (z.lot && z.lot > m ? z.lot : m), 0);
  for (let n = 1; n < maxLot; n++) {
    lots.push({
      label_pt: `${n}º Lote`,
      label_en: `Lot ${n}`,
      price: null,
      status: "esgotado",
    });
  }

  // Zonas disponíveis, mais baratas primeiro
  for (const z of [...available].sort((x, y) => (x.basePrice ?? 0) - (y.basePrice ?? 0))) {
    lots.push({
      label_pt: z.lot ? `${z.lot}º Lote — ${z.zone}` : z.zone,
      label_en: z.lot ? `Lot ${z.lot} — ${z.zone}` : z.zone,
      price: z.basePrice,
      status: "a_venda",
    });
  }

  // Zonas esgotadas individualmente (nunca esgotado global — ver regra acima)
  for (const z of relevant.filter((x) => !x.available)) {
    lots.push({
      label_pt: z.lot ? `${z.lot}º Lote — ${z.zone}` : z.zone,
      label_en: z.lot ? `Lot ${z.lot} — ${z.zone}` : z.zone,
      price: null,
      status: "esgotado",
    });
  }

  const offerPriceMin = Math.min(...available.map((z) => z.basePrice as number));

  return { ticketLots: lots, offerPriceMin, possibleSoldOut: false };
}

/** Sanidade: valores estranhos → não escrever nada. */
export function looksSane(zones: ParsedZone[]): boolean {
  const relevant = zones.filter((z) => !z.ignored);
  if (relevant.length === 0) return false;
  for (const z of relevant) {
    if (z.basePrice !== null && (z.basePrice <= 0 || z.basePrice > 5000)) return false;
  }
  return true;
}
