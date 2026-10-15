import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { enrollmentsOf, isUnlimited, planCovered, recOut, recView, weeksOf } from "@/lib/domain/money";
import type { Scene } from "@/lib/types";
import StudentRecord, { type AttRow } from "./StudentRecord";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const { welcome } = await searchParams;
  const [{ period: p, periods }, classes, ix] = await Promise.all([resolvePeriod(), getClasses(), getStudio("all")]);
  const s = ix.byId.get(id);
  if (!s) notFound();
  const en = enrollmentsOf(ix, s);
  const clsName = new Map(classes.map((c) => [c.id, c.name]));

  // Attendance history — every period × class with anything marked (no make-ups; this is the record).
  const att: AttRow[] = [];
  let TA = 0, TM = 0;
  for (const per of [...periods].reverse()) {
    for (const e of en) {
      const r = ix.rec.get(`${per.n}::${e.class_id}::${id}`);
      if (!r) continue;
      const w = weeksOf(r);
      const a = w.filter((x) => x === "Worked" || x === "Present").length;
      const ab = w.filter((x) => x === "Absent").length;
      const cn = w.filter((x) => x === "Canceled").length;
      const m = a + ab + cn;
      if (!m) continue;
      TA += a; TM += m;
      att.push({ period: per.n, start: per.start, end: per.end, cls: clsName.get(String(e.class_id)) ?? String(e.class_id), weeks: w, a, ab, cn, pct: Math.round((a / m) * 100), away: ix.away.has(`${per.n}::${id}`) });
    }
  }

  // Scenes: linked by actor_ids, plus the original first-name match within their classes.
  const sb = await createClient();
  const cids = en.map((e) => String(e.class_id));
  const [{ data: linked }, { data: inClasses }, { data: plans }] = await Promise.all([
    sb.from("scenes").select("*").contains("actor_ids", [id]),
    cids.length ? sb.from("scenes").select("*").in("class_id", cids) : Promise.resolve({ data: [] as Scene[] }),
    sb.from("plan_payments").select("*").eq("student_id", id).order("period", { ascending: false }),
  ]);
  const fn = (s.name || "").trim().split(/\s+/)[0];
  const rx = fn ? new RegExp(`(^|[^A-Za-z])${fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`, "i") : null;
  const sceneMap = new Map<string, Scene>();
  for (const x of (linked ?? []) as Scene[]) sceneMap.set(String(x.id), x);
  for (const x of (inClasses ?? []) as Scene[]) if (rx && rx.test(x.actors || "") && !(x.actor_ids ?? []).length) sceneMap.set(String(x.id), x);
  const scenes = [...sceneMap.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((x) => ({ id: String(x.id), scene: x.scene, cls: clsName.get(String(x.class_id)) ?? String(x.class_id), work: x.work, cancelled: !!x.cancelled, complete: !!x.complete, date: String(x.date).slice(0, 10) }));

  const owes = isUnlimited(s) ? 0 : en.reduce((a, e) => a + recOut(recView(ix, p.n, String(e.class_id), s)), 0);

  return (
    <StudentRecord
      student={s}
      enrollments={en}
      classes={classes}
      period={p}
      covered={planCovered(s, p)}
      owes={owes}
      away={ix.away.has(`${p.n}::${id}`)}
      att={att}
      attTotals={{ TA, TM, pct: TM ? Math.round((TA / TM) * 100) : null }}
      scenes={scenes}
      plans={(plans ?? []).map((x) => ({ period: Number(x.period), amount: Number(x.amount) || 0, method: x.method, paid_date: x.paid_date }))}
      showWelcome={welcome === "1"}
    />
  );
}
