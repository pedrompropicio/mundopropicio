import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import type { PLMode, PLTypeFilter } from "@/components/ReportPL";
import { buildCategoryLookup, type AccountLevel } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareReportCodesUnclassifiedLast } from "@/lib/utils";

interface PLLine {
  label: string;
  forecast: number;
  forecastIva: number;
  forecastTotal: number;
  actual: number;
  actualIva: number;
  actualTotal: number;
  variance: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  isGroupHeader?: boolean;
  indent?: boolean;
  subIndent?: boolean;
  isSubTotal?: boolean;
  quantity?: number;
  unitPrice?: number;
  overrideCount?: number;
  categoryName?: string;
  specification?: string | null;
  formalidade?: string | null;
  /** Hierarquia contábil: 1=L1 (secção), 2=L2 (grupo), 3=L3 (rubrica). Undefined em totais/subtotais especiais/itens. */
  hierLevel?: 1 | 2 | 3;
}

const FORMALIDADE_LABEL: Record<string, string> = {
  estimado: "Estimado",
  negociacao: "Negociação",
  fechado: "Fechado",
  pago_parcial: "Pago parcial",
  pago_total: "Pago total",
};

function pl(base: Omit<PLLine, 'forecastIva' | 'forecastTotal' | 'actualIva' | 'actualTotal'> & { forecastIva?: number; forecastTotal?: number; actualIva?: number; actualTotal?: number }): PLLine {
  return {
    ...base,
    forecastIva: base.forecastIva ?? 0,
    forecastTotal: base.forecastTotal ?? base.forecast,
    actualIva: base.actualIva ?? 0,
    actualTotal: base.actualTotal ?? base.actual,
  };
}




interface ExportHierarchyMaps {
  subEventParentMap: Record<string, string>;
  subCountByParent: Record<string, number>;
  childrenByParent: Record<string, string[]>;
}

function buildEventHierarchyMaps(allEvents: any[]): ExportHierarchyMaps {
  const subEventParentMap: Record<string, string> = {};
  const subCountByParent: Record<string, number> = {};
  const childrenByParent: Record<string, string[]> = {};

  allEvents.forEach((event) => {
    if (event.parent_event_id) {
      subEventParentMap[event.id] = event.parent_event_id;
      subCountByParent[event.parent_event_id] = (subCountByParent[event.parent_event_id] || 0) + 1;
      if (!childrenByParent[event.parent_event_id]) childrenByParent[event.parent_event_id] = [];
      childrenByParent[event.parent_event_id].push(event.id);
    }
  });

  return { subEventParentMap, subCountByParent, childrenByParent };
}

function getEffectiveExportData(eventId: string, forecasts: any[], transactions: any[], hierarchy: ExportHierarchyMaps) {
  let evtF = forecasts.filter((f: any) => f.event_id === eventId);
  let evtT = transactions.filter((t: any) => t.event_id === eventId);

  const parentId = hierarchy.subEventParentMap[eventId];
  if (parentId) {
    const siblingCount = hierarchy.subCountByParent[parentId] || 1;
    const parentF = forecasts
      .filter((f: any) => f.event_id === parentId)
      .map((f: any) => ({ ...f, amount: Number(f.amount) / siblingCount }));
    const parentT = transactions
      .filter((t: any) => t.event_id === parentId)
      .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount }));
    evtF = [...evtF, ...parentF];
    evtT = [...evtT, ...parentT];
  }

  const children = hierarchy.childrenByParent[eventId];
  if (children?.length) {
    children.forEach((childId) => {
      evtF = [...evtF, ...forecasts.filter((f: any) => f.event_id === childId)];
      evtT = [...evtT, ...transactions.filter((t: any) => t.event_id === childId)];
    });
  }

  return { evtF, evtT };
}

function getRelevantExportEventIds(eventId: string, hierarchy: ExportHierarchyMaps): string[] {
  const ids = [eventId];
  const children = hierarchy.childrenByParent[eventId];
  if (children?.length) ids.push(...children);
  return ids;
}

