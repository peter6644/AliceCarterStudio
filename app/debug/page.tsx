import { getSession, getCurrentPeriod } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  ["classes", 5],
  ["pay_periods", 13],
  ["students", 89],
  ["enrollments", 101],
  ["attendance_records", null],
  ["away", null],
  ["plan_payments", null],
  ["scenes", null],
  ["inquiries", null],
  ["staff", null],
] as const;

/** Read-only connection check. Counts are what YOUR login can see under RLS. */
export default async function DebugPage() {
  const { email, staff, rawRole } = await getSession();
  const period = await getCurrentPeriod();
  const supabase = await createClient();

  const counts = await Promise.all(
    TABLES.map(async ([table, expected]) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      return { table, expected, count, error: error?.message };
    })
  );

  return (
    <main style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
      <h1>Connection check</h1>
      <p className="muted">
        Signed in as {email} · app role: {staff?.role ?? "none (no staff row)"} · stored role: {rawRole == null ? "—" : JSON.stringify(rawRole)} · class: {staff?.class_id ?? "—"} ·
        current_period(): {period ?? "error"}
      </p>
      <table className="data card">
        <thead><tr><th>Table</th><th className="num">Rows visible</th><th className="num">Expected</th><th></th></tr></thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.table}>
              <td>{c.table}</td>
              <td className="num">{c.error ? <span className="error">{c.error}</span> : c.count}</td>
              <td className="num">{c.expected ?? "—"}</td>
              <td>{c.expected != null && !c.error ? (c.count === c.expected ? "✓" : "⚠") : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
