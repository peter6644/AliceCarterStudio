import { notFound } from "next/navigation";
import { getSession, getCurrentPeriod } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const period = await getCurrentPeriod();
  const supabase = await createClient();

  // RLS returns nothing for classes a producer isn't assigned to.
  const { data: cls } = await supabase
    .from("classes")
    .select("id, name, day, start_time, end_time")
    .eq("id", id)
    .maybeSingle();
  if (!cls) notFound();

  const { data: roster } = await supabase
    .from("enrollments")
    .select("rate, students(id, name, status)")
    .eq("class_id", id);

  type Row = { rate: number | null; students: { id: string; name: string; status: string | null } | null };
  const rows = ((roster ?? []) as unknown as Row[])
    .filter((r) => r.students)
    .sort((a, b) => a.students!.name.localeCompare(b.students!.name));

  return (
    <>
      <h1>{cls.name}</h1>
      <p className="muted">
        {cls.day} · {cls.start_time}{cls.end_time ? `–${cls.end_time}` : ""} · Period {period ?? "?"}
      </p>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Roster ({rows.length})</h2>
        <p className="muted" style={{ marginTop: -6 }}>Check-in and payments arrive in step 3.</p>
        <table className="data">
          <thead><tr><th>Student</th><th>Status</th><th className="num">Rate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.students!.id}>
                <td>{r.students!.name}</td>
                <td>{r.students!.status}</td>
                <td className="num">{r.rate != null ? `$${r.rate}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
