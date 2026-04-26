/**
 * Diff utilities for comparing two BP version snapshots.
 * Snapshot payload: { forecasts: ForecastSnapshot[], event, snapshot_taken_at }
 */

export interface ForecastSnapshot {
  id: string;
  type: "income" | "expense";
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  status: string;
  category_id: string | null;
  notes?: string | null;
}

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface DiffRow {
  id: string;
  status: DiffStatus;
  type: "income" | "expense";
  description: string;
  category_id: string | null;
  // base = version A (older / left); compare = version B (newer / right)
  baseAmount: number | null;
  compareAmount: number | null;
  baseIva: number | null;
  compareIva: number | null;
  delta: number; // compareAmount - baseAmount (0 if either side missing => uses present side)
}

export interface DiffSummary {
  totalDelta: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  baseIncome: number;
  baseExpense: number;
  compareIncome: number;
  compareExpense: number;
}

export function diffSnapshots(
  base: ForecastSnapshot[] | null | undefined,
  compare: ForecastSnapshot[] | null | undefined
): { rows: DiffRow[]; summary: DiffSummary } {
  const baseList = base ?? [];
  const compareList = compare ?? [];
  const baseById = new Map(baseList.map((f) => [f.id, f]));
  const compareById = new Map(compareList.map((f) => [f.id, f]));
  const rows: DiffRow[] = [];

  const allIds = new Set<string>([
    ...baseList.map((f) => f.id),
    ...compareList.map((f) => f.id),
  ]);

  for (const id of allIds) {
    const a = baseById.get(id);
    const b = compareById.get(id);

    if (a && !b) {
      rows.push({
        id,
        status: "removed",
        type: a.type,
        description: a.description,
        category_id: a.category_id,
        baseAmount: Number(a.amount) || 0,
        compareAmount: null,
        baseIva: Number(a.iva_rate) || 0,
        compareIva: null,
        delta: -(Number(a.amount) || 0),
      });
    } else if (!a && b) {
      rows.push({
        id,
        status: "added",
        type: b.type,
        description: b.description,
        category_id: b.category_id,
        baseAmount: null,
        compareAmount: Number(b.amount) || 0,
        baseIva: null,
        compareIva: Number(b.iva_rate) || 0,
        delta: Number(b.amount) || 0,
      });
    } else if (a && b) {
      const aAmt = Number(a.amount) || 0;
      const bAmt = Number(b.amount) || 0;
      const sameAmt = Math.abs(aAmt - bAmt) < 0.005;
      const sameIva = Number(a.iva_rate) === Number(b.iva_rate);
      const sameDesc = (a.description || "") === (b.description || "");
      const sameCat = (a.category_id || "") === (b.category_id || "");
      const isModified = !sameAmt || !sameIva || !sameDesc || !sameCat;
      rows.push({
        id,
        status: isModified ? "modified" : "unchanged",
        type: b.type,
        description: b.description,
        category_id: b.category_id,
        baseAmount: aAmt,
        compareAmount: bAmt,
        baseIva: Number(a.iva_rate) || 0,
        compareIva: Number(b.iva_rate) || 0,
        delta: bAmt - aAmt,
      });
    }
  }

  const summary: DiffSummary = {
    totalDelta: 0,
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    unchangedCount: 0,
    baseIncome: 0,
    baseExpense: 0,
    compareIncome: 0,
    compareExpense: 0,
  };

  for (const r of rows) {
    // Treat income delta as positive contribution; expense delta inverted on net
    const signed = r.type === "income" ? r.delta : -r.delta;
    summary.totalDelta += signed;
    if (r.status === "added") summary.addedCount++;
    else if (r.status === "removed") summary.removedCount++;
    else if (r.status === "modified") summary.modifiedCount++;
    else summary.unchangedCount++;
    if (r.baseAmount != null) {
      if (r.type === "income") summary.baseIncome += r.baseAmount;
      else summary.baseExpense += r.baseAmount;
    }
    if (r.compareAmount != null) {
      if (r.type === "income") summary.compareIncome += r.compareAmount;
      else summary.compareExpense += r.compareAmount;
    }
  }

  return { rows, summary };
}
