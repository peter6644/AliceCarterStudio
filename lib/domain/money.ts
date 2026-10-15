/**
 * Tuition math — a direct port of the original Day Book's rules.
 *
 *  - paid_by "Venmo" | "Card" | "Cash": amount_paid null = paid in full, a number = partial.
 *  - paid_by "Unpaid" or blank: the full tuition_due is owed.
 *  - paid_by "Trade" on a record: nothing owed; counts as trade value at tuition_due.
 *  - Trade students (students.is_trade): count once per period at their trade_value ($305 default).
 *  - Unlimited plan: collected = plan_payments for the period; owed = plan_amount
 *    until paid_through covers the period's end.
 *  - Away students are excluded from everything for that period.
 *  - Collected % = settled ÷ billed for the period (never an amortized figure).
 */
import type { Enrollment, Period, PlanPay, Rec, Student, Week } from "@/lib/types";

export const CASH = ["Venmo", "Card", "Cash"];
export const TRADE_DEFAULT = 305;

export const isUnlimited = (s: Student) => (s.plan || "").toLowerCase() === "unlimited";
export const isActive = (s: Student) => (s.status || "active").toLowerCase() === "active";
export const tradeValueOf = (s: Student) => Number(s.trade_value) || TRADE_DEFAULT;

export const recKey = (pn: number, cid: string, sid: string) => `${pn}::${cid}::${sid}`;
export const awayKey = (pn: number, sid: string) => `${pn}::${sid}`;

export function normWeek(v: unknown): Week {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("w")) return "Worked";
  if (s.startsWith("p")) return "Present";
  if (s.startsWith("a")) return "Absent";
  if (s.startsWith("c")) return "Canceled";
  return "";
}
export const weeksOf = (r: Pick<Rec, "week1" | "week2" | "week3" | "week4">): Week[] =>
  [r.week1, r.week2, r.week3, r.week4].map(normWeek);

/** Everything needed to compute money for any period. */
export type Studio = {
  students: Student[];
  enrollments: Enrollment[];
  recs: Rec[];
  away: { period: number; student_id: string }[];
  planpays: PlanPay[];
};

export type Index = {
  students: Student[];
  byId: Map<string, Student>;
  enrollBy: Map<string, Enrollment[]>;
  inClass: Map<string, Student[]>;
  rec: Map<string, Rec>;
  away: Set<string>;
  planpay: Map<string, PlanPay>;
};

export function indexStudio(d: Studio): Index {
  const byId = new Map(d.students.map((s) => [String(s.id), s]));
  const enrollBy = new Map<string, Enrollment[]>();
  const inClass = new Map<string, Student[]>();
  for (const e of d.enrollments) {
    const sid = String(e.student_id), cid = String(e.class_id);
    enrollBy.set(sid, [...(enrollBy.get(sid) ?? []), e]);
    const s = byId.get(sid);
    if (s) inClass.set(cid, [...(inClass.get(cid) ?? []), s]);
  }
  const rec = new Map(d.recs.map((r) => [recKey(r.period, String(r.class_id), String(r.student_id)), r]));
  const away = new Set(d.away.map((a) => awayKey(a.period, String(a.student_id))));
  const planpay = new Map<string, PlanPay>();
  for (const p of d.planpays) {
    const k = awayKey(p.period, String(p.student_id));
    const prev = planpay.get(k);
    planpay.set(k, prev ? { ...prev, amount: (Number(prev.amount) || 0) + (Number(p.amount) || 0) } : p);
  }
  return { students: d.students, byId, enrollBy, inClass, rec, away, planpay };
}

export const isAway = (ix: Index, pn: number, sid: string) => ix.away.has(awayKey(pn, String(sid)));
export const enrollmentsOf = (ix: Index, s: Student) => ix.enrollBy.get(String(s.id)) ?? [];
export const enrollRate = (ix: Index, s: Student, cid: string) =>
  Number(enrollmentsOf(ix, s).find((e) => String(e.class_id) === String(cid))?.rate) || 0;

/** What a record looks like before anyone has touched it this period. */
export function recDefault(s: Student, pn: number, cid: string, rate: number): Rec {
  return {
    period: pn,
    class_id: cid,
    student_id: String(s.id),
    week1: "", week2: "", week3: "", week4: "",
    tuition_due: isUnlimited(s) ? 0 : rate,
    paid_by: s.is_trade ? "Trade" : "",
    amount_paid: null,
    paid_date: null,
    trade_value: s.is_trade ? tradeValueOf(s) : null,
    notes: "",
  };
}

export function recView(ix: Index, pn: number, cid: string, s: Student): Rec {
  return ix.rec.get(recKey(pn, String(cid), String(s.id))) ?? recDefault(s, pn, String(cid), enrollRate(ix, s, cid));
}

