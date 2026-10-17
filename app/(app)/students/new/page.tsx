import { requireOwner } from "@/lib/owner";
import { getClasses, getStudio } from "@/lib/data";
import StudentEditor, { NEW_STUDENT } from "../StudentEditor";

/** Next id in the studio's existing "s001" pattern. */
function nextStudentId(ids: string[]) {
  let max = 0, width = 3;
  for (const id of ids) {
    const m = /^s(\d+)$/i.exec(id);
    if (m) { max = Math.max(max, Number(m[1])); width = Math.max(width, m[1].length); }
  }
  return max ? `s${String(max + 1).padStart(width, "0")}` : null;
}

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ name?: string; email?: string; phone?: string; notes?: string }> }) {
  await requireOwner();
  const q = await searchParams;
  const [classes, ix] = await Promise.all([getClasses(), getStudio("none")]);
  const hasStart = ix.students.some((x) => "start_date" in x);
  const student = {
    ...NEW_STUDENT, name: q.name ?? "", email: q.email ?? "", phone: q.phone ?? "", notes: q.notes ?? "",
    ...(hasStart ? { start_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) } : {}),
  };
  return (
    <>
      <div className="chapter"><div className="top"><div><div className="eyebrow">New student</div><h1>Add student</h1></div></div></div>
      <div style={{ maxWidth: 560 }}>
        <StudentEditor student={student} enrollments={[]} classes={classes} nextId={nextStudentId(ix.students.map((s) => s.id))} />
      </div>
    </>
  );
}