function buildPLForExport(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], ticketSales: any[], eventId: string,
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = [],
  relevantEventIds: string[] = [eventId],
  typeFilter: PLTypeFilter = "both",
  level: AccountLevel = 2,
  includeOverhead: boolean = false,
  expandForecasts: boolean = false
): PLLine[] {
  const showIncome = typeFilter === "income" || typeFilter === "both";
  const showExpense = typeFilter === "expense" || typeFilter === "both";
  const lookup = buildCategoryLookup(categories);
  // Aplica o toggle "Com/Sem Overhead" ao input. Quando OFF, despreza linhas is_overhead.
  if (!includeOverhead) {
    forecasts = forecasts.filter((f: any) => !f.is_overhead);
  }

  const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
  let ticketForecastNet = 0;
  let ticketForecastIva = 0;
  let ticketForecastGross = 0;
  const ticketLines: PLLine[] = [];
  let totalTicketQty = 0;
  let totalTicketActualNet = 0;
  let totalTicketActualIva = 0;
  if (evtZones.length > 0) {
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      let zoneNet = 0;
      let zoneIva = 0;
      let zoneQty = 0;
      let zoneActualNet = 0;
      let zoneActualIva = 0;
      zoneLots.forEach((lot: any) => {
        const qty = Number(lot.quantity);
        const grossPrice = Number(lot.price);
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = grossPrice / (1 + ivaRate / 100);
        const lotNet = netPrice * qty;
        const lotIva = (grossPrice - netPrice) * qty;
        ticketForecastNet += lotNet;
        ticketForecastIva += lotIva;
        ticketForecastGross += grossPrice * qty;
        zoneNet += lotNet;
        zoneIva += lotIva;
        zoneQty += qty;
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        const lotSoldNet = lotSales.reduce((s: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return s + Number(sl.quantity) * saleNet;
        }, 0);
        const lotSoldGross = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
        const lotSoldIva = lotSoldGross - lotSoldNet;
        zoneActualNet += lotSoldNet;
        zoneActualIva += lotSoldIva;
        totalTicketActualNet += lotSoldNet;
        totalTicketActualIva += lotSoldIva;
        ticketLines.push(pl({
          label: `${zone.name} — ${lot.name}`,
          forecast: lotNet,
          actual: lotSoldNet,
          variance: lotSoldNet - lotNet,
          forecastIva: lotIva,
          forecastTotal: lotNet + lotIva,
          actualIva: lotSoldIva,
          actualTotal: lotSoldNet + lotSoldIva,
          subIndent: true,
          quantity: qty,
          unitPrice: grossPrice,
        }));
      });
      totalTicketQty += zoneQty;
      ticketLines.push(pl({
        label: `Subtotal ${zone.name}`,
        forecast: zoneNet,
        actual: zoneActualNet,
        variance: zoneActualNet - zoneNet,
        forecastIva: zoneIva,
        forecastTotal: zoneNet + zoneIva,
        actualIva: zoneActualIva,
        actualTotal: zoneActualNet + zoneActualIva,
        subIndent: true,
        isSubTotal: true,
        quantity: zoneQty,
      }));
    });
    ticketLines.push(pl({
      label: "Total Bilheteira",
      forecast: ticketForecastNet,
      actual: totalTicketActualNet,
      variance: totalTicketActualNet - ticketForecastNet,
      forecastIva: ticketForecastIva,
      forecastTotal: ticketForecastNet + ticketForecastIva,
      actualIva: totalTicketActualIva,
      actualTotal: totalTicketActualNet + totalTicketActualIva,
      subIndent: true,
      isSubTotal: true,
      quantity: totalTicketQty,
    }));
  }




  // Metadata (specification/formalidade) por chave LEAF "type|code|name" — sempre o
  // código+nome da categoria do próprio forecast (L3 quando existe, senão L2, senão L1).
  const metaByKey = new Map<string, { specs: Set<string>; forms: Set<string> }>();
  const forecastsByKey = new Map<string, any[]>();
  const derivedKey = (f: any): string => {
    const catInfo = lookup[f.category_id];
    const code = catInfo?.code ?? "Z";
    const name = catInfo?.name ?? "Sem categoria";
    return `${f.type}|${code}|${name}`;
  };
  forecasts.forEach((f: any) => {
    const key = derivedKey(f);
    let entry = metaByKey.get(key);
    if (!entry) { entry = { specs: new Set(), forms: new Set() }; metaByKey.set(key, entry); }
    const spec = (f.specification ?? "").toString().trim();
    if (spec) entry.specs.add(spec);
    const form = (f.formalidade ?? "").toString().trim();
    if (form) entry.forms.add(form);
    const arr = forecastsByKey.get(key) ?? [];
    arr.push(f);
    forecastsByKey.set(key, arr);
  });
  const readMeta = (type: "income" | "expense", code: string, name: string) => {
    const e = metaByKey.get(`${type}|${code}|${name}`);
    return {
      specification: e && e.specs.size === 1 ? [...e.specs][0] : null,
      formalidade: e && e.forms.size === 1 ? [...e.forms][0] : null,
    };
  };

  // Emite uma linha por forecast individual (só quando expandForecasts=true).
  const pushForecastChildren = (target: PLLine[], type: "income" | "expense", code: string, name: string) => {
    if (!expandForecasts) return;
    const key = `${type}|${code}|${name}`;
    const list = forecastsByKey.get(key) ?? [];
    if (list.length === 0) return;
    list.forEach((f: any) => {
      const base = Number(f.amount) || 0;
      const rate = Number(f.iva_rate ?? 0) || 0;
      const iva = base * rate / 100;
      const label = (f.description && String(f.description).trim()) || "(sem descrição)";
      target.push(pl({
        label,
        forecast: base,
        actual: 0,
        variance: -base,
        forecastIva: iva,
        forecastTotal: base + iva,
        actualIva: 0,
        actualTotal: 0,
        subIndent: true,
        specification: (f.specification ?? null) || null,
        formalidade: (f.formalidade ?? null) || null,
      }));
    });
  };

  // ─── Cache total (para injectar em 2.1.01 · Cachês) ───
  const eventCacheConfigs = cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id));
  const cachePLLines = calculateCacheLinesForPL(
    eventCacheConfigs,
    cacheDeductions,
    ticketForecastNet,
    forecasts.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
    ticketForecastGross
  );
  const totalCacheAmount = cachePLLines.reduce((s, c) => s + c.amount, 0);

  // ─── Árvore hierárquica L1 > L2 > L3 (fonte única de emissão) ───
  type TreeNode = {
    code: string; name: string; level: 1 | 2 | 3;
    fBase: number; fIva: number; tBase: number; tIva: number;
    children: Map<string, TreeNode>;
  };
  const buildChain = (info: any): Array<{ code: string; name: string; level: 1 | 2 | 3 }> => {
    if (!info) return [{ code: "Z", name: "Sem categoria", level: 1 }];
    if (info.depth === 3) return [
      { code: info.l1Code, name: info.l1Name, level: 1 },
      { code: info.l2Code, name: info.l2Name, level: 2 },
      { code: info.code, name: info.name, level: 3 },
    ];
    if (info.depth === 2) return [
      { code: info.l1Code, name: info.l1Name, level: 1 },
      { code: info.code, name: info.name, level: 2 },
    ];
    return [{ code: info.code, name: info.name, level: 1 }];
  };
  const ensurePath = (root: Map<string, TreeNode>, chain: Array<{ code: string; name: string; level: 1 | 2 | 3 }>): TreeNode[] => {
    let cursor = root;
    const path: TreeNode[] = [];
    for (const seg of chain) {
      let node = cursor.get(seg.code);
      if (!node) {
        node = { code: seg.code, name: seg.name, level: seg.level, fBase: 0, fIva: 0, tBase: 0, tIva: 0, children: new Map() };
        cursor.set(seg.code, node);
      }
      path.push(node);
      cursor = node.children;
    }
    return path;
  };
  const addToTree = (root: Map<string, TreeNode>, catId: string | null, base: number, iva: number, isForecast: boolean) => {
    const info = catId ? lookup[catId] : null;
    const chain = buildChain(info);
    const path = ensurePath(root, chain);
    for (const node of path) {
      if (isForecast) { node.fBase += base; node.fIva += iva; }
      else { node.tBase += base; node.tIva += iva; }
    }
  };

  const incTree = new Map<string, TreeNode>();
  const expTree = new Map<string, TreeNode>();
  forecasts.forEach((f: any) => {
    const base = Number(f.amount) || 0;
    const iva = base * Number(f.iva_rate ?? 0) / 100;
    const tree = f.type === "income" ? incTree : expTree;
    addToTree(tree, f.category_id ?? null, base, iva, true);
  });
  transactions.forEach((t: any) => {
    const base = Number(t.amount) || 0;
    const iva = base * Number(t.iva_rate ?? 0) / 100;
    const tree = t.type === "income" ? incTree : expTree;
    addToTree(tree, t.category_id ?? null, base, iva, false);
  });

  // Injecção Cache → 2 · Custos do Evento > 2.1 · Artístico > 2.1.01 · Cachês
  if (totalCacheAmount > 0) {
    const cachesInfo = Object.values(lookup).find((l) => l.code === "2.1.01");
    const chain: Array<{ code: string; name: string; level: 1 | 2 | 3 }> = cachesInfo
      ? [
          { code: cachesInfo.l1Code, name: cachesInfo.l1Name, level: 1 },
          { code: cachesInfo.l2Code ?? "2.1", name: cachesInfo.l2Name ?? "Artístico", level: 2 },
          { code: cachesInfo.code, name: cachesInfo.name, level: 3 },
        ]
      : [
          { code: "2", name: "Custos do Evento", level: 1 },
          { code: "2.1", name: "Artístico", level: 2 },
          { code: "2.1.01", name: "Cachês", level: 3 },
        ];
    const path = ensurePath(expTree, chain);
    for (const node of path) node.fBase += totalCacheAmount;
  }

  // Injecção Bilheteira → tree de receitas (previsto + real)
  if (ticketForecastNet > 0 || totalTicketActualNet > 0 || ticketForecastIva > 0 || totalTicketActualIva > 0) {
    const bilhInfo = Object.values(lookup).find((l) => l.name.toLowerCase().includes("bilhete"));
    const chain: Array<{ code: string; name: string; level: 1 | 2 | 3 }> = bilhInfo
      ? buildChain(bilhInfo)
      : [
          { code: "0", name: "Receitas", level: 1 },
          { code: "0.0", name: "Bilheteira", level: 2 },
          { code: "0.0.01", name: "Bilheteira", level: 3 },
        ];
    const path = ensurePath(incTree, chain);
    for (const node of path) {
      node.fBase += ticketForecastNet;
      node.fIva += ticketForecastIva;
      node.tBase += totalTicketActualNet;
      node.tIva += totalTicketActualIva;
    }
  }

  // Totais globais a partir da árvore (bate com os cards da app)
  const sumRoots = (tree: Map<string, TreeNode>) => {
    let fB = 0, fI = 0, tB = 0, tI = 0;
    tree.forEach((n) => { fB += n.fBase; fI += n.fIva; tB += n.tBase; tI += n.tIva; });
    return { fB, fI, tB, tI };
  };
  const incT = sumRoots(incTree);
  const expT = sumRoots(expTree);
  const totalFIncBase = incT.fB, totalFIncIva = incT.fI;
  const totalTIncBase = incT.tB, totalTIncIva = incT.tI;
  const totalFExpBase = expT.fB, totalFExpIva = expT.fI;
  const totalTExpBase = expT.tB, totalTExpIva = expT.tI;

  const lines: PLLine[] = [];
  const ticketInsertRef = { done: false };

  const emitNode = (n: TreeNode, out: PLLine[], type: "income" | "expense") => {
    // Corta pela profundidade escolhida: se este nó excede o level, não emite (mas
    // os seus valores já estão agregados no pai — já foram emitidos).
    if (n.level > level) return;
    const label = `${n.code} · ${n.name}`;
    const line = pl({
      label,
      forecast: n.fBase,
      actual: n.tBase,
      variance: n.tBase - n.fBase,
      forecastIva: n.fIva,
      forecastTotal: n.fBase + n.fIva,
      actualIva: n.tIva,
      actualTotal: n.tBase + n.tIva,
    });
    line.hierLevel = n.level;
    out.push(line);

    // "Folha de emissão": ou atingiu o level máximo, ou não tem filhos mais fundos.
    const isEmitLeaf = n.level >= level || n.children.size === 0;
    if (isEmitLeaf) {
      line.categoryName = n.name;
      if (!expandForecasts) {
        const meta = readMeta(type, n.code, n.name);
        line.specification = meta.specification;
        line.formalidade = meta.formalidade;
      }
      const cnt = overrideByCatName[n.name];
      if (cnt) line.overrideCount = cnt;
      // Sub-linhas da bilheteira (por zona/lote) inseridas depois do L3 "Bilheteira"
      if (type === "income" && n.name.toLowerCase().includes("bilhete") && ticketLines.length > 0 && !ticketInsertRef.done) {
        ticketLines.forEach((tl) => out.push(tl));
        ticketInsertRef.done = true;
      }
      pushForecastChildren(out, type, n.code, n.name);
      return;
    }
    // Recurse (filhos por ordem hierárquica)
    const kids = [...n.children.values()].sort((a, b) => compareReportCodesUnclassifiedLast(a.code, b.code));
    for (const k of kids) emitNode(k, out, type);
  };

  const emitTree = (root: Map<string, TreeNode>, out: PLLine[], type: "income" | "expense") => {
    const roots = [...root.values()].sort((a, b) => compareReportCodesUnclassifiedLast(a.code, b.code));
    for (const r of roots) emitNode(r, out, type);
  };

  // Build override tracking (por nome de categoria — mantém comportamento anterior)
  const overrideByCatName: Record<string, number> = {};
  transactions.filter((t: any) => t.pl_override_note).forEach((t: any) => {
    const catInfo = lookup[t.category_id];
    const catName = catInfo?.name ?? "Sem categoria";
    overrideByCatName[catName] = (overrideByCatName[catName] || 0) + 1;
  });

  if (showIncome) {
    lines.push(pl({
      label: "RECEITAS",
      forecast: totalFIncBase,
      actual: totalTIncBase,
      variance: totalTIncBase - totalFIncBase,
      isTotal: true,
      forecastIva: totalFIncIva,
      forecastTotal: totalFIncBase + totalFIncIva,
      actualIva: totalTIncIva,
      actualTotal: totalTIncBase + totalTIncIva,
    }));
    emitTree(incTree, lines, "income");
    if (!ticketInsertRef.done && ticketLines.length > 0) {
      ticketLines.forEach((tl) => lines.push(tl));
    }
  }

  if (showExpense) {
    lines.push(pl({
      label: "DESPESAS",
      forecast: totalFExpBase,
      actual: totalTExpBase,
      variance: totalTExpBase - totalFExpBase,
      isTotal: true,
      forecastIva: totalFExpIva,
      forecastTotal: totalFExpBase + totalFExpIva,
      actualIva: totalTExpIva,
      actualTotal: totalTExpBase + totalTExpIva,
    }));
    emitTree(expTree, lines, "expense");
  }

  if (showIncome && showExpense) {
    const fResBase = totalFIncBase - totalFExpBase;
    const fResIva = totalFIncIva - totalFExpIva;
    const tResBase = totalTIncBase - totalTExpBase;
    const tResIva = totalTIncIva - totalTExpIva;
    lines.push(pl({
      label: "RESULTADO LÍQUIDO",
      forecast: fResBase,
      actual: tResBase,
      variance: tResBase - fResBase,
      isGrandTotal: true,
      forecastIva: fResIva,
      forecastTotal: fResBase + fResIva,
      actualIva: tResIva,
      actualTotal: tResBase + tResIva,
    }));
  }

  return lines;
}

