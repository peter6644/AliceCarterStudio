import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { getCurrentPeriod } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { normalizeState, tally, STATE_LABEL } from "@/lib/domain/attendance";
import StudentForm, { type EditableStudent } from "./StudentForm";

type AttRow = {
  period: number;
  class_id: string | number;
  week1: unknown; week2: unknown; week3: unknown; week4: unknown;
  tuition_due: number | null;
  paid_by: string | null;
  amount_paid: number | null;
  paid_date: string | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const supabase = await createClient();
  const current = await getCurrentPeriod();

  const { data: student } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (!student) notFound();

  const [classesRes, enrollRes, attRes, awayRes, planRes, scenesRes, statusRes] = await Promise.all([
    supabase.from("classes").select("id, name").order("id"),
    supabase.from("enrollments").select("class_id, rate").eq("student_id", id),
    supabase
      .from("attendance_records")
      .select("period, class_id, week1, week2, week3, week4, tuition_due, paid_by, amount_paid, paid_date")
      .eq("student_id", id)
      .order("period", { ascending: false }),
    supabase.from("away").select("period").eq("student_id", id),
    supabase.from("plan_payments").select("period, amount, method, paid_date").eq("student_id", id).order("period", { ascending: false }),
    supabase
      .from("scenes")
      .select("id, class_id, date, scene, work, complete, cancelled, actors")
      .contains("actor_ids", [id])
      .order("date", { ascending: false }),
    supabase.from("students").select("status"),
  ]);

  const className = new Map((classesRes.data ?? []).map((c) => [String(c.id), c.name as string]));
  const att = (attRes.data ?? []) as AttRow[];
  const awayPeriods = new Set((awayRes.data ?? []).map((a) => a.period));
  const overall = tally(att);
  const statuses = [...new Set((statusRes.data ?? []).map((s) => s.status).filter(Boolean))] as string[];

  // Attendance % per class across all periods
  const byClass = new Map<string, AttRow[]>();
  for (const r of att) {
    const k = String(r.class_id);
    byClass.set(k, [...(byClass.get(k) ?? []), r]);
  }

  return (
    <>
      <p style={{ margin: "0 0 8px" }}><Link href="/students" className="muted">← Roster</Link></p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1>{student.name}</h1>
        {student.status && <span className="pill">{student.status}</span>}
        {student.is_trade && <span className="pill moss">Trade</span>}
        {current != null && awayPeriods.has(current) && <span className="pill oxblood">Away this period</span>}
      </div>
      <p className="muted">
        {[student.phone, student.email].filter(Boolean).join(" · ") || "No contact info"}
      </p>

      <div className="metrics">
        <div className="card metric">
          <div className="metric-label">Attendance</div>
          <div className="metric-value">{overall.pct == null ? "—" : `${overall.pct}%`}</div>
          <div className="muted small">{overall.worked} worked · {overall.present} present · {overall.absent} absent</div>
        </div>
        <div className="card metric">
          <div className="metric-label">Plan</div>
          <div className="metric-value" style={{ fontSize: "1.4rem" }}>{student.plan || "Per class"}</div>
          <div className="muted small">
            {student.plan_amount ? `${money(student.plan_amount)} / ${student.plan_months ?? "?"} mo` : ""}
            {student.paid_through ? ` · paid through ${student.paid_through}` : ""}
          </div>
        </div>
        <div className="card metric">
          <div className="metric-label">Classes</div>
          <div className="small" style={{ marginTop: 6 }}>
            {(enrollRes.data ?? []).map((e) => (
              <div key={String(e.class_id)} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <Link href={`/class/${e.class_id}`}>{className.get(String(e.class_id)) ?? e.class_id}</Link>
                <span className="num">{money(e.rate)}</span>
              </div>
            ))}
            {!enrollRes.data?.length && <span className="muted">Not enrolled</span>}
          </div>
        </div>
      </div>

      <div className="two-col">
        <section className="card" style={{ overflowX: "auto" }}>
          <h2>Attendance history</h2>
          {[...byClass.entries()].map(([cid, rows]) => {
            const t = tally(rows);
            return (
              <div key={cid} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: "1rem", margin: "4px 0 6px" }}>
                  {className.get(cid) ?? cid}{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>{t.pct == null ? "" : `· ${t.pct}%`}</span>
                </h3>
                <table className="data">
                  <thead>
                    <tr><th>Period</th><th>Wk 1</th><th>Wk 2</th><th>Wk 3</th><th>Wk 4</th><th className="num">%</th><th>Paid</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const pt = tally([r]);
                      return (
                        <tr key={`${r.period}-${cid}`}>
                          <td>P{r.period}{awayPeriods.has(r.period) ? " · Away" : ""}</td>
                          {[r.week1, r.week2, r.week3, r.week4].map((w, i) => {
                            const s = normalizeState(w);
                            return <td key={i}>{s ? <span className={`dot ${s}`}>{STATE_LABEL[s]}</span> : <span className="muted">·</span>}</td>;
                          })}
                          <td className="num">{pt.pct == null ? "—" : `${pt.pct}%`}</td>
                          <td className="small">
                            {r.paid_by || "—"}
                            {r.amount_paid != null ? ` (partial ${money(r.amount_paid)})` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          {!att.length && <p className="muted">No attendance recorded yet.</p>}

          {(planRes.data ?? []).length > 0 && (
            <>
              <h2 style={{ marginTop: 12 }}>Plan payments</h2>
              <table className="data">
                <thead><tr><th>Period</th><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {(planRes.data ?? []).map((p, i) => (
                    <tr key={i}><td>P{p.period}</td><td>{p.paid_date ?? "—"}</td><td>{p.method ?? "—"}</td><td className="num">{money(p.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2 style={{ marginTop: 12 }}>Scene history</h2>
          {(scenesRes.data ?? []).length ? (
            <table className="data">
              <thead><tr><th>Date</th><th>Class</th><th>Scene</th><th>Status</th></tr></thead>
              <tbody>
                {(scenesRes.data ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{className.get(String(s.class_id)) ?? s.class_id}</td>
                    <td>{s.scene}{s.work ? <span className="muted"> · {s.work}</span> : null}</td>
                    <td>{s.cancelled ? "Canceled" : s.complete ? "Complete" : "In progress"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{scenesRes.error ? scenesRes.error.message : "No scenes linked yet."}</p>
          )}
        </section>

        <StudentForm student={{ ...(student as EditableStudent), id }} statuses={statuses} />
      </div>
    </>
  );
}
