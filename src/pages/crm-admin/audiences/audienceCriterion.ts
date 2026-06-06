export type CriterionField =
  | "has_email"
  | "has_phone"
  | "consent_email"
  | "consent_whatsapp"
  | "source"
  | "is_active"
  | "created_at"
  | "last_activity_at";

export type CriterionOp =
  | "eq"
  | "neq"
  | "in"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "last_n_days";

export type CriterionFilter = {
  field: CriterionField;
  op: CriterionOp;
  value: unknown;
};

export type Criterion = {
  match: "all" | "any";
  filters: CriterionFilter[];
};

export const EMPTY_CRITERION: Criterion = { match: "all", filters: [] };

export const FIELD_META: Record<
  CriterionField,
  {
    label: string;
    type: "bool" | "text" | "timestamp" | "computed";
    allowedOps: CriterionOp[];
  }
> = {
  has_email: { label: "Tem email", type: "computed", allowedOps: ["eq"] },
  has_phone: { label: "Tem telefone", type: "computed", allowedOps: ["eq"] },
  consent_email: { label: "Consente email", type: "bool", allowedOps: ["eq"] },
  consent_whatsapp: { label: "Consente WhatsApp", type: "bool", allowedOps: ["eq"] },
  source: { label: "Source", type: "text", allowedOps: ["eq", "neq", "in"] },
  is_active: { label: "Activo", type: "bool", allowedOps: ["eq"] },
  created_at: { label: "Criado em", type: "timestamp", allowedOps: ["gte", "lte", "last_n_days"] },
  last_activity_at: { label: "Última actividade", type: "timestamp", allowedOps: ["gte", "lte", "last_n_days"] },
};

export const OP_LABELS: Record<CriterionOp, string> = {
  eq: "é igual a",
  neq: "não é",
  in: "está em",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  last_n_days: "nos últimos N dias",
};

export function defaultFilterFor(field: CriterionField): CriterionFilter {
  const meta = FIELD_META[field];
  const op = meta.allowedOps[0];
  let value: unknown;
  switch (meta.type) {
    case "bool":
    case "computed":
      value = true;
      break;
    case "text":
      value = op === "in" ? [] : "";
      break;
    case "timestamp":
      value = op === "last_n_days" ? 30 : new Date().toISOString().slice(0, 10);
      break;
  }
  return { field, op, value };
}

function isoFromDateInput(v: unknown): string {
  if (typeof v !== "string") return new Date().toISOString();
  // assume YYYY-MM-DD
  return new Date(v + "T00:00:00").toISOString();
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/**
 * Apply Criterion filters to a PostgREST query builder
 * (chain match=all; for match=any builds a single .or())
 */
export function applyCriterion(query: any, criterion: Criterion): any {
  const { match, filters } = criterion;
  if (filters.length === 0) return query;

  if (match === "all") {
    let q = query;
    for (const f of filters) {
      q = applySingleAll(q, f);
    }
    return q;
  }

  // match=any → single .or with PostgREST syntax
  const parts: string[] = [];
  for (const f of filters) parts.push(...toOrParts(f));
  if (parts.length === 0) return query;
  return query.or(parts.join(","));
}

function applySingleAll(q: any, f: CriterionFilter): any {
  const { field, op, value } = f;
  switch (field) {
    case "has_email":
      return value ? q.not("email", "is", null) : q.is("email", null);
    case "has_phone":
      return value ? q.not("phone_e164", "is", null) : q.is("phone_e164", null);
    case "consent_email":
    case "consent_whatsapp":
    case "is_active":
      return q.eq(field, Boolean(value));
    case "source":
      if (op === "eq") return q.eq("source", value);
      if (op === "neq") return q.neq("source", value);
      if (op === "in") return q.in("source", Array.isArray(value) ? value : []);
      return q;
    case "created_at":
    case "last_activity_at": {
      if (op === "gte") return q.gte(field, isoFromDateInput(value));
      if (op === "lte") return q.lte(field, isoFromDateInput(value));
      if (op === "last_n_days") return q.gte(field, daysAgoIso(Number(value) || 0));
      return q;
    }
  }
}

function toOrParts(f: CriterionFilter): string[] {
  const { field, op, value } = f;
  switch (field) {
    case "has_email":
      return [value ? "email.not.is.null" : "email.is.null"];
    case "has_phone":
      return [value ? "phone_e164.not.is.null" : "phone_e164.is.null"];
    case "consent_email":
    case "consent_whatsapp":
    case "is_active":
      return [`${field}.eq.${Boolean(value)}`];
    case "source":
      if (op === "eq") return [`source.eq.${value}`];
      if (op === "neq") return [`source.neq.${value}`];
      if (op === "in") return [`source.in.(${(Array.isArray(value) ? value : []).join(",")})`];
      return [];
    case "created_at":
    case "last_activity_at":
      if (op === "gte") return [`${field}.gte.${isoFromDateInput(value)}`];
      if (op === "lte") return [`${field}.lte.${isoFromDateInput(value)}`];
      if (op === "last_n_days") return [`${field}.gte.${daysAgoIso(Number(value) || 0)}`];
      return [];
  }
}