/** Balance still owed on one class record. */
export function recOut(r: Rec) {
  const due = Number(r.tuition_due) || 0;
  if (r.paid_by === "Trade") return 0;
  if (r.paid_by && r.paid_by !== "Unpaid") {
    const paid = r.amount_paid == null ? due : Number(r.amount_paid);
    return Math.max(0, due - paid);
  }
  return due;
}

/** Cash actually collected on one class record. */
export function recCollected(r: Rec) {
  if (!CASH.includes(r.paid_by || "")) return 0;
  return (r.amount_paid == null ? Number(r.tuition_due) : Number(r.amount_paid)) || 0;
}

export const planCovered = (s: Student, p: Period) => !!s.paid_through && s.paid_through.slice(0, 10) >= p.end.slice(0, 10);
export const planOut = (s: Student, p: Period) => (isUnlimited(s) && !planCovered(s, p) ? Number(s.plan_amount) || 0 : 0);

/** What one student owes for the period across all their classes. */
export function studentOwes(ix: Index, p: Period, s: Student) {
  if (isAway(ix, p.n, s.id)) return 0;
  if (isUnlimited(s)) return planOut(s, p);
  if (s.is_trade) return 0;
  return enrollmentsOf(ix, s).reduce((a, e) => a + recOut(recView(ix, p.n, String(e.class_id), s)), 0);
}

export function periodTotals(ix: Index, p: Period) {
  let income = 0, trade = 0, out = 0;
  const owers = new Set<string>();
  for (const s of ix.students) {
    if (!isActive(s) || isAway(ix, p.n, s.id)) continue;
    if (isUnlimited(s)) {
      const pp = ix.planpay.get(awayKey(p.n, String(s.id)));
      if (pp) income += Number(pp.amount) || 0;
      const o = planOut(s, p);
      if (o > 0) { out += o; owers.add(String(s.id)); }
      continue;
    }
    if (s.is_trade) { trade += tradeValueOf(s); continue; }
    for (const e of enrollmentsOf(ix, s)) {
      const r = recView(ix, p.n, String(e.class_id), s);
      if (r.paid_by === "Trade") trade += Number(r.tuition_due) || 0;
      else income += recCollected(r);
      const o = recOut(r);
      if (o > 0) { out += o; owers.add(String(s.id)); }
    }
  }
  return { income, trade, out, owers };
}

export function classTotals(ix: Index, p: Period, cid: string) {
  let due = 0, coll = 0, tr = 0, out = 0;
  for (const s of ix.inClass.get(String(cid)) ?? []) {
    if (!isActive(s) || isAway(ix, p.n, s.id) || isUnlimited(s)) continue;
    if (s.is_trade) { tr += tradeValueOf(s) / (enrollmentsOf(ix, s).length || 1); continue; }
    const r = recView(ix, p.n, cid, s);
    due += Number(r.tuition_due) || 0;
    if (r.paid_by === "Trade") tr += Number(r.tuition_due) || 0;
    else coll += recCollected(r);
    out += recOut(r);
  }
  return { due, coll, tr, out };
}

/** Dashboard figures for a period, including the corrected Collected %. */
export function dashboardFigures(ix: Index, p: Period) {
  const t = periodTotals(ix, p);
  const activeAll = ix.students.filter(isActive);
  const active = activeAll.filter((s) => !isAway(ix, p.n, s.id));
  const traders = active.filter((s) => s.is_trade);
  const payers = active.filter((s) => !s.is_trade && !isUnlimited(s));
  const unl = active.filter(isUnlimited);

  const billedClasses = payers.reduce(
    (a, s) => a + enrollmentsOf(ix, s).reduce((x, e) => x + (Number(recView(ix, p.n, String(e.class_id), s).tuition_due) || 0), 0),
    0
  );
  const billedPlans = unl.reduce((a, s) => {
    const o = planOut(s, p);
    const pp = ix.planpay.get(awayKey(p.n, String(s.id)));
    return a + (o > 0 ? o : pp ? Number(pp.amount) || 0 : 0);
  }, 0);
  const billed = billedClasses + billedPlans;
  const settled = Math.max(0, billed - t.out);

  let att = 0, abs = 0, canc = 0;
  for (const s of active) for (const e of enrollmentsOf(ix, s)) {
    for (const w of weeksOf(recView(ix, p.n, String(e.class_id), s))) {
      if (w === "Worked" || w === "Present") att++;
      else if (w === "Absent") abs++;
      else if (w === "Canceled") canc++;
    }
  }
  const marked = att + abs + canc;
  const paidCount = payers.filter((s) => studentOwes(ix, p, s) === 0).length;

  return {
    totals: t,
    activeAll, active, traders, payers, unl,
    inactive: ix.students.length - activeAll.length,
    awayN: activeAll.length - active.length,
    billed, settled,
    collPct: billed ? settled / billed : 0,
    att, marked, attPct: marked ? att / marked : 0,
    paidCount, paidPct: payers.length ? paidCount / payers.length : 0,
  };
}