const CURRENCY_FMT = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
const INT_FMT = '#,##0';

function safeSheetName(name: string): string {
  return name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
}

function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function exportPLToExcel(
  eventsToExport: any[], allEvents: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], ticketSales: any[] = [], mode: PLMode = "comparison",
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = [],
  _auditLogs: any[] = [], typeFilter: PLTypeFilter = "both", accountLevel: AccountLevel = 2,
  companyDisplayName: string = "MP Gestão Eventos",
  includeOverhead: boolean = false,
  scenarioName: string | null = null,
  expandForecasts: boolean = false,
  hideOverheadTag: boolean = false,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyDisplayName;
  wb.created = new Date();
  const isComparison = mode === "comparison";
  const hierarchy = buildEventHierarchyMaps(allEvents);
  const generatedAt = fmtDateTime(new Date());

  const baseTitle = isComparison ? "Business Plan — Previsão vs Realizado" : "Business Plan — Previsão";
  const titleFull = scenarioName ? `${baseTitle} · Cenário ${scenarioName}` : baseTitle;

  // ---------- helpers de estilo ----------
  const applyHeaderBand = (ws: ExcelJS.Worksheet, row: number, colCount: number) => {
    const r = ws.getRow(row);
    for (let c = 1; c <= colCount; c++) {
      const cell = r.getCell(c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF1F2937" } },
        bottom: { style: "thin", color: { argb: "FF1F2937" } },
        left: { style: "thin", color: { argb: "FF1F2937" } },
        right: { style: "thin", color: { argb: "FF1F2937" } },
      };
    }
    r.height = 22;
  };

  const setCurrencyRow = (ws: ExcelJS.Worksheet, row: number, valueCols: number[]) => {
    valueCols.forEach((c) => {
      const cell = ws.getRow(row).getCell(c);
      cell.numFmt = CURRENCY_FMT;
      cell.alignment = { ...(cell.alignment || {}), horizontal: "right" };
    });
  };

  // ---------- Folha "Resumo" ----------
  if (typeFilter === "both") {
    const ws = wb.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 6 }] });

    ws.mergeCells(1, 1, 1, isComparison ? 8 : 4);
    const t = ws.getCell(1, 1);
    t.value = titleFull;
    t.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
    t.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 26;

    ws.getCell(2, 1).value = `Empresa: ${companyDisplayName}`;
    ws.getCell(3, 1).value = `Gerado em: ${generatedAt}`;
    ws.getCell(4, 1).value = `Nível de detalhe: N${accountLevel}${hideOverheadTag ? "" : (includeOverhead ? " · Com overhead" : " · Sem overhead")}`;
    [2, 3, 4].forEach((r) => {
      ws.getCell(r, 1).font = { color: { argb: "FF475569" }, italic: true };
    });

    const headerRow = 6;
    const header = isComparison
      ? ["Evento", "Receita Prev.", "Receita Real", "Despesa Prev.", "Despesa Real", "Resultado Prev.", "Resultado Real", "Variação"]
      : ["Evento", "Receita Prev.", "Despesa Prev.", "Resultado Prev."];
    ws.getRow(headerRow).values = header;
    applyHeaderBand(ws, headerRow, header.length);

    let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;
    let r = headerRow + 1;

    eventsToExport.forEach((evt) => {
      const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
      let fInc = evtF.filter((f: any) => f.type === "income" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const fExpBase = evtF.filter((f: any) => f.type === "expense" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
      const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
      let ticketActualNet = 0;
      evtZones.forEach((zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        zoneLots.forEach((lot: any) => {
          const ivaRate = Number(lot.iva_rate ?? 6);
          const netPrice = Number(lot.price) / (1 + ivaRate / 100);
          fInc += netPrice * Number(lot.quantity);
          const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
          ticketActualNet += lotSales.reduce((sum: number, sl: any) => {
            const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
            return sum + Number(sl.quantity) * saleNet;
          }, 0);
        });
      });
      const evtTicketNet = evtZones.reduce((sum: number, zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        return sum + zoneLots.reduce((lotSum: number, lot: any) => {
          const ivaRate = Number(lot.iva_rate ?? 6);
          return lotSum + Number(lot.quantity) * (Number(lot.price) / (1 + ivaRate / 100));
        }, 0);
      }, 0);
      const evtTicketGross = evtZones.reduce((sum: number, zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        return sum + zoneLots.reduce((lotSum: number, lot: any) => lotSum + Number(lot.quantity) * Number(lot.price), 0);
      }, 0);
      const cachePLLines = calculateCacheLinesForPL(
        cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
        cacheDeductions,
        evtTicketNet,
        evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
        evtTicketGross
      );
      const totalCache = cachePLLines.reduce((s, c) => s + c.amount, 0);
      const fExp = fExpBase + totalCache;
      const totalTInc = tInc + ticketActualNet;
      gFInc += fInc; gFExp += fExp; gTInc += totalTInc; gTExp += tExp;

      const row = isComparison
        ? [evt.name, fInc, totalTInc, fExp, tExp, fInc - fExp, totalTInc - tExp, (totalTInc - tExp) - (fInc - fExp)]
        : [evt.name, fInc, fExp, fInc - fExp];
      ws.getRow(r).values = row;
      setCurrencyRow(ws, r, isComparison ? [2, 3, 4, 5, 6, 7, 8] : [2, 3, 4]);
      r++;
    });

    // Total
    const totalRow = ws.getRow(r + 1);
    totalRow.values = isComparison
      ? ["TOTAL", gFInc, gTInc, gFExp, gTExp, gFInc - gFExp, gTInc - gTExp, (gTInc - gTExp) - (gFInc - gFExp)]
      : ["TOTAL", gFInc, gFExp, gFInc - gFExp];
    totalRow.font = { bold: true };
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = { top: { style: "medium", color: { argb: "FF334155" } } };
    });
    setCurrencyRow(ws, r + 1, isComparison ? [2, 3, 4, 5, 6, 7, 8] : [2, 3, 4]);

    ws.columns = (isComparison
      ? [30, 16, 16, 16, 16, 16, 16, 16]
      : [30, 16, 16, 16]
    ).map((w) => ({ width: w }));
  }

  // ---------- Folha por evento ----------
  eventsToExport.forEach((evt) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    if (evtF.length === 0 && evtT.length === 0) return;
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const plLines = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, ticketSales, evt.id, cacheConfigs, cacheDeductions, relevantEventIds, typeFilter, accountLevel, includeOverhead, expandForecasts);

    // Nova ordem: Rubrica | Especificação | Qtd | Preço Unit. | Valor s/IVA | IVA | Total | (comparação: Real s/IVA | IVA Real | Total Real | Variação) | Formalidade
    const header = isComparison
      ? ["Rubrica", "Especificação", "Qtd", "Preço Unit. (€)", "Valor s/ IVA", "IVA", "Total", "Real s/ IVA", "IVA Real", "Total Real", "Variação", "Formalidade"]
      : ["Rubrica", "Especificação", "Qtd", "Preço Unit. (€)", "Valor s/ IVA", "IVA", "Total", "Formalidade"];
    const nCols = header.length;
    // Colunas de moeda (Preço Unit. + valores s/IVA/IVA/Total + reais/variação)
    const valueCols = isComparison ? [4, 5, 6, 7, 8, 9, 10, 11] : [4, 5, 6, 7];
    const qtyCol = 3;
    const formalidadeCol = isComparison ? 12 : 8;
    const specCol = 2;

    const ws = wb.addWorksheet(safeSheetName(evt.name), { views: [{ state: "frozen", ySplit: 7 }] });

    // Cabeçalho documento
    ws.mergeCells(1, 1, 1, nCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `Business Plan — ${evt.name}`;
    titleCell.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 26;

    const contextBits: string[] = [];
    if (evt.date) contextBits.push(`Data: ${evt.date}`);
    if (evt.location) contextBits.push(`Local: ${evt.location}`);
    if (scenarioName) contextBits.push(`Cenário: ${scenarioName}`);
    contextBits.push(`Nível: N${accountLevel}`);
    contextBits.push(includeOverhead ? "Com overhead" : "Sem overhead");
    contextBits.push(expandForecasts ? "Detalhe: Linha a linha" : "Detalhe: Agregado");
    ws.mergeCells(2, 1, 2, nCols);
    ws.getCell(2, 1).value = contextBits.join("  ·  ");
    ws.getCell(2, 1).font = { color: { argb: "FF475569" } };

    ws.mergeCells(3, 1, 3, nCols);
    ws.getCell(3, 1).value = `Empresa: ${companyDisplayName}  ·  Gerado em: ${generatedAt}`;
    ws.getCell(3, 1).font = { italic: true, color: { argb: "FF64748B" }, size: 10 };

    const headerRow = 6;
    ws.getRow(headerRow).values = header;
    applyHeaderBand(ws, headerRow, nCols);

    // Linhas
    let r = headerRow + 1;
    plLines.forEach((line) => {
      const row = ws.getRow(r);
      const overrideSuffix = (line.overrideCount ?? 0) > 0 ? ` ⚠ (${line.overrideCount} fora do BP)` : "";
      let label = line.label + overrideSuffix;
      let indent = 0;
      if (line.isGrandTotal) indent = 0;
      else if (line.isTotal) indent = 0;
      else if (line.hierLevel === 1) indent = 1;
      else if (line.hierLevel === 2) indent = 2;
      else if (line.hierLevel === 3) indent = 3;
      else if (line.isGroupHeader) indent = 1;
      else if (line.indent) indent = 2;
      else if (line.subIndent) indent = 4;

      if (line.isTotal || line.isGrandTotal) label = label.toUpperCase();

      // Especificação e Formalidade só em linhas L3 (aggregate) ou lançamentos (subIndent),
      // nunca em L1/L2/totais/subtotais especiais.
      const isDetail = !line.isTotal && !line.isGrandTotal && !line.isGroupHeader && !line.isSubTotal
                       && line.hierLevel !== 1 && line.hierLevel !== 2;
      const specValue = isDetail && line.specification ? line.specification : "";
      const formRaw = isDetail && line.formalidade ? line.formalidade : "";
      const formLabel = formRaw ? (FORMALIDADE_LABEL[formRaw] ?? formRaw) : "";

      const cells = isComparison
        ? [label, specValue, line.quantity ?? null, line.unitPrice ?? null, line.forecast, line.forecastIva, line.forecastTotal, line.actual, line.actualIva, line.actualTotal, line.variance, formLabel]
        : [label, specValue, line.quantity ?? null, line.unitPrice ?? null, line.forecast, line.forecastIva, line.forecastTotal, formLabel];
      row.values = cells;

      valueCols.forEach((c) => {
        const cell = row.getCell(c);
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: "right" };
      });
      const qtyCell = row.getCell(qtyCol);
      if (typeof qtyCell.value === "number") {
        qtyCell.numFmt = INT_FMT;
        qtyCell.alignment = { horizontal: "right" };
      }

      row.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent };
      row.getCell(specCol).alignment = { vertical: "middle", horizontal: "left", wrapText: false };
      row.getCell(formalidadeCol).alignment = { vertical: "middle", horizontal: "center" };

      // Cor do texto da formalidade (badge-like)
      if (formRaw) {
        const color =
          formRaw === "pago_total" ? "FF15803D" :
          formRaw === "pago_parcial" ? "FF15803D" :
          formRaw === "fechado" ? "FF1D4ED8" :
          formRaw === "negociacao" ? "FFB45309" :
          "FF64748B";
        row.getCell(formalidadeCol).font = { color: { argb: color }, bold: formRaw === "pago_total" || formRaw === "fechado" };
      }

      if (line.isGrandTotal) {
        row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
          cell.border = { top: { style: "medium", color: { argb: "FF0F172A" } }, bottom: { style: "medium", color: { argb: "FF0F172A" } } };
        });
        row.height = 22;
      } else if (line.isTotal) {
        row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
          cell.border = { top: { style: "medium", color: { argb: "FF0F172A" } }, bottom: { style: "medium", color: { argb: "FF0F172A" } } };
        });
        row.height = 22;
      } else if (line.hierLevel === 1) {
        row.font = { bold: true, color: { argb: "FF0F172A" }, size: 12 };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCBD5E1" } };
          cell.border = { top: { style: "medium", color: { argb: "FF334155" } }, bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
        });
        row.height = 20;
      } else if (line.hierLevel === 2) {
        row.font = { bold: true, color: { argb: "FF0F172A" } };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        });
      } else if (line.hierLevel === 3) {
        row.font = { bold: true, color: { argb: "FF1F2937" } };
      } else if (line.isGroupHeader) {
        row.font = { bold: true, color: { argb: "FF0F172A" } };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        });
      } else if (line.isSubTotal) {
        row.font = { bold: true, italic: true, color: { argb: "FF334155" } };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };
        });
      } else if (line.indent) {
        row.font = { color: { argb: "FF1F2937" } };
      } else if (line.subIndent) {
        row.font = { color: { argb: "FF475569" }, size: 10 };
      }


      r++;
    });

    // Larguras: Rubrica | Espec | Qtd | PU | s/IVA | IVA | Total | [Real s/IVA | IVA Real | Total Real | Variação] | Formalidade
    ws.columns = (isComparison
      ? [42, 30, 8, 14, 16, 12, 16, 16, 12, 16, 16, 16]
      : [42, 30, 8, 14, 16, 12, 16, 16]
    ).map((w) => ({ width: w }));

    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: nCols },
    };
  });

  const filterSuffix = typeFilter === "both" ? "" : typeFilter === "income" ? "_Receitas" : "_Despesas";
  const singleEventSuffix = eventsToExport.length === 1 ? `_${safeSheetName(eventsToExport[0].name).replace(/\s+/g, "-")}` : "";
  const filename = `BP${singleEventSuffix}_N${accountLevel}${filterSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


export function exportPLToPDF(
  eventsToExport: any[], allEvents: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], ticketSales: any[] = [], mode: PLMode = "comparison",
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = [],
  auditLogs: any[] = [], typeFilter: PLTypeFilter = "both", accountLevel: AccountLevel = 2,
  companyLogoDataUrl: string | null = null,
  companyDisplayName: string = "MP Gestão Eventos",
  includeOverhead: boolean = false,
  scenarioName: string | null = null,
  expandForecasts: boolean = false
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 14;
  const isComparison = mode === "comparison";
  const hierarchy = buildEventHierarchyMaps(allEvents);

  const colWidths = isComparison
    ? [contentWidth * 0.18, contentWidth * 0.06, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.11, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.08]
    : [contentWidth * 0.30, contentWidth * 0.10, contentWidth * 0.14, contentWidth * 0.18, contentWidth * 0.12, contentWidth * 0.16];
  const colX = [marginLeft];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

  function checkNewPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 14;
    }
  }

  function drawTableHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(marginLeft, y, contentWidth, 8, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Rubrica", colX[0] + 2, y + 5.5);
    doc.text("Qtd", colX[1] + colWidths[1] - 2, y + 5.5, { align: "right" });
    doc.text("Preço Unit.", colX[2] + colWidths[2] - 2, y + 5.5, { align: "right" });
    doc.text("Valor s/ IVA", colX[3] + colWidths[3] - 2, y + 5.5, { align: "right" });
    doc.text("IVA (€)", colX[4] + colWidths[4] - 2, y + 5.5, { align: "right" });
    doc.text("Total (€)", colX[5] + colWidths[5] - 2, y + 5.5, { align: "right" });
    if (isComparison) {
      doc.text("Real s/ IVA", colX[6] + colWidths[6] - 2, y + 5.5, { align: "right" });
      doc.text("IVA Real", colX[7] + colWidths[7] - 2, y + 5.5, { align: "right" });
      doc.text("Total Real", colX[8] + colWidths[8] - 2, y + 5.5, { align: "right" });
      doc.text("Variação", colX[9] + colWidths[9] - 2, y + 5.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  function fmtVal(v: number): string {
    return formatCurrency(v);
  }

  try {
    const logoSrc = companyLogoDataUrl ?? logoHorizontal;
    // Try to detect format from data URL; fall back to PNG
    const fmt = typeof logoSrc === "string" && logoSrc.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(logoSrc, fmt as any, marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  const filterLabel = typeFilter === "income" ? " · Apenas Receitas" : typeFilter === "expense" ? " · Apenas Despesas" : "";
  const levelLabel = ` · Nível ${accountLevel}`;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const baseTitle = isComparison ? "Relatório Business Plan — Previsão vs Realizado" : "Relatório Business Plan — Previsão";
  doc.text(scenarioName ? `${baseTitle} — Cenário ${scenarioName}` : baseTitle, marginLeft, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`${companyDisplayName} · Gerado em ${new Date().toLocaleDateString("pt-PT")}${filterLabel}${levelLabel}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  eventsToExport.forEach((evt, evtIdx) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    if (evtF.length === 0 && evtT.length === 0) return;
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const plLines = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, ticketSales, evt.id, cacheConfigs, cacheDeductions, relevantEventIds, typeFilter, accountLevel, includeOverhead, expandForecasts);

    if (evtIdx > 0) {
      doc.addPage();
      y = 14;
    }

    doc.setFillColor(60, 60, 80);
    doc.roundedRect(marginLeft, y, contentWidth, 10, 1, 1, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`BP — ${evt.name}`, marginLeft + 4, y + 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${evtF.length} previsões · ${evtT.length} transações`, pageWidth - marginRight - 4, y + 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 14;

    drawTableHeader();

    plLines.forEach((line) => {
      checkNewPage(8);
      const rowH = line.subIndent ? 6 : 7;

      if (line.isGrandTotal) {
        doc.setFillColor(15, 23, 42);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
      } else if (line.isTotal) {
        doc.setFillColor(51, 65, 85);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
      } else if (line.hierLevel === 1) {
        doc.setFillColor(203, 213, 225);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
      } else if (line.hierLevel === 2) {
        doc.setFillColor(226, 232, 240);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
      } else if (line.hierLevel === 3) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
      } else if (line.isGroupHeader) {
        doc.setFillColor(245, 245, 250);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
      } else if (line.isSubTotal) {
        doc.setFillColor(242, 242, 248);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(80, 80, 80);
      } else if (line.subIndent) {
        doc.setFillColor(248, 248, 252);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(120, 120, 120);
      } else if ((line.overrideCount ?? 0) > 0) {
        doc.setFillColor(255, 250, 230);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFillColor(245, 180, 50);
        doc.rect(marginLeft, y - 1, 1.5, rowH + 1, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
      }

      const pad = "  ";
      const indentLevel =
        line.isGrandTotal || line.isTotal ? 0 :
        line.hierLevel === 1 ? 1 :
        line.hierLevel === 2 ? 2 :
        line.hierLevel === 3 ? 3 :
        line.subIndent ? 4 :
        line.isGroupHeader ? 1 :
        line.indent ? 2 : 0;
      const label = pad.repeat(indentLevel) + line.label;

      const overrideSuffix = (line.overrideCount ?? 0) > 0 ? ` [${line.overrideCount} fora do BP]` : "";
      doc.text(label, colX[0] + 2, y + 4);
      if (overrideSuffix) {
        const labelWidth = doc.getTextWidth(label);
        doc.setFontSize(5);
        doc.setTextColor(180, 120, 0);
        doc.text(overrideSuffix, colX[0] + 2 + labelWidth + 1, y + 4);
        doc.setFontSize(6.5);
        doc.setTextColor(0, 0, 0);
      }

      if (line.quantity != null) {
        doc.text(line.quantity.toLocaleString("pt-PT"), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });
      }
      if (line.unitPrice != null) {
        doc.text(fmtVal(line.unitPrice), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
      }

      const showAbs = !line.isGrandTotal;
      doc.text(fmtVal(showAbs ? Math.abs(line.forecast) : line.forecast), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });

      if (!line.subIndent && !line.isSubTotal && !line.isTotal && !line.isGrandTotal && !line.isGroupHeader && !line.indent) {
        doc.text("—", colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
        doc.text("—", colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
      } else {
        doc.text(fmtVal(showAbs ? Math.abs(line.forecastIva) : line.forecastIva), colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.forecastTotal) : line.forecastTotal), colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
      }

      if (isComparison) {
        doc.text(fmtVal(showAbs ? Math.abs(line.actual) : line.actual), colX[6] + colWidths[6] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.actualIva) : line.actualIva), colX[7] + colWidths[7] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.actualTotal) : line.actualTotal), colX[8] + colWidths[8] - 2, y + 4, { align: "right" });
        const v = line.variance;
        if (line.isGrandTotal || line.isTotal) {
          doc.setTextColor(v >= 0 ? 34 : 200, v >= 0 ? 139 : 50, v >= 0 ? 34 : 50);
        }
        doc.text((v >= 0 ? "+" : "") + fmtVal(v), colX[9] + colWidths[9] - 2, y + 4, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);

      y += rowH;

      // Render audit logs for this category if requested
      if (auditLogs.length > 0 && line.categoryName && !line.isTotal && !line.isGrandTotal && !line.isGroupHeader && !line.isSubTotal && !line.subIndent) {
        const catForecasts = evtF.filter((f: any) => {
          const cat = categories.find((c: any) => c.id === f.category_id);
          return cat?.name === line.categoryName;
        });
        const forecastIds = catForecasts.map((f: any) => f.id);
        const lineLogs = auditLogs.filter((log: any) => forecastIds.includes(log.forecast_id));
        if (lineLogs.length > 0) {
          lineLogs.forEach((log: any) => {
            checkNewPage(6);
            doc.setFillColor(245, 245, 255);
            doc.rect(marginLeft, y - 1, contentWidth, 5, "F");
            doc.setFillColor(100, 100, 200);
            doc.rect(marginLeft, y - 1, 1, 5, "F");
            doc.setFont("helvetica", "italic");
            doc.setFontSize(5);
            doc.setTextColor(100, 100, 130);
            const logDate = new Date(log.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
            const logText = `${logDate} | ${log.field_name}: ${log.old_value} → ${log.new_value}${log.observation ? ` — "${log.observation}"` : ""} (por ${log.changed_by})`;
            doc.text(`          ${logText}`, colX[0] + 2, y + 2.5);
            doc.setTextColor(0, 0, 0);
            y += 5;
          });
        }
      }
    });


    y += 8;
  });

  // Resumo Geral só em "Ambos" — Resultado não faz sentido com apenas 1 lado
  if (typeFilter === "both") {
    doc.addPage();
    y = 14;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Geral", marginLeft, y);
    y += 10;

    let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;
    eventsToExport.forEach((evt) => {
      const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
      let evtFInc = evtF.filter((f: any) => f.type === "income" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const evtFExpBase = evtF.filter((f: any) => f.type === "expense" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
      const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
      let ticketActualRevNet = 0;
      let ticketForecastNet = 0;
      let ticketForecastGross = 0;
      evtZones.forEach((zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        zoneLots.forEach((lot: any) => {
          const ivaRate = Number(lot.iva_rate ?? 6);
          const netPrice = Number(lot.price) / (1 + ivaRate / 100);
          const lotForecastNet = netPrice * Number(lot.quantity);
          evtFInc += lotForecastNet;
          ticketForecastNet += lotForecastNet;
          ticketForecastGross += Number(lot.price) * Number(lot.quantity);
          const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
          ticketActualRevNet += lotSales.reduce((sum: number, sl: any) => {
            const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
            return sum + Number(sl.quantity) * saleNet;
          }, 0);
        });
      });
      const totalCache = calculateCacheLinesForPL(
        cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
        cacheDeductions,
        ticketForecastNet,
        evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
        ticketForecastGross
      ).reduce((sum, line) => sum + line.amount, 0);
      gFInc += evtFInc;
      gFExp += evtFExpBase + totalCache;
      gTInc += evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0) + ticketActualRevNet;
      gTExp += evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    });

    const numSumCols = isComparison ? 5 : 4;
    const sumColW = contentWidth / numSumCols;
    doc.setFillColor(30, 30, 40);
    doc.rect(marginLeft, y, contentWidth, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Evento", marginLeft + 2, y + 5.5);
    doc.text("Receitas Prev.", marginLeft + sumColW * 2 - 2, y + 5.5, { align: "right" });
    doc.text("Despesas Prev.", marginLeft + sumColW * 3 - 2, y + 5.5, { align: "right" });
    doc.text("Resultado Prev.", marginLeft + sumColW * 4 - 2, y + 5.5, { align: "right" });
    if (isComparison) {
      doc.text("Resultado Real", marginLeft + sumColW * 5 - 2, y + 5.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 10;

    eventsToExport.forEach((evt) => {
      const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
      let evtFInc = evtF.filter((f: any) => f.type === "income" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const evtFExpBase = evtF.filter((f: any) => f.type === "expense" && (includeOverhead || !f.is_overhead)).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const evtTInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const evtTExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
      const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
      let ticketActualNet = 0;
      let ticketForecastNet = 0;
      let ticketForecastGross2 = 0;
      evtZones.forEach((zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        zoneLots.forEach((lot: any) => {
          const ivaRate = Number(lot.iva_rate ?? 6);
          const netPrice = Number(lot.price) / (1 + ivaRate / 100);
          const lotForecastNet = netPrice * Number(lot.quantity);
          evtFInc += lotForecastNet;
          ticketForecastNet += lotForecastNet;
          ticketForecastGross2 += Number(lot.price) * Number(lot.quantity);
          const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
          ticketActualNet += lotSales.reduce((sum: number, sl: any) => {
            const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
            return sum + Number(sl.quantity) * saleNet;
          }, 0);
        });
      });
      const evtFExp = evtFExpBase + calculateCacheLinesForPL(
        cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
        cacheDeductions,
        ticketForecastNet,
        evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) })),
        ticketForecastGross2
      ).reduce((sum, line) => sum + line.amount, 0);
      const fResult = evtFInc - evtFExp;
      const tResult = (evtTInc + ticketActualNet) - evtTExp;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(evt.name, marginLeft + 2, y + 4);
      doc.text(fmtVal(evtFInc), marginLeft + sumColW * 2 - 2, y + 4, { align: "right" });
      doc.text(fmtVal(evtFExp), marginLeft + sumColW * 3 - 2, y + 4, { align: "right" });
      doc.setTextColor(fResult >= 0 ? 34 : 200, fResult >= 0 ? 139 : 50, fResult >= 0 ? 34 : 50);
      doc.text(fmtVal(fResult), marginLeft + sumColW * 4 - 2, y + 4, { align: "right" });
      if (isComparison) {
        doc.setTextColor(tResult >= 0 ? 34 : 200, tResult >= 0 ? 139 : 50, tResult >= 0 ? 34 : 50);
        doc.text(fmtVal(tResult), marginLeft + sumColW * 5 - 2, y + 4, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);
      y += 7;
    });

    y += 2;
    doc.setFillColor(230, 240, 255);
    doc.rect(marginLeft, y - 1, contentWidth, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TOTAL", marginLeft + 2, y + 5);
    doc.text(fmtVal(gFInc), marginLeft + sumColW * 2 - 2, y + 5, { align: "right" });
    doc.text(fmtVal(gFExp), marginLeft + sumColW * 3 - 2, y + 5, { align: "right" });
    const gFRes = gFInc - gFExp;
    doc.setTextColor(gFRes >= 0 ? 34 : 200, gFRes >= 0 ? 139 : 50, gFRes >= 0 ? 34 : 50);
    doc.text(fmtVal(gFRes), marginLeft + sumColW * 4 - 2, y + 5, { align: "right" });
    if (isComparison) {
      const gTRes = gTInc - gTExp;
      doc.setTextColor(gTRes >= 0 ? 34 : 200, gTRes >= 0 ? 139 : 50, gTRes >= 0 ? 34 : 50);
      doc.text(fmtVal(gTRes), marginLeft + sumColW * 5 - 2, y + 5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
  }


  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("MP Gestão Eventos - Relatório Business Plan", marginLeft, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }

  doc.save(`BP_Relatorio_${new Date().toISOString().slice(0, 10)}.pdf`);
}
