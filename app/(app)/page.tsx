import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, getCurrentPeriod } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const { staff } = await getSession();
  if (staff?.role === "producer") redirect(`/class/${staff.class_id}`);

  const period = await getCurrentPeriod();
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, day, start_time, end_time, format")
    .order("id");

  return (
    <>
      <h1>Full Studio View</h1>
      <p className="muted">Period {period ?? "?"} · the dashboard gauges arrive in step 4.</p>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Classes</h2>
        <table className="data">
          <thead><tr><th>Class</th><th>Day</th><th>Time</th><th>Format</th></tr></thead>
          <tbody>
            {(classes ?? []).map((c) => (
              <tr key={c.id}>
                <td><Link href={`/class/${c.id}`}>{c.name}</Link></td>
                <td>{c.day}</td>
                <td>{c.start_time}{c.end_time ? `–${c.end_time}` : ""}</td>
                <td>{c.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
