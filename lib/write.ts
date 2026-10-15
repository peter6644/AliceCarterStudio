"use client";

import { createClient } from "@/lib/supabase/client";
import type { Rec } from "@/lib/types";

const sb = () => createClient();

const REC_FIELDS = ["week1", "week2", "week3", "week4", "tuition_due", "paid_by", "amount_paid", "paid_date", "trade_value", "notes"] as const;

/**
 * Save one attendance/payment record (one student × class × period).
 * Updates the existing row, or inserts it the first time it's touched.
 * Blank week values are stored as null.
 */
export async function saveRec(r: Rec): Promise<string | null> {
  const client = sb();
  const body: Record<string, unknown> = {};
  for (const f of REC_FIELDS) {
    const v = r[f];
    body[f] = typeof v === "string" && v === "" && f.startsWith("week") ? null : v;
  }
  const keys = { period: r.period, class_id: r.class_id, student_id: r.student_id };

  const { data, error } = await client
    .from("attendance_records")
    .update(body)
    .match(keys)
    .select("period");
  if (error) return error.message;
  if (data && data.length) return null;

  const ins = await client.from("attendance_records").insert({ ...keys, ...body });
  return ins.error ? ins.error.message : null;
}

export async function setAway(period: number, studentId: string, away: boolean) {
  const client = sb();
  const { error } = away
    ? await client.from("away").insert({ period, student_id: studentId })
    : await client.from("away").delete().match({ period, student_id: studentId });
  return error ? error.message : null;
}

export async function addEnrollment(studentId: string, classId: string, rate: number) {
  const { error } = await sb().from("enrollments").insert({ student_id: studentId, class_id: classId, rate });
  return error ? error.message : null;
}

export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
