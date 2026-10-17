"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useToast } from "@/lib/useToast";
import { money, classWeekDate } from "@/lib/format";
import { CASH, recCollected, recOut, weeksOf } from "@/lib/domain/money";
import { saveRec, setAway, addEnrollment, today } from "@/lib/write";
import type { ClassRow, Period, Rec, Week } from "@/lib/types";

export type CIStudent = {
  id: string;
  name: string;
  multi: boolean;
  unlimited: boolean;
  planCovered: boolean;
  isTrade: boolean;
  tradeValue: number;
  away: boolean;
  rec: Rec;
  notes: string | null;
  startDate: string | null;
};

export type PoolStudent = { id: string; name: string; search: string; inactive: boolean; classes: string };

const STATES: Exclude<Week, "">[] = ["Worked", "Present", "Absent", "Canceled"];
const WKCLS: Record<string, string> = { Worked: "worked", Present: "present", Absent: "absent", Canceled: "canceled" };
const WEEK_FIELDS = ["week1", "week2", "week3", "week4"] as const;
const NEW_STUDENT_RATE = 350;

export default function CheckIn({
  cls,
  period,
  defaultWeek,
  initial,
  pool,
  isOwner,
}: {
  cls: ClassRow;
  period: Period;
  defaultWeek: number;
  initial: CIStudent[];
  pool: PoolStudent[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [wk, setWk] = useState(defaultWeek);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [addRate, setAddRate] = useState(String(NEW_STUDENT_RATE));
  const [noteOpen, setNoteOpen] = useState<string | null>(null);

  const roster = rows.filter((s) => !s.away);
  const away = rows.filter((s) => s.away);

  const stats = useMemo(() => {
    let att = 0, ab = 0, cn = 0, coll = 0, out = 0, trades = 0;
    for (const s of roster) {
      for (const w of weeksOf(s.rec)) {
        if (w === "Worked" || w === "Present") att++;
        else if (w === "Absent") ab++;
        else if (w === "Canceled") cn++;
      }
      if (s.unlimited) continue;
      if (s.isTrade) { trades++; continue; }
      coll += recCollected(s.rec);
      out += recOut(s.rec);
    }
    const marked = att + ab + cn;
    return { attPct: marked ? Math.round((att / marked) * 100) : null, coll, out, trades };
  }, [roster]);

  const present = roster.filter((s) => {
    const w = weeksOf(s.rec)[wk];
    return w === "Worked" || w === "Present";
  }).length;

  async function update(sid: string, patch: Partial<Rec>, msg?: string) {
    const before = rows;
    const target = rows.find((s) => s.id === sid);
    if (!target) return;
    const rec = { ...target.rec, ...patch };
    setRows((rs) => rs.map((s) => (s.id === sid ? { ...s, rec } : s)));
    const err = await saveRec(rec);
    if (err) {
      setRows(before);
      toast(`Couldn't save: ${err}`, true);
    } else if (msg) toast(msg);
  }

  function tapWeek(sid: string, v: Week) {
    const s = rows.find((x) => x.id === sid)!;
    const cur = weeksOf(s.rec)[wk];
    update(sid, { [WEEK_FIELDS[wk]]: cur === v ? "" : v } as Partial<Rec>);
  }

  function setPay(sid: string, paidBy: string) {
    const s = rows.find((x) => x.id === sid)!;
    const patch: Partial<Rec> = { paid_by: paidBy };
    if (CASH.includes(paidBy)) {
      if (!s.rec.paid_date) patch.paid_date = today();
    } else {
      patch.amount_paid = null;
      if (!paidBy || paidBy === "Unpaid") patch.paid_date = null;
    }
    if (paidBy === "Trade" && s.rec.trade_value == null) patch.trade_value = s.rec.tuition_due;
    update(sid, patch);
  }

  function setPartial(sid: string, raw: string) {
    const s = rows.find((x) => x.id === sid)!;
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && (!Number.isFinite(v) || v < 0)) return toast("Enter a dollar amount", true);
    const due = Number(s.rec.tuition_due) || 0;
    const amount = v != null && v >= due ? null : v; // paying the whole amount = paid in full
    if (amount === s.rec.amount_paid) return;
    update(sid, { amount_paid: amount }, amount == null ? "Paid in full" : `Partial ${money(amount)} · ${money(due - amount)} still owed`);
  }

  async function fillWeek() {
    const targets = roster.filter((s) => !weeksOf(s.rec)[wk]);
    if (!targets.length) return toast("Everyone already marked");
    setBusy("fill");
    const field = WEEK_FIELDS[wk];
    const next = rows.map((s) => (targets.some((t) => t.id === s.id) ? { ...s, rec: { ...s.rec, [field]: "Worked" } } : s));
    setRows(next);
    const errs = (await Promise.all(next.filter((s) => targets.some((t) => t.id === s.id)).map((s) => saveRec(s.rec)))).filter(Boolean);
    setBusy(null);
    if (errs.length) toast(`${errs.length} couldn't save: ${errs[0]}`, true);
    else toast(`${targets.length} marked worked — tap any to change`);
  }

  async function toggleAway(sid: string, makeAway: boolean) {
    setBusy(sid);
    const err = await setAway(period.n, sid, makeAway);
    setBusy(null);
    if (err) return toast(`Couldn't save: ${err}`, true);
    setRows((rs) => rs.map((s) => (s.id === sid ? { ...s, away: makeAway } : s)));
    toast(makeAway ? "Marked away for this pay period" : "Back in this period");
  }

  async function addToClass(p: PoolStudent) {
    const rate = Number(addRate);
    if (!Number.isFinite(rate) || rate < 0) return toast("Enter the tuition rate first", true);
    setBusy(p.id);
    const err = await addEnrollment(p.id, cls.id, rate);
    setBusy(null);
    if (err) return toast(`Couldn't add: ${err}`, true);
    setQ("");
    toast(`${p.name} added to ${cls.name} at ${money(rate)}`);
    router.refresh();
  }

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return pool.filter((p) => p.search.includes(n));
  }, [q, pool]);

  const m = (v: React.ReactNode, k: string, color?: string | null) => (
    <div className="m">
      <div className="mv" style={color ? { color } : undefined}>{v}</div>
      <div className="mk">{k}</div>
    </div>
  );

  return (
    <>
      <div className="cls-bar">
        {m(<>{roster.length}{away.length ? <small> +{away.length} away</small> : null}</>, "Roster")}
        {m(
          stats.attPct == null ? "—" : `${stats.attPct}%`,
          "Attendance",
          stats.attPct == null ? null : stats.attPct >= 80 ? "var(--moss)" : stats.attPct >= 50 ? "var(--brass-deep)" : "var(--oxblood)"
        )}
        {m(money(stats.coll), "Collected")}
        {m(money(stats.out), "Outstanding", stats.out > 0 ? "var(--oxblood)" : null)}
        {m(stats.trades, "Trades")}
      </div>

      <div className="cls-section">
        <div className="cls-shead">
          <span className="cls-stitle">Attendance</span>
          <span className="cls-ssub">check in &amp; collect · PP{period.n}</span>
        </div>

        <div className="wtabs">
          {[0, 1, 2, 3].map((i) => (
            <button key={i} className={`wtab ${i === wk ? "on" : ""}`} onClick={() => setWk(i)}>
              {classWeekDate(period.start, cls.day, i).label}
            </button>
          ))}
          <span className="wtag">{present}/{roster.length} in</span>
          {roster.length > 0 && (
            <button className="fillbtn" onClick={fillWeek} disabled={busy === "fill"} title="Mark everyone not yet marked as Worked for this week">
              Mark all worked
            </button>
          )}
        </div>

        {roster.length ? (
          roster.map((s) => {
            const st = weeksOf(s.rec)[wk];
            const o = s.unlimited ? 0 : recOut(s.rec);
            const due = Number(s.rec.tuition_due) || 0;
            const cash = CASH.includes(s.rec.paid_by || "");
            return (
              <div key={s.id} className="cincard">
                <div className="cinhead">
                  <div className="cinname">
                    {isOwner ? <Link href={`/students/${s.id}`}>{s.name}</Link> : s.name}
                    {s.multi && <> <span className="tag" style={{ background: "var(--wash-ox)", color: "var(--oxblood)" }}>multi</span></>}
                  </div>
                  <div className="cinright">
                    {s.unlimited ? (
                      <span className="pill plan">{s.planCovered ? "Unlimited" : "Plan due"}</span>
                    ) : s.isTrade ? (
                      <span className="pill trade">Trade · {money(s.tradeValue)}</span>
                    ) : (
                      <>
                        <select
                          className={`paysel ${o > 0 ? "owing" : "ok"}`}
                          value={s.rec.paid_by || ""}
                          onChange={(e) => setPay(s.id, e.target.value)}
                        >
                          <option value="">—</option>
                          {["Unpaid", "Venmo", "Card", "Cash"].map((x) => <option key={x}>{x}</option>)}
                          {s.rec.paid_by === "Trade" && <option>Trade</option>}
                        </select>
                        <span className={o > 0 ? "owe-mini" : "ok-mini"}>{o > 0 ? money(o) : "✓"}</span>
                      </>
                    )}
                    <button className="awaybtn" disabled={busy === s.id} onClick={() => toggleAway(s.id, true)} title="Away this pay period">
                      Away
                    </button>
                  </div>
                </div>
                <div className="attrow">
                  {STATES.map((v) => (
                    <button key={v} className={`attseg ${st === v ? "on " + WKCLS[v] : ""}`} onClick={() => tapWeek(s.id, v)}>
                      {v}
                    </button>
                  ))}
                </div>
                {(s.notes || s.startDate || s.rec.notes) && (
                  <div className="ct" style={{ marginTop: 8, fontSize: 12.5, color: "var(--brass-deep)", whiteSpace: "pre-wrap" }}>
                    {s.startDate && <>Started {new Date(s.startDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}. </>}
                    {s.notes && <>📝 {s.notes}</>}
                    {s.rec.notes && <div>PP{period.n}: {s.rec.notes}</div>}
                  </div>
                )}
                {noteOpen === s.id ? (
                  <div className="partial" style={{ width: "100%" }}>
                    <input
                      autoFocus
                      style={{ flex: 1, width: "auto" }}
                      defaultValue={s.rec.notes ?? ""}
                      placeholder={`Note for PP${period.n} (e.g. paid for 5 classes)`}
                      onBlur={(e) => { setNoteOpen(null); if ((e.target.value || "") !== (s.rec.notes || "")) update(s.id, { notes: e.target.value }, "Note saved"); }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                ) : (
                  <button type="button" className="btn ghost sm" style={{ marginTop: 8, fontSize: 11.5, padding: "3px 9px" }} onClick={() => setNoteOpen(s.id)}>
                    {s.rec.notes ? "Edit note" : "+ Note"}
                  </button>
                )}
                {cash && (
                  <label className="partial">
                    Paid
                    <input
                      key={`${s.id}-${s.rec.amount_paid}`}
                      inputMode="decimal"
                      placeholder={String(due)}
                      defaultValue={s.rec.amount_paid ?? ""}
                      onBlur={(e) => setPartial(s.id, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                    of {money(due)}
                    <span className="muted">{s.rec.amount_paid == null ? "· in full" : `· partial, ${money(o)} left`}</span>
                  </label>
                )}
              </div>
            );
          })
        ) : (
          <div className="ledger">
            <div className="empty">
              <span className="serif">No one in this period</span>Add a student below, or bring someone back from Away.
            </div>
          </div>
        )}

        {away.length > 0 && (
          <div className="away-sec">
            <div className="away-lbl">Away this pay period · {away.length}</div>
            {away.map((s) => (
              <div key={s.id} className="awayrow">
                <div className="awayname">{s.name}</div>
                <button className="btn ghost sm" disabled={busy === s.id} onClick={() => toggleAway(s.id, false)}>Bring back</button>
              </div>
            ))}
          </div>
        )}

        <div className="addbar">
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700, marginBottom: 8 }}>
              Add a student to this class
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="search">
                <Icon name="search" />
                <input placeholder="Search your whole roster…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <label className="partial" style={{ marginTop: 0 }}>
                Rate $<input inputMode="decimal" value={addRate} onChange={(e) => setAddRate(e.target.value)} />
              </label>
            </div>
            {!q.trim() ? (
              <div className="ct" style={{ color: "var(--ink-3)", marginTop: 8 }}>
                Type a name to find anyone on the roster and add them here. New students are $350/period ($325 cash).
              </div>
            ) : !matches.length ? (
              <div className="ct" style={{ color: "var(--ink-3)", marginTop: 8 }}>No match — they may already be in this class.</div>
            ) : (
              <div className="addresults">
                {matches.slice(0, 10).map((p) => (
                  <button key={p.id} className="addrow" disabled={busy === p.id} onClick={() => addToClass(p)}>
                    <span>
                      <span className="arn">{p.name}</span>
                      <span className="art">{p.inactive ? "inactive · " : ""}{p.classes || "no classes yet"}</span>
                    </span>
                    <span className="addplus">+ add</span>
                  </button>
                ))}
                {matches.length > 10 && (
                  <div className="ct" style={{ color: "var(--ink-3)", padding: "6px 2px" }}>
                    Showing 10 of {matches.length} — keep typing to narrow.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
