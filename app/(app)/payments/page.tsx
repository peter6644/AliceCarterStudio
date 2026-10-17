import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { fmtD, money } from "@/lib/format";
import { classTotals, enrollmentsOf, isActive, isAway, isUnlimited, periodTotals, studentOwes } from "@/lib/domain/money";
import PeriodPicker from "@/components/PeriodPicker";
import OutstandingList, { type OweRow } from "./OutstandingList";
import { payStudent } from "@/lib/payData";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string; pay?: string }> }) {
  await requireOwner();
  const { period: want, pay: openId } = await searchParams;
  const [{ period: cp, current, periods }, classes] = await Promise.all([resolvePeriod(want), getClasses()]);
  const ix = await getStudio("all");
  const clsName = new Map(classes.map((c) => [c.id, c.name]));

  const rows = periods.map((p) => ({ p, ...periodTotals(ix, p) }));
  const maxBar = Math.max(1, ...rows.map((r) => r.income + r.trade));
  const totIncome = rows.reduce((a, r) => a + r.income, 0);
  const totTrade = rows.reduce((a, r) => a + r.trade, 0);
  const byClass = classes.map((c) => ({ c, ...classTotals(ix, cp, c.id) }));

  // Everyone active this period (not trades, not away) — the list shows who owes, and can show everyone.
  const owe: OweRow[] = ix.students
    .filter((s) => isActive(s) && !isAway(ix, cp.n, s.id) && !s.is_trade)
    .map((s) => ({
      student: payStudent(ix, cp, s, classes),
      owes: studentOwes(ix, cp, s),
      sub: isUnlimited(s) ? "Unlimited plan" : enrollmentsOf(ix, s).map((e) => clsName.get(String(e.class_id))).join(", "),
    }));
  const cols = "1.5fr 1.4fr 1fr 1fr 1fr";

  return (
    <>
      <div className="chapter">
        <div className="top">
          <div>
            <div className="eyebrow">Master Payments</div>
            <h1>Payments</h1>
            <div className="desc">
              Every session’s earnings versus trades, and what’s still outstanding. Year to date: <b>{money(totIncome)}</b> collected,{" "}
              <b>{money(totTrade)}</b> in trade value.
            </div>
          </div>
          <PeriodPicker periods={periods} selected={cp.n} current={current.n} />
        </div>
      </div>

      <div className="sect-lbl" id="outstanding">Outstanding · PP{cp.n}</div>
      <OutstandingList rows={owe} period={cp} openId={openId} />

      <div className="sect-lbl">By session</div>
      <div className="ledger">
        <div className="lhead" style={{ gridTemplateColumns: cols }}>
          <span>Session</span><span>Earnings vs trades</span><span>Earnings</span><span>Trades</span><span>Outstanding</span>
        </div>
        {rows.map((r) => (
          <Link key={r.p.n} className="rec" style={{ gridTemplateColumns: cols }} href={r.p.n === current.n ? "/payments" : `/payments?period=${r.p.n}`}>
            <div className="who"><div>
              <div className="nm">PP{r.p.n}{r.p.n === current.n && <span className="tag" style={{ marginLeft: 4 }}>current</span>}</div>
              <div className="ct">{fmtD(r.p.start)}–{fmtD(r.p.end)}</div>
            </div></div>
            <div className="paybar" title={`earnings ${money(r.income)} · trades ${money(r.trade)}`}>
              <div className="earn" style={{ width: `${(r.income / maxBar) * 100}%` }} />
              <div className="trade" style={{ width: `${(r.trade / maxBar) * 100}%` }} />
            </div>
            <div className="tnum" style={{ fontWeight: 600, color: "var(--moss)" }}>{r.income ? money(r.income) : "—"}</div>
            <div className="tnum" style={{ color: "var(--brass-deep)" }}>{r.trade ? money(r.trade) : "—"}</div>
            <div className="tnum" style={{ fontWeight: 600, color: r.out > 0 ? "var(--oxblood)" : "var(--ink-3)" }}>{r.out > 0 ? money(r.out) : "—"}</div>
          </Link>
        ))}
        <div className="rec static" style={{ gridTemplateColumns: cols, background: "var(--surface-2)" }}>
          <div className="who"><div className="nm">Year to date</div></div><div />
          <div className="tnum" style={{ fontWeight: 700, color: "var(--moss)" }}>{money(totIncome)}</div>
          <div className="tnum" style={{ fontWeight: 700, color: "var(--brass-deep)" }}>{money(totTrade)}</div><div />
        </div>
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        <span className="k"><span className="sw" style={{ background: "var(--moss)" }} />Earnings (cash)</span>
        <span className="k"><span className="sw" style={{ background: "var(--brass)" }} />Trade value</span>
      </div>

      <div className="sect-lbl">By class · PP{cp.n}</div>
      <div className="ledger">
        <div className="lhead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}><span>Class</span><span>Collected</span><span>Trade $</span><span>Outstanding</span></div>
        {byClass.map((x) => (
          <Link key={x.c.id} className="rec" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }} href={`/class/${x.c.id}${cp.n === current.n ? "" : `?period=${cp.n}`}`}>
            <div className="who"><div><div className="nm">{x.c.name}</div><div className="ct">{x.c.day} · {x.c.format}</div></div></div>
            <div className="tnum" style={{ fontWeight: 600 }}>{money(x.coll)}</div>
            <div className="tnum">{money(x.tr)}</div>
            <div className="tnum" style={{ fontWeight: 600, color: x.out > 0 ? "var(--oxblood)" : "var(--ink-3)" }}>{x.out > 0 ? money(x.out) : "—"}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
