import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { clsAbbr, fmtD, weekNo } from "@/lib/format";
import {
  enrollmentsOf, isActive, isAway, isUnlimited, planCovered, recView, tradeValueOf,
} from "@/lib/domain/money";
import CheckIn, { type CIStudent, type PoolStudent } from "./CheckIn";
import PeriodPicker from "@/components/PeriodPicker";
import ClassScenes from "./ClassScenes";

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const { period: wantPeriod } = await searchParams;
  const { staff } = await getSession();
  const isOwner = staff?.role === "owner";
  if (!isOwner && String(staff?.class_id) !== id) {
    redirect(staff?.class_id != null ? `/class/${staff.class_id}` : "/");
  }

  const classes = await getClasses();
  const cls = classes.find((c) => c.id === id);
  if (!cls) notFound();

  const { period, current, periods } = await resolvePeriod(wantPeriod);
  const ix = await getStudio(String(period.n));
  const className = new Map(classes.map((c) => [c.id, c.name]));

  const inClass = (ix.inClass.get(id) ?? []).filter(isActive).sort((a, b) => a.name.localeCompare(b.name));
  const initial: CIStudent[] = inClass.map((s) => ({
    id: s.id,
    name: s.name,
    multi: enrollmentsOf(ix, s).length > 1,
    unlimited: isUnlimited(s),
    planCovered: planCovered(s, period),
    isTrade: !!s.is_trade,
    tradeValue: tradeValueOf(s),
    away: isAway(ix, period.n, s.id),
    rec: recView(ix, period.n, id, s),
  }));

  const pool: PoolStudent[] = ix.students
    .filter((s) => !enrollmentsOf(ix, s).some((e) => String(e.class_id) === id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      search: `${s.name} ${s.phone ?? ""} ${s.email ?? ""}`.toLowerCase(),
      inactive: !isActive(s),
      classes: enrollmentsOf(ix, s).map((e) => className.get(String(e.class_id)) ?? e.class_id).join(", "),
    }));

  const isCurrent = period.n === current.n;
  const defaultWeek = isCurrent ? Math.min(3, Math.max(0, weekNo(period.start) - 1)) : 0;

  return (
    <>
      <div className="chapter" style={{ border: "none", paddingBottom: 8, marginBottom: 12 }}>
        <div className="top">
          <div>
            <div className="eyebrow">
              {cls.day} · {cls.start_time}–{cls.end_time}{cls.format ? ` · ${cls.format}` : ""}
            </div>
            <h1>{cls.name}</h1>
          </div>
          <PeriodPicker periods={periods} selected={period.n} current={current.n} />
        </div>
        {!isCurrent && (
          <div className="desc" style={{ color: "var(--oxblood)" }}>
            Viewing PP{period.n} ({fmtD(period.start)}–{fmtD(period.end)}). Changes here edit that past period.{" "}
            <Link href={`/class/${id}`}>Back to current</Link>
          </div>
        )}
      </div>

      {isOwner && (
        <div className="clsswitch">
          {classes.map((x) => (
            <Link
              key={x.id}
              className={`csw ${x.id === id ? "on" : ""}`}
              href={`/class/${x.id}${isCurrent ? "" : `?period=${period.n}`}`}
            >
              <span className="cswb">{clsAbbr(x)}</span>
              {x.name}
            </Link>
          ))}
        </div>
      )}

      <CheckIn
        key={`${id}-${period.n}`}
        cls={cls}
        period={period}
        defaultWeek={defaultWeek}
        initial={initial}
        pool={pool}
        isOwner={isOwner}
      />

      <ClassScenes cls={cls} period={period} />
    </>
  );
}
