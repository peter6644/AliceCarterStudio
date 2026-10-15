/**
 * Attendance states are Worked / Present / Absent / Canceled.
 * Canceled weeks don't count toward the denominator; empty weeks haven't happened yet.
 * Worked and Present both count as attended. No make-ups.
 */
export type AttendanceState = "worked" | "present" | "absent" | "canceled" | null;

export function normalizeState(v: unknown): AttendanceState {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("w")) return "worked";
  if (s.startsWith("p")) return "present";
  if (s.startsWith("a")) return "absent";
  if (s.startsWith("c")) return "canceled";
  return null;
}

export type WeekRow = { week1: unknown; week2: unknown; week3: unknown; week4: unknown };

export function tally(rows: WeekRow[]) {
  let worked = 0, present = 0, absent = 0, canceled = 0;
  for (const r of rows) {
    for (const w of [r.week1, r.week2, r.week3, r.week4]) {
      const s = normalizeState(w);
      if (s === "worked") worked++;
      else if (s === "present") present++;
      else if (s === "absent") absent++;
      else if (s === "canceled") canceled++;
    }
  }
  const counted = worked + present + absent;
  const pct = counted ? Math.round(((worked + present) / counted) * 100) : null;
  return { worked, present, absent, canceled, counted, pct };
}

export const STATE_LABEL: Record<Exclude<AttendanceState, null>, string> = {
  worked: "Worked",
  present: "Present",
  absent: "Absent",
  canceled: "Canceled",
};
