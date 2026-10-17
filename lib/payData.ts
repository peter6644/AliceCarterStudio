import type { ClassRow, Period, Student } from "@/lib/types";
import type { PayStudent } from "@/components/PaymentPanel";
import { enrollmentsOf, isUnlimited, planCovered, recView, type Index } from "@/lib/domain/money";

/** Everything the payment panel needs for one student in one period. */
export function payStudent(ix: Index, p: Period, s: Student, classes: ClassRow[]): PayStudent {
  const name = new Map(classes.map((c) => [c.id, c.name]));
  return {
    id: s.id,
    name: s.name,
    notes: s.notes,
    startDate: "start_date" in s ? (s.start_date ? String(s.start_date).slice(0, 10) : null) : undefined,
    unlimited: isUnlimited(s),
    planAmount: Number(s.plan_amount) || 0,
    planMonths: Number(s.plan_months) || 3,
    planCovered: planCovered(s, p),
    paidThrough: s.paid_through,
    isTrade: !!s.is_trade,
    rows: enrollmentsOf(ix, s).map((e) => ({
      classId: String(e.class_id),
      className: name.get(String(e.class_id)) ?? String(e.class_id),
      rate: Number(e.rate) || 0,
      rec: recView(ix, p.n, String(e.class_id), s),
    })),
  };
}
