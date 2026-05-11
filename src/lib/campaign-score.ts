// Rule-based campaign quality score (0-100) for Meta Ads campaigns.
// Aggregates ROAS, CTR, CPC, Frequency and Spend velocity into a single grade.

export interface ScoreMetrics {
  roas: number | null;             // e.g. 2.5 (revenue/spend)
  ctr: number | null;              // decimal e.g. 0.012 = 1.2%
  cpcCents: number | null;         // average CPC in cents
  frequency: number | null;        // average frequency
  spendCurrentCents: number;       // spend in current period
  spendPrevCents: number;          // spend in previous (same-length) period
}

export interface ScoreBreakdown {
  roasPts: number;
  ctrPts: number;
  cpcPts: number;
  freqPts: number;
  velPts: number;
}

export interface ScoreResult {
  score: number;                   // 0-100
  grade: "A+" | "A" | "B+" | "B" | "C" | "D" | "F";
  gradeClass: string;              // tailwind classes for badge
  breakdown: ScoreBreakdown;
}

function roasPts(r: number | null): number {
  if (r == null || !Number.isFinite(r)) return 0;
  if (r >= 5) return 100;
  if (r >= 3) return 75;
  if (r >= 2) return 50;
  if (r >= 1) return 25;
  return 0;
}

function ctrPts(c: number | null): number {
  if (c == null || !Number.isFinite(c)) return 0;
  const pct = c * 100;
  if (pct >= 2.5) return 100;
  if (pct >= 1.5) return 85;
  if (pct >= 1) return 60;
  if (pct >= 0.5) return 30;
  return 0;
}

function cpcPts(cents: number | null): number {
  if (cents == null || !Number.isFinite(cents)) return 0;
  if (cents < 10) return 100;
  if (cents < 20) return 85;
  if (cents < 30) return 60;
  if (cents < 50) return 30;
  return 0;
}

function freqPts(f: number | null): number {
  if (f == null || !Number.isFinite(f)) return 50;
  if (f < 1.5) return 100;
  if (f < 2) return 90;
  if (f < 3) return 70;
  if (f < 5) return 40;
  return 0;
}

function velPts(curr: number, prev: number): number {
  if (prev <= 0) return curr > 0 ? 75 : 50;
  const ratio = curr / prev;
  if (ratio > 1.2) return 100;
  if (ratio >= 1) return 75;
  if (ratio < 0.5) return 0;
  return 50;
}

function gradeFromScore(s: number): { grade: ScoreResult["grade"]; gradeClass: string } {
  if (s >= 90) return { grade: "A+", gradeClass: "bg-emerald-600/20 text-emerald-500 border border-emerald-600/40" };
  if (s >= 80) return { grade: "A", gradeClass: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" };
  if (s >= 70) return { grade: "B+", gradeClass: "bg-cyan-500/15 text-cyan-500 border border-cyan-500/30" };
  if (s >= 60) return { grade: "B", gradeClass: "bg-cyan-400/15 text-cyan-400 border border-cyan-400/30" };
  if (s >= 50) return { grade: "C", gradeClass: "bg-amber-500/15 text-amber-500 border border-amber-500/30" };
  if (s >= 40) return { grade: "D", gradeClass: "bg-orange-500/15 text-orange-500 border border-orange-500/30" };
  return { grade: "F", gradeClass: "bg-red-500/15 text-red-500 border border-red-500/30" };
}

export function computeScore(m: ScoreMetrics): ScoreResult {
  const r = roasPts(m.roas);
  const c = ctrPts(m.ctr);
  const cp = cpcPts(m.cpcCents);
  const f = freqPts(m.frequency);
  const v = velPts(m.spendCurrentCents, m.spendPrevCents);
  const score = Math.round(r * 0.4 + c * 0.2 + cp * 0.15 + f * 0.15 + v * 0.10);
  const { grade, gradeClass } = gradeFromScore(score);
  return {
    score,
    grade,
    gradeClass,
    breakdown: { roasPts: r, ctrPts: c, cpcPts: cp, freqPts: f, velPts: v },
  };
}
