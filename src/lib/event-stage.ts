/**
 * P3 — UI dos estágios dos eventos (D-ERP318/319).
 * Módulo puro: tipos, etiquetas pt-PT, variantes de badge, leitura da
 * checklist do servidor, mapeamento de erros e visibilidade das ações.
 * A decisão final é sempre do servidor (RPCs P1/P1b).
 */

export const EVENT_STAGES = ["planeamento", "em_curso", "em_fecho", "fechado", "historico", "cancelado"] as const;
export type EventStage = (typeof EVENT_STAGES)[number];

export const STAGE_LABELS: Record<EventStage, string> = {
  planeamento: "Planeamento",
  em_curso: "Em curso",
  em_fecho: "Em fecho",
  fechado: "Fechado",
  historico: "Histórico",
  cancelado: "Cancelado",
};

/** Classes de tokens semânticos para o badge. */
export const STAGE_BADGE_CLASSES: Record<EventStage, string> = {
  planeamento: "bg-secondary text-secondary-foreground border-border",
  em_curso: "bg-primary/15 text-primary border-primary/30",
  em_fecho: "bg-warning/15 text-warning border-warning/30",
  fechado: "bg-success/15 text-success border-success/30",
  historico: "bg-muted text-muted-foreground border-border",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
};

export function isEventStage(v: unknown): v is EventStage {
  return typeof v === "string" && (EVENT_STAGES as readonly string[]).includes(v);
}

export function stageLabel(stage: string | null | undefined): string {
  return isEventStage(stage) ? STAGE_LABELS[stage] : "—";
}

/** Converte o resultado de event_stage_list num mapa event_id → estágio. */
export function stageMapFromRows(rows: { event_id: string; stage: string }[] | null | undefined): Record<string, EventStage> {
  const m: Record<string, EventStage> = {};
  for (const r of rows ?? []) if (r?.event_id && isEventStage(r.stage)) m[r.event_id] = r.stage;
  return m;
}

/** Filtro da lista: oculta históricos salvo pedido; aplica filtro por estágios (vazio = todos). */
export function filterEventsByStage<T extends { id: string }>(
  events: T[],
  stages: Record<string, EventStage>,
  opts: { showHistorical: boolean; selected?: EventStage[] },
): T[] {
  const sel = opts.selected ?? [];
  return events.filter((e) => {
    const st = stages[e.id];
    if (!opts.showHistorical && st === "historico") return false;
    if (sel.length > 0 && (!st || !sel.includes(st))) return false;
    return true;
  });
}

// ---------- Checklist ----------

export interface ChecklistBlock {
  key: "settlements" | "cache" | "bp_lines" | "hard_blockers";
  title: string;
  ok: boolean;
  detail: string;
  items?: string[];
}

