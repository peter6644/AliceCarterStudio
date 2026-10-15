"use client";

import { createClient } from "@/lib/supabase/client";
import type { Rec, Student } from "@/lib/types";

type Sb = ReturnType<typeof createClient>;

/** Remove a student's id from every scene's actor_ids (or swap it for another id). */
async function relinkScenes(sb: Sb, fromId: string, toId: string | null) {
  const { data, error } = await sb.from("scenes").select("id, actor_ids").contains("actor_ids", [fromId]);
  if (error) throw new Error(`scenes: ${error.message}`);
  for (const s of data ?? []) {
    const ids = ((s.actor_ids ?? []) as string[]).filter((x) => String(x) !== fromId);
    if (toId && !ids.includes(toId)) ids.push(toId);
    const up = await sb.from("scenes").update({ actor_ids: ids }).eq("id", s.id);
    if (up.error) throw new Error(`scenes: ${up.error.message}`);
  }
}

const must = (label: string, r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
};

/** Permanently delete a student and everything attached to them. */
export async function deleteStudent(id: string) {
  const sb = createClient();
  await relinkScenes(sb, id, null);
  must("attendance", await sb.from("attendance_records").delete().eq("student_id", id));
  must("away", await sb.from("away").delete().eq("student_id", id));
  must("plan payments", await sb.from("plan_payments").delete().eq("student_id", id));
  must("enrollments", await sb.from("enrollments").delete().eq("student_id", id));
  must("student", await sb.from("students").delete().eq("id", id));
}

const WEEKS = ["week1", "week2", "week3", "week4"] as const;
const blank = (v: unknown) => v == null || String(v).trim() === "";

/**
 * Merge `dupId` into `keepId`, then delete the duplicate.
 * - Contact fields: kept record wins; blanks are filled from the duplicate; notes are combined.
 * - Classes: duplicate's classes move over (kept rate wins if both are in a class).
 * - Attendance/payments: moved over; where both have the same period+class, empty weeks
 *   and an empty payment on the kept record are filled from the duplicate.
 * - Away, plan payments and scene links move over.
 */
export async function mergeStudents(keep: Student, dup: Student) {
  const sb = createClient();
  const keepId = String(keep.id), dupId = String(dup.id);

  // 1. Contact info
  const patch: Partial<Student> = {};
  for (const f of ["phone", "email", "emergency", "trade_role", "paid_through"] as const) {
    if (blank(keep[f]) && !blank(dup[f])) (patch as Record<string, unknown>)[f] = dup[f];
  }
  for (const f of ["welcome_sent", "quest_sent", "extras_sent", "tuition_sent", "agreement_sent"] as const) {
    if (blank(keep[f]) && !blank(dup[f])) (patch as Record<string, unknown>)[f] = dup[f];
  }
  if (!blank(dup.notes) && dup.notes !== keep.notes) patch.notes = [keep.notes, dup.notes].filter((x) => !blank(x)).join("\n");
  const tags = [...new Set([...(keep.tags ?? []), ...(dup.tags ?? [])])];
  if (tags.length !== (keep.tags ?? []).length) patch.tags = tags;
  if (Object.keys(patch).length) must("student", await sb.from("students").update(patch).eq("id", keepId));

  // 2. Enrollments
  const { data: ens, error: enErr } = await sb.from("enrollments").select("student_id, class_id, rate").in("student_id", [keepId, dupId]);
  if (enErr) throw new Error(`enrollments: ${enErr.message}`);
  const keepClasses = new Set((ens ?? []).filter((e) => String(e.student_id) === keepId).map((e) => String(e.class_id)));
  for (const e of (ens ?? []).filter((x) => String(x.student_id) === dupId)) {
    const m = { student_id: dupId, class_id: e.class_id };
    if (keepClasses.has(String(e.class_id))) must("enrollments", await sb.from("enrollments").delete().match(m));
    else must("enrollments", await sb.from("enrollments").update({ student_id: keepId }).match(m));
  }

  // 3. Attendance & payments
  const { data: recs, error: rErr } = await sb.from("attendance_records").select("*").in("student_id", [keepId, dupId]);
  if (rErr) throw new Error(`attendance: ${rErr.message}`);
  const keepRec = new Map((recs ?? []).filter((r) => String(r.student_id) === keepId).map((r) => [`${r.period}::${r.class_id}`, r as Rec]));
  for (const r of (recs ?? []).filter((x) => String(x.student_id) === dupId) as Rec[]) {
    const m = { period: r.period, class_id: r.class_id, student_id: dupId };
    const k = keepRec.get(`${r.period}::${r.class_id}`);
    if (!k) {
      must("attendance", await sb.from("attendance_records").update({ student_id: keepId }).match(m));
      continue;
    }
    const fill: Partial<Rec> = {};
    for (const w of WEEKS) if (blank(k[w]) && !blank(r[w])) fill[w] = r[w];
    if ((blank(k.paid_by) || k.paid_by === "Unpaid") && !blank(r.paid_by) && r.paid_by !== "Unpaid") {
      Object.assign(fill, { paid_by: r.paid_by, amount_paid: r.amount_paid, paid_date: r.paid_date, trade_value: r.trade_value });
    }
    if (!blank(r.notes) && r.notes !== k.notes) fill.notes = [k.notes, r.notes].filter((x) => !blank(x)).join(" · ");
    if (Object.keys(fill).length) {
      must("attendance", await sb.from("attendance_records").update(fill).match({ period: k.period, class_id: k.class_id, student_id: keepId }));
    }
    must("attendance", await sb.from("attendance_records").delete().match(m));
  }

  // 4. Away
  const { data: aw, error: aErr } = await sb.from("away").select("period, student_id").in("student_id", [keepId, dupId]);
  if (aErr) throw new Error(`away: ${aErr.message}`);
  const keepAway = new Set((aw ?? []).filter((a) => String(a.student_id) === keepId).map((a) => Number(a.period)));
  for (const a of (aw ?? []).filter((x) => String(x.student_id) === dupId)) {
    const m = { period: a.period, student_id: dupId };
    if (keepAway.has(Number(a.period))) must("away", await sb.from("away").delete().match(m));
    else must("away", await sb.from("away").update({ student_id: keepId }).match(m));
  }

  // 5. Plan payments & scenes
  must("plan payments", await sb.from("plan_payments").update({ student_id: keepId }).eq("student_id", dupId));
  await relinkScenes(sb, dupId, keepId);

  // 6. Remove the duplicate
  must("student", await sb.from("students").delete().eq("id", dupId));
}

/** Rough duplicate score: same email/phone, or matching name words. */
export function dupScore(a: Pick<Student, "name" | "email" | "phone">, b: Pick<Student, "name" | "email" | "phone">) {
  const norm = (s: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const digits = (s: string | null) => (s || "").replace(/\D/g, "").slice(-10);
  let score = 0;
  if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) score += 3;
  if (digits(a.phone).length >= 7 && digits(a.phone) === digits(b.phone)) score += 3;
  const an = norm(a.name), bn = norm(b.name);
  if (an[0] && an[0] === bn[0]) score += 1;
  if (an.length > 1 && bn.length > 1 && an[an.length - 1] === bn[bn.length - 1]) score += 1;
  if (an.join(" ") === bn.join(" ")) score += 2;
  return score;
}
