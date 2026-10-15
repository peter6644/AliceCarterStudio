import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";

type Student = {
  id: string | number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  plan: string | null;
  is_trade: boolean | null;
  enrollments: { class_id: string | number; rate: number | null }[];
};

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; class?: string }>;
}) {
  await requireOwner();
  const { q = "", status = "", class: classFilter = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: students, error }, { data: classes }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, phone, email, status, plan, is_trade, enrollments(class_id, rate)")
      .order("name"),
    supabase.from("classes").select("id, name").order("id"),
  ]);

  const className = new Map((classes ?? []).map((c) => [String(c.id), c.name as string]));
  const all = (students ?? []) as Student[];
  const statuses = [...new Set(all.map((s) => s.status).filter(Boolean))] as string[];

  const needle = q.trim().toLowerCase();
  const list = all.filter((s) => {
    if (status && s.status !== status) return false;
    if (classFilter && !s.enrollments.some((e) => String(e.class_id) === classFilter)) return false;
    if (!needle) return true;
    return [s.name, s.email, s.phone].some((v) => v?.toLowerCase().includes(needle));
  });

  return (
    <>
      <h1>Roster</h1>
      <p className="muted">{list.length} of {all.length} students</p>

      <form className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", margin: "16px 0" }}>
        <div className="field" style={{ margin: 0, flex: "1 1 220px" }}>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, email or phone" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">All</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="class">Class</label>
          <select id="class" name="class" defaultValue={classFilter}>
            <option value="">All</option>
            {(classes ?? []).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn">Filter</button>
        {(q || status || classFilter) && <Link className="btn secondary" href="/students">Clear</Link>}
      </form>

      {error && <p className="error">{error.message}</p>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead>
            <tr><th>Name</th><th>Classes</th><th>Plan</th><th>Status</th><th>Phone</th></tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/students/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link>
                  {s.is_trade && <span className="pill moss">Trade</span>}
                </td>
                <td>{s.enrollments.map((e) => className.get(String(e.class_id)) ?? e.class_id).join(", ") || "—"}</td>
                <td>{s.plan || "—"}</td>
                <td>{s.status || "—"}</td>
                <td>{s.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