export interface ParsedChecklist {
  ok: boolean;
  blocks: ChecklistBlock[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const arrLen = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

const HARD_LABELS: Record<string, string> = {
  card_sessions: "Sessões de cartão por fechar",
  camarim_sessions: "Sessões de camarim por fechar",
  circuit_accounts: "Contas de circuito por regularizar",
};

export function formatEur(n: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
}

/** Lê o jsonb de event_close_checklist. Falha fechada: blocos ausentes contam como pendentes. */
export function parseChecklist(raw: unknown): ParsedChecklist {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, any>;
  const s = r.settlements ?? {};
  const c = r.cache ?? {};
  const b = r.bp_lines ?? {};
  const h = r.hard_blockers ?? {};
  const unsealed = num(s.unsealed_or_missing_snapshot);
  const total = num(s.total);
  const unfrozen = num(c.unfrozen);
  const targets = num(c.configured_targets);
  const bpCount = num(b.count);
  const hardValues = (h.values && typeof h.values === "object" ? h.values : {}) as Record<string, unknown>;
  const hardItems = Object.entries(hardValues)
    .filter(([, v]) => arrLen(v) > 0)
    .map(([k, v]) => `${HARD_LABELS[k] ?? k}: ${arrLen(v)}`);
  const hardCount = num(h.count);

  const blocks: ChecklistBlock[] = [
    {
      key: "settlements",
      title: "Selos dos fechamentos",
      ok: s.ok === true,
      detail: total === 0 ? "Sem fechamentos de sócios" : `${total - unsealed}/${total} selados · ${unsealed} por fazer`,
    },
    {
      key: "cache",
      title: "Cachê congelado",
      ok: c.ok === true,
      detail: targets === 0 ? "Sem cachê configurado" : `${targets - unfrozen}/${targets} congelados · ${unfrozen} por congelar`,
    },
    {
      key: "bp_lines",
      title: "Linhas do BP por rever",
      ok: b.ok === true,
      detail: bpCount === 0 ? "Nenhuma linha por rever" : `${bpCount} linhas · saldo ${formatEur(num(b.saldo_net))}`,
    },
    {
      key: "hard_blockers",
      title: "Bloqueios duros",
      ok: h.ok === true,
      detail: hardCount === 0 ? "Nenhum bloqueio" : `${hardCount} bloqueio(s)`,
      items: hardItems,
    },
  ];
  return { ok: r.ok === true && blocks.every((x) => x.ok), blocks };
}

// ---------- Erros ----------

export function mapStageError(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; details?: string };
  const msg = `${e.message ?? (typeof err === "string" ? err : "")} ${e.details ?? ""}`;
  if (/event_stage_act_on_master/.test(msg)) return "Este é um sub-evento: o estágio só pode ser alterado no evento master.";
  if (/event_close_checklist_failed/.test(msg)) return "Ainda há pendências na checklist do fecho. Resolva-as antes de fechar o evento.";
  if (/event_already_closed/.test(msg)) return "Este evento já está fechado.";
  if (/event_already_historical/.test(msg)) return "Este evento já está marcado como histórico.";
  if (/event_stage_close_invalid/.test(msg)) return "O estágio atual do evento não permite esta ação.";
  if (/reason|motivo/i.test(msg) && /required|obrigat|empty|vazio/i.test(msg)) return "Indique o motivo da reabertura.";
  if (e.code === "42501" || /permission|permiss|insufficient|not allowed|forbidden/i.test(msg))
    return "Não tem permissão para esta ação. Fale com um administrador.";
  return "Não foi possível concluir a ação. Tente novamente.";
}

// ---------- Visibilidade das ações ----------

export interface StageActionContext {
  stage: EventStage | null | undefined;
  isSubEvent: boolean;
  isAdmin: boolean;
  isManager: boolean;
  checklistOk: boolean;
}

export interface StageActions {
  showPanel: boolean;
  canClose: boolean;
  closeEnabled: boolean;
  canReopenClosure: boolean;
  canMarkHistorical: boolean;
  canUnmarkHistorical: boolean;
}

export function stageActions(ctx: StageActionContext): StageActions {
  const none: StageActions = { showPanel: false, canClose: false, closeEnabled: false, canReopenClosure: false, canMarkHistorical: false, canUnmarkHistorical: false };
  if (ctx.isSubEvent || !ctx.stage) return none;
  const st = ctx.stage;
  const staff = ctx.isAdmin || ctx.isManager;
  const canClose = staff && st === "em_fecho";
  return {
    showPanel: true,
    canClose,
    closeEnabled: canClose && ctx.checklistOk,
    canReopenClosure: ctx.isAdmin && st === "fechado",
    canMarkHistorical: ctx.isAdmin && st !== "historico" && st !== "cancelado",
    canUnmarkHistorical: ctx.isAdmin && st === "historico",
  };
}

/** Caminho legado "Reabrir Evento": bloqueado quando há carimbo de fecho/histórico. */
export function legacyReopenBlock(stage: EventStage | null | undefined): string | null {
  if (stage === "fechado") return "Evento fechado: use primeiro «Reabrir fecho» no painel Estágio e fecho.";
  if (stage === "historico") return "Evento histórico: use primeiro «Remover de histórico» no painel Estágio e fecho.";
  return null;
}
