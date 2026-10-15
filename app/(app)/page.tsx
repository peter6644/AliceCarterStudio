import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { clsAbbr, fmtD, initials, money, todayDow, weekNo } from "@/lib/format";
import { dashboardFigures, enrollmentsOf, isActive, isUnlimited, studentOwes, TRADE_DEFAULT } from "@/lib/domain/money";
import { Icon, type IconName } from "@/components/icons";
import PeriodPicker from "@/components/PeriodPicker";

function Gauge({ pct, val, label, sub, color }: { pct: number; val: string; label: string; sub: string; color: string }) {
  const R = 40, C = 2 * Math.PI * R, off = C * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <div className="gcard">
      <svg className="ring" viewBox="0 0 100 100">
        <circle className="gtrack" cx="50" cy="50" r={R} />
        <circle className="gfill" cx="50" cy="50" r={R} style={{ stroke: color, strokeDasharray: C.toFixed(1), strokeDashoffset: off.toFixed(1) }} />
      </svg>
      <div className="gcenter"><div className="gval">{val}</div></div>
      <div className="glabel">{label}</div>
      <div className="gsub">{sub}</div>
    </div>
  );
}

const QA = ({ icon, label, href }: { icon: IconName; label: string; href: string }) => (
  <Link className="qact" href={href}><span className="qic"><Icon name={icon} /></span><span>{label}</span></Link>
);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { staff } = await getSession();
  if (staff?.role === "producer") {
    if (staff.class_id != null) redirect(`/class/${staff.class_id}`);
    return (
      <div className="ledger"><div className="empty"><span className="serif">No class assigned</span>
        This login is set up as a producer but isn&apos;t linked to a class yet. The owner needs to set <code>class_id</code> on your <code>staff</code> row.
      </div></div>
    );
  }

  const { period: want } = await searchParams;
  const [{ period: p, current, periods }, classes] = await Promise.all([resolvePeriod(want), getClasses()]);
  const ix = await getStudio(String(p.n));
  const f = dashboardFigures(ix, p);
  const t = f.totals;
  const isCurrent = p.n === current.n;
  const clsName = new Map(classes.map((c) => [c.id, c.name]));

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  const dow = todayDow();
  const todays = classes.filter((c) => c.day === dow);
  const owers = [...t.owers].map((id) => ix.byId.get(id)!).filter(Boolean)
    .map((s) => ({ s, o: studentOwes(ix, p, s) }))
    .sort((a, b) => b.o - a.o);
  const qs = isCurrent ? "" : `?period=${p.n}`;

  return (
    <>
      <div className="chapter" style={{ border: "none", paddingBottom: 6, marginBottom: 16 }}>
        <div className="top">
          <div>
            <div className="eyebrow">{dateStr}</div>
            <h1>Dashboard</h1>
            <div className="desc">
              Session <b>PP{p.n}</b> · {fmtD(p.start)}–{fmtD(p.end)}
              {isCurrent ? <> · week {weekNo(p.start)} of 4</> : <> · <span style={{ color: "var(--oxblood)" }}>past period</span></>}
            </div>
          </div>
          <PeriodPicker periods={periods} selected={p.n} current={current.n} />
        </div>
      </div>

      <div className="qacts">
        <QA icon="cls" label="Check in a class" href="/class" />
        <QA icon="roster" label="View roster" href="/students" />
        <QA icon="roster" label="Add student" href="/students/new" />
        <QA icon="crm" label="New inquiry" href="/inquiries?new=1" />
        <QA icon="pay" label="Payments" href="/payments" />
      </div>

      <div className="gauges">
        <Gauge pct={f.collPct} val={f.billed ? `${Math.round(f.collPct * 100)}%` : "—"} label="Collected"
          sub={f.billed ? `${money(f.settled)} of ${money(f.billed)} billed` : "nothing billed yet"} color="var(--moss)" />
        <Gauge pct={f.attPct} val={f.marked ? `${Math.round(f.attPct * 100)}%` : "—"} label="Attendance"
          sub={f.marked ? `${f.att} of ${f.marked} marked` : "not marked yet"} color="var(--brass)" />
        <Gauge pct={f.paidPct} val={`${Math.round(f.paidPct * 100)}%`} label="Paid students"
          sub={`${f.paidCount} of ${f.payers.length} current`} color="#5b6f8a" />
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Income · PP{p.n}</div><div className="v tnum">{money(t.income)}</div><div className="n">cash collected this session</div></div>
        <Link className="stat" href={`/payments${qs}`} style={{ textDecoration: "none" }}>
          <div className="k">Outstanding</div>
          <div className="v tnum" style={{ color: t.out > 0 ? "var(--oxblood)" : "inherit" }}>{money(t.out)}</div>
          <div className="n">{t.owers.size} balance{t.owers.size === 1 ? "" : "s"} due ›</div>
        </Link>
        <div className="stat"><div className="k">Trades value</div><div className="v tnum">{money(t.trade)}</div><div className="n">{f.traders.length} traders · {money(TRADE_DEFAULT)} each</div></div>
        <div className="stat"><div className="k">Active students</div><div className="v tnum">{f.activeAll.length}</div><div className="n">{f.inactive} inactive{f.awayN ? ` · ${f.awayN} away` : ""}</div></div>
      </div>

      <div className="dgrid">
        <div className="dcol">
          <div className="sect-lbl" style={{ marginTop: 0 }}>Today · {dow}</div>
          {todays.length ? (
            <div className="ledger">
              {todays.map((c) => (
                <Link key={c.id} className="rec" style={{ gridTemplateColumns: "1fr auto auto" }} href={`/class/${c.id}`}>
                  <div className="who"><div className="avatar">{clsAbbr(c)}</div>
                    <div><div className="nm">{c.name}</div><div className="ct">{c.start_time}–{c.end_time} · {(ix.inClass.get(c.id) ?? []).filter(isActive).length} students</div></div>
                  </div>
                  <span className="tag">Open</span><span className="arrow"><Icon name="arrow" /></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="ledger"><div className="empty"><span className="serif">No class today</span>Classes run Monday and Wednesday.</div></div>
          )}
        </div>
        <div className="dcol">
          <div className="sect-lbl" style={{ marginTop: 0 }}>Balances due{owers.length ? ` · ${owers.length}` : ""}</div>
          <div className="ledger">
            {owers.length ? (
              <>
                {owers.slice(0, 8).map(({ s, o }) => (
                  <Link key={s.id} className="rec" href={`/students/${s.id}`}>
                    <div className="who"><div className="avatar">{initials(s.name)}</div>
                      <div><div className="nm">{s.name}</div>
                        <div className="ct">{isUnlimited(s) ? "Unlimited plan" : enrollmentsOf(ix, s).map((e) => clsName.get(String(e.class_id))).join(", ")}</div>
                      </div>
                    </div>
                    <div style={{ justifySelf: "end", display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="pill due">{money(o)}</span><span className="arrow"><Icon name="arrow" /></span>
                    </div>
                  </Link>
                ))}
                {owers.length > 8 && (
                  <Link className="rec" href={`/payments${qs}`}>
                    <div className="ct" style={{ padding: 2, color: "var(--brass-deep)", fontWeight: 600 }}>+{owers.length - 8} more — see all who owe ›</div>
                  </Link>
                )}
              </>
            ) : (
              <div className="empty"><span className="serif">All settled</span>No balances due this session.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
