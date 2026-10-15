import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPeriod } from "@/lib/session";
import type { ClassRow, Enrollment, Period, PlanPay, Rec, Student } from "@/lib/types";
import { indexStudio, type Index } from "@/lib/domain/money";

type Sb = Awaited<ReturnType<typeof createClient>>;

/** Supabase returns at most 1,000 rows per request; page through everything. */
async function fetchAll<T>(sb: Sb, table: string, cols = "*", apply?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols);
    if (apply) q = apply(q);
    const { data, error } = await q.range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export const getClasses = cache(async (): Promise<ClassRow[]> => {
  const sb = await createClient();
  const rows = await fetchAll<ClassRow>(sb, "classes");
  return rows.map((c) => ({ ...c, id: String(c.id) }));
});

export const getPeriods = cache(async (): Promise<Period[]> => {
  const sb = await createClient();
  const rows = await fetchAll<Period>(sb, "pay_periods", "*", (q) => q.order("n"));
  return rows.map((p) => ({ n: Number(p.n), start: String(p.start).slice(0, 10), end: String(p.end).slice(0, 10) }));
});

/** The period to show: ?period=N if valid, else current_period(), else the last one. */
export async function resolvePeriod(requested?: string | number | null): Promise<{ period: Period; current: Period; periods: Period[] }> {
  const [periods, cur] = await Promise.all([getPeriods(), getCurrentPeriod()]);
  const current = periods.find((p) => p.n === cur) ?? periods[periods.length - 1];
  const want = requested != null && requested !== "" ? Number(requested) : NaN;
  const period = periods.find((p) => p.n === want) ?? current;
  return { period, current, periods };
}

/** Load the data money math needs. Pass periods to limit records/plan payments/away. */
export const getStudio = cache(async (periodsKey: string = "all"): Promise<Index> => {
  const sb = await createClient();
  const none = periodsKey === "none";
  const only = periodsKey === "all" || none ? null : periodsKey.split(",").map(Number);
  const byPeriod = (q: any) => (only ? q.in("period", only) : q); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [students, enrollments, recs, away, planpays] = await Promise.all([
    fetchAll<Student>(sb, "students", "*", (q) => q.order("name")),
    fetchAll<Enrollment>(sb, "enrollments", "student_id, class_id, rate"),
    none ? Promise.resolve([] as Rec[]) : fetchAll<Rec>(sb, "attendance_records", "*", byPeriod),
    none ? Promise.resolve([]) : fetchAll<{ period: number; student_id: string }>(sb, "away", "period, student_id", byPeriod),
    none ? Promise.resolve([] as PlanPay[]) : fetchAll<PlanPay>(sb, "plan_payments", "*", byPeriod),
  ]);
  const norm = <T extends { student_id: unknown }>(r: T) => ({ ...r, student_id: String(r.student_id) });
  return indexStudio({
    students: students.map((s) => ({ ...s, id: String(s.id) })),
    enrollments: enrollments.map((e) => ({ ...norm(e), class_id: String(e.class_id) })),
    recs: recs.map((r) => ({ ...norm(r), class_id: String(r.class_id), period: Number(r.period) })),
    away: away.map((a) => ({ ...norm(a), period: Number(a.period) })),
    planpays: planpays.map((p) => ({ ...norm(p), period: Number(p.period) })),
  });
});
