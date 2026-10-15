import { createClient } from "@/lib/supabase/server";
import { getClasses } from "@/lib/data";
import { getSession } from "@/lib/session";
import { classWeekDate, todayISO, weekNo } from "@/lib/format";
import type { ClassRow, Period, Scene } from "@/lib/types";
import SceneList from "./SceneList";

/** Scene list section of a class page (loads data, renders the interactive list). */
export default async function ClassScenes({ cls, period }: { cls: ClassRow; period: Period }) {
  const sb = await createClient();
  const { staff } = await getSession();
  const [{ data: scenes, error }, { data: roster }, classes] = await Promise.all([
    sb.from("scenes").select("*").eq("class_id", cls.id).order("date"),
    sb.from("enrollments").select("student_id").eq("class_id", cls.id),
    getClasses(),
  ]);

  // Everyone on the roster can be a partner; this class's students are suggested first.
  const inClass = new Set((roster ?? []).map((r) => String(r.student_id)));
  const { data: all } = await sb.from("students").select("id, name, status, email").order("name").range(0, 1999);
  const students = (all ?? [])
    .filter((s) => (s.status ?? "active") === "active" || inClass.has(String(s.id)))
    .map((s) => ({ id: String(s.id), name: String(s.name), inClass: inClass.has(String(s.id)) }));

  const recipients = (all ?? [])
    .filter((s) => inClass.has(String(s.id)) && (s.status ?? "active") === "active" && s.email && String(s.email).includes("@"))
    .map((s) => ({ name: String(s.name), email: String(s.email).trim() }));

  const inPeriod = todayISO() >= period.start && todayISO() <= period.end;
  const wk = inPeriod ? Math.min(3, Math.max(0, weekNo(period.start) - 1)) : 0;
  const weekDates = [0, 1, 2, 3].map((i) => classWeekDate(period.start, cls.day, i).iso);
  const curDate = weekDates[wk];

  return (
    <div className="cls-section">
      <div className="cls-shead">
        <span className="cls-stitle">Scene list</span>
        <span className="cls-ssub">{cls.day === "Wednesday" ? "rotating master list" : "fresh weekly"}</span>
      </div>
      {error ? (
        <p className="error">Couldn&apos;t load scenes: {error.message}</p>
      ) : (
        <SceneList
          cls={cls}
          classes={staff?.role === "owner" ? classes : [cls]}
          initial={((scenes ?? []) as Scene[]).map((s) => ({ ...s, id: String(s.id), class_id: String(s.class_id), date: s.date ? String(s.date).slice(0, 10) : "" }))}
          students={students}
          curDate={curDate}
          weekDates={weekDates}
          recipients={recipients}
        />
      )}
    </div>
  );
}
