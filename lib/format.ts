// Formatting helpers, ported from the original Day Book.

export const money = (n: unknown) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

export const initials = (n: string | null | undefined) =>
  (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

/** "2026-10-05" → "10/5" */
export const fmtD = (s: string | null | undefined) => {
  if (!s) return "";
  const [, m, d] = s.slice(0, 10).split("-");
  return `${+m}/${+d}`;
};

/** "2026-10-05" → "Oct 5, 2026" */
export const fmtFull = (s: string | null | undefined) =>
  s
    ? new Date(s.slice(0, 10) + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

export const ordinal = (n: number | null | undefined) =>
  ({ 1: "1st", 2: "2nd", 3: "3rd" } as Record<number, string>)[n ?? 0] || `${n}th`;

export const clsAbbr = (c: { day?: string | null }) => (c.day || "?")[0].toUpperCase();

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Today's date as YYYY-MM-DD in the studio's time zone. */
export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export function todayDow() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
}

/** Week 1–4 of a pay period, based on today. */
export function weekNo(periodStart: string) {
  const start = new Date(periodStart.slice(0, 10) + "T00:00").getTime();
  const now = new Date(todayISO() + "T00:00").getTime();
  return Math.min(4, Math.max(1, Math.floor((now - start) / 6048e5) + 1));
}

/** The date a class meets in week i (0–3) of a period, as "M/D" and ISO. */
export function classWeekDate(periodStart: string, classDay: string | null | undefined, i: number) {
  const ps = new Date(periodStart.slice(0, 10) + "T00:00");
  const dowi = DAYS.indexOf(classDay || "");
  const off = dowi < 0 ? 0 : (dowi - ps.getDay() + 7) % 7;
  const d = new Date(ps);
  d.setDate(ps.getDate() + off + 7 * i);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { label: `${d.getMonth() + 1}/${d.getDate()}`, iso };
}
