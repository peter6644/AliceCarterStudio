"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Panel from "@/components/Panel";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/useToast";
import { fmtD, fmtFull, money, ordinal } from "@/lib/format";
import { isUnlimited, tradeValueOf } from "@/lib/domain/money";
import { mailtoHref, template, type TemplateKey } from "@/lib/templates";
import { today } from "@/lib/write";
import type { ClassRow, Enrollment, Period, Student, Week } from "@/lib/types";
import StudentEditor from "../StudentEditor";
import { deleteStudent, dupScore, mergeStudents } from "@/lib/studentAdmin";

export type AttRow = { period: number; start: string; end: string; cls: string; weeks: Week[]; a: number; ab: number; cn: number; pct: number; away: boolean };
type SceneLite = { id: string; scene: string | null; cls: string; work: number | null; cancelled: boolean; complete: boolean; date: string };
type PlanLite = { period: number; amount: number; method: string | null; paid_date: string | null };

const WKLET: Record<string, string> = { "": "·", Worked: "W", Present: "P", Absent: "A", Canceled: "C" };
const WKCLS: Record<string, string> = { Worked: "worked", Present: "present", Absent: "absent", Canceled: "canceled" };

function addMonths(base: string, m: number) {
  const d = new Date(base.slice(0, 10) + "T00:00");
  d.setMonth(d.getMonth() + (m || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StudentRecord(props: {
  student: Student; enrollments: Enrollment[]; classes: ClassRow[]; period: Period; covered: boolean; owes: number; away: boolean;
  att: AttRow[]; attTotals: { TA: number; TM: number; pct: number | null }; scenes: SceneLite[]; plans: PlanLite[]; showWelcome: boolean;
  others: (Student & { classes: string })[];
}) {
  const { student: s, enrollments, classes, period: p, covered, owes, att, attTotals, scenes, plans } = props;
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [welcome, setWelcome] = useState(props.showWelcome);
  const [method, setMethod] = useState(s.pays_by && s.pays_by !== "Trade" ? s.pays_by : "Card");
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQ, setMergeQ] = useState("");
  const [dup, setDup] = useState<(Student & { classes: string }) | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const likely = props.others
    .map((o) => ({ o, sc: dupScore(s, o) }))
    .filter((x) => x.sc >= 2)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.o);
  const mq = mergeQ.trim().toLowerCase();
  const mergeList = mq
    ? props.others.filter((o) => `${o.name} ${o.email ?? ""} ${o.phone ?? ""}`.toLowerCase().includes(mq)).slice(0, 12)
    : likely.slice(0, 8);

  async function doMerge() {
    if (!dup) return;
    setBusy(true);
    try {
      await mergeStudents(s, dup);
      toast(`${dup.name} merged into ${s.name}`);
      setMergeOpen(false); setDup(null); setMergeQ("");
      router.refresh();
    } catch (e) {
      toast(`Merge stopped partway: ${(e as Error).message}. Some items may already have moved — running Merge again finishes it.`, true);
    }
    setBusy(false);
  }

  async function doDelete() {
    setBusy(true);
    try {
      await deleteStudent(s.id);
      toast(`${s.name} deleted`);
      router.push("/students");
      router.refresh();
    } catch (e) {
      setBusy(false);
      toast(`Couldn't delete: ${(e as Error).message}`, true);
    }
  }
  const clsName = new Map(classes.map((c) => [c.id, c.name]));
  const unl = isUnlimited(s);

  async function send(key: TemplateKey) {
    const t = template(key);
    if (!s.email) return toast("No email on file", true);
    window.location.href = mailtoHref(s.email, t);
    if (t.sentField) {
      const { error } = await createClient().from("students").update({ [t.sentField]: today() }).eq("id", s.id);
      if (error) return toast(`Opened your email, but couldn't record the send: ${error.message}`, true);
    }
    toast(`${t.title} opened in your email`);
    router.refresh();
  }

  async function recordPlanPayment() {
    const amount = Number(s.plan_amount) || 0;
    if (!amount) return toast("Set the plan amount first (Edit)", true);
    setBusy(true);
    const sb = createClient();
    const paidThrough = addMonths(p.end, Number(s.plan_months) || 3);
    const ins = await sb.from("plan_payments").insert({ period: p.n, student_id: s.id, amount, method, paid_date: today() });
    if (ins.error) { setBusy(false); return toast(`Couldn't record: ${ins.error.message}`, true); }
    const up = await sb.from("students").update({ paid_through: paidThrough, pays_by: method }).eq("id", s.id);
    setBusy(false);
    if (up.error) toast(`Payment saved, but paid-through didn't update: ${up.error.message}`, true);
    else toast(`${money(amount)} · ${method} · covered through ${fmtD(paidThrough)}`);
    router.refresh();
  }

  const sentRow = (label: string, v: string | null, key: TemplateKey) => (
    <div className="drow">
      <span className="l">{label}</span>
      <span className="r" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
        <span>{v ? `Sent ${fmtFull(v)}` : "Not sent"}</span>
        {s.email && <button className="btn ghost sm" onClick={() => send(key)}>{v ? "Resend" : "Send"}</button>}
      </span>
    </div>
  );

  return (
    <>
      <p style={{ margin: "0 0 8px" }}><Link href="/students" className="ct" style={{ color: "var(--brass-deep)", fontWeight: 600, textDecoration: "none" }}>← Roster</Link></p>
      <div className="chapter">
        <div className="top">
          <div>
            <div className="eyebrow">Student record</div>
            <h1>{s.name}</h1>
            <div className="desc" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className={`badge ${(s.status || "active") === "active" ? "active" : "inactive"}`}>{(s.status || "active") === "active" ? "Active" : "Inactive"}</span>
              {props.away && <span className="tag awaytag">Away this period</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => setMergeOpen(true)}>Merge duplicate{likely.length ? ` (${likely.length} possible)` : ""}</button>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          </div>
        </div>
      </div>

      <div className="dgrid">
        <div className="dcol">
          {s.phone && <div className="drow"><span className="l">Phone</span><span className="r"><a href={`tel:${s.phone}`}>{s.phone}</a></span></div>}
          {s.email && <div className="drow"><span className="l">Email</span><span className="r"><a href={`mailto:${s.email}`}>{s.email}</a></span></div>}
          {s.emergency && <div className="drow"><span className="l">Emergency</span><span className="r">{s.emergency}</span></div>}

          <div className="sect-lbl">Classes &amp; rates</div>
          {enrollments.length ? enrollments.map((e) => (
            <div key={String(e.class_id)} className="drow">
              <span className="l"><Link href={`/class/${e.class_id}`} style={{ textDecoration: "none" }}>{clsName.get(String(e.class_id)) ?? e.class_id}</Link></span>
              <span className="r tnum">{unl ? "incl." : money(e.rate)}</span>
            </div>
          )) : <div className="ct" style={{ color: "var(--ink-3)" }}>No classes</div>}

          <div className="sect-lbl">Payment</div>
          {unl ? (
            <>
              <div className="drow"><span className="l">Plan</span><span className="r"><span className="pill plan">Unlimited</span></span></div>
              <div className="drow"><span className="l">Amount</span><span className="r">{money(s.plan_amount)} / {s.plan_months} months</span></div>
              <div className="drow"><span className="l">Pays by</span><span className="r">{s.pays_by || "—"}</span></div>
              <div className="drow"><span className="l">Paid through</span><span className="r">{s.paid_through ? fmtFull(s.paid_through) : "—"}</span></div>
              <div className="drow"><span className="l">PP{p.n}</span><span className="r">{covered ? <span className="pill paid">Covered</span> : <span className="pill due">Due {money(s.plan_amount)}</span>}</span></div>
              <div className="field" style={{ marginTop: 14 }}><label>Payment method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>{["Card", "Venmo", "Cash"].map((m) => <option key={m}>{m}</option>)}</select>
              </div>
              <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={recordPlanPayment} disabled={busy}>
                Record {money(s.plan_amount)} payment
              </button>
              {plans.length > 0 && (
                <>
                  <div className="sect-lbl">Plan payments</div>
                  {plans.map((x, i) => (
                    <div key={i} className="drow"><span className="l">PP{x.period} · {x.method || "—"}</span><span className="r tnum">{money(x.amount)}{x.paid_date ? ` · ${fmtD(x.paid_date)}` : ""}</span></div>
                  ))}
                </>
              )}
            </>
          ) : s.is_trade ? (
            <>
              <div className="drow"><span className="l">Pays by</span><span className="r"><span className="pill trade">Trade</span></span></div>
              <div className="drow"><span className="l">Trade role</span><span className="r">{s.trade_role || "—"}</span></div>
              <div className="drow"><span className="l">Trade value</span><span className="r tnum">{money(tradeValueOf(s))} / period</span></div>
            </>
          ) : (
            <>
              <div className="drow"><span className="l">Pays by</span><span className="r">{s.pays_by || "—"}</span></div>
              <div className="drow"><span className="l">Rate / session</span><span className="r tnum">{money(enrollments.reduce((a, e) => a + (Number(e.rate) || 0), 0))}</span></div>
              <div className="drow"><span className="l">PP{p.n} standing</span><span className="r">{owes > 0 ? <span className="pill due">Owes {money(owes)}</span> : <span className="pill paid">Paid</span>}</span></div>
            </>
          )}

          {s.notes && (<><div className="sect-lbl">Notes</div><p style={{ color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{s.notes}</p></>)}
          {(s.tags ?? []).length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(s.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}</div>}

          <div className="sect-lbl">Onboarding</div>
          {sentRow("Welcome letter", s.welcome_sent, "welcome")}
          {sentRow("Artist questionnaire", s.quest_sent, "quest")}
          {sentRow("Supplemental list", s.extras_sent, "extras")}
          {sentRow("Tuition policy", s.tuition_sent, "tuition")}
          <div className="drow"><span className="l">Payment agreement</span><span className="r">{s.agreement_sent ? `Sent ${fmtFull(s.agreement_sent)}` : "Not sent"}</span></div>
          {!s.email && <p className="ct" style={{ color: "var(--ink-3)" }}>Add an email (Edit) to send these.</p>}

          <div className="sect-lbl">Remove</div>
          <p className="ct" style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
            Leaving the studio? Set them to <b>Inactive</b> (Edit) to keep their history. Delete only for mistakes and test entries.
          </p>
          <button className="btn ghost" style={{ color: "var(--oxblood)", borderColor: "var(--oxblood)" }} onClick={() => { setTyped(""); setDelOpen(true); }}>
            Delete student…
          </button>
        </div>

        <div className="dcol">
          <div className="sect-lbl" style={{ marginTop: 0 }}>Attendance history</div>
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "-4px 0 8px" }}>The studio does not offer make-ups — this is the record.</p>
          {att.length ? (
            <>
              <div className="hist-top">Overall <b>{attTotals.pct}%</b> · {attTotals.TA} of {attTotals.TM} sessions attended</div>
              {att.map((r) => (
                <div key={`${r.period}-${r.cls}`} className="histrow">
                  <div>
                    <div className="hp">PP{r.period} · {r.cls}{r.away ? " · Away" : ""}</div>
                    <div className="hd">{fmtD(r.start)}–{fmtD(r.end)} · {r.weeks.map((w, i) => <span key={i} className={`dot ${WKCLS[w] ?? ""}`} style={{ marginRight: 4 }}>{WKLET[w]}</span>)}</div>
                  </div>
                  <div className="hstat">
                    <span className={`hpct ${r.pct >= 80 ? "good" : r.pct >= 50 ? "ok" : "low"}`}>{r.pct}%</span>
                    <span className="hcts">{r.a} in · {r.ab} abs{r.cn ? ` · ${r.cn} canc` : ""}</span>
                  </div>
                </div>
              ))}
            </>
          ) : <div className="ct" style={{ color: "var(--ink-3)" }}>No attendance recorded yet.</div>}

          <div className="sect-lbl">Scene history</div>
          {scenes.length ? scenes.map((x) => (
            <div key={x.id} className="histrow">
              <div>
                <div className="hp">{x.scene}</div>
                <div className="hd">{x.cls} · {x.work ? `${ordinal(x.work)} work` : "scene"}{x.cancelled ? " · cancelled" : x.complete ? " · complete" : ""}</div>
              </div>
              <div className="hd">{fmtFull(x.date)}</div>
            </div>
          )) : <div className="ct" style={{ color: "var(--ink-3)" }}>No scenes linked to this student yet.</div>}
        </div>
      </div>

      <Panel open={editing} onClose={() => setEditing(false)} head={<><div className="eyebrow">Edit record</div><h2>{s.name}</h2></>}>
        <StudentEditor student={s} enrollments={enrollments} classes={classes} onDone={() => setEditing(false)} />
      </Panel>

      <Panel
        open={mergeOpen}
        onClose={() => { setMergeOpen(false); setDup(null); }}
        head={<><div className="eyebrow">Merge duplicate</div><h2>Into {s.name}</h2></>}
        foot={dup ? (
          <>
            <button className="btn ghost" onClick={() => setDup(null)}>Back</button>
            <button className="btn" onClick={doMerge} disabled={busy}>{busy ? "Merging…" : `Merge ${dup.name} into this record`}</button>
          </>
        ) : undefined}
      >
        {!dup ? (
          <>
            <p style={{ marginTop: 0, color: "var(--ink-2)", fontSize: 13 }}>
              Pick the duplicate. <b>{s.name}</b> (this record) is kept; the duplicate&apos;s classes, attendance, payments, Away marks
              and scenes move here, then the duplicate is removed.
            </p>
            <div className="search" style={{ marginBottom: 12 }}>
              <input placeholder="Search name, email or phone" value={mergeQ} onChange={(e) => setMergeQ(e.target.value)} style={{ paddingLeft: 12 }} />
            </div>
            {!mq && <div className="sect-lbl" style={{ marginTop: 0 }}>{likely.length ? "Likely duplicates" : "No obvious duplicates — search above"}</div>}
            <div className="ledger">
              {mergeList.map((o) => (
                <div key={o.id} className="rec" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => setDup(o)}>
                  <div className="who"><div>
                    <div className="nm">{o.name}{(o.status || "active") !== "active" ? " · inactive" : ""}</div>
                    <div className="ct">{[o.email, o.phone, o.classes || "no classes"].filter(Boolean).join(" · ")}</div>
                  </div></div>
                  <span className="tag">Pick</span>
                </div>
              ))}
              {mq && !mergeList.length && <div className="empty">No match.</div>}
            </div>
          </>
        ) : (
          <>
            <div className="drow"><span className="l">Keep</span><span className="r">{s.name}</span></div>
            <div className="drow"><span className="l">Remove</span><span className="r" style={{ color: "var(--oxblood)" }}>{dup.name}</span></div>
            <div className="sect-lbl">What happens</div>
            <ul style={{ color: "var(--ink-2)", fontSize: 13.5, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Classes move over: {dup.classes || "none"}. Where both are in a class, {s.name}&apos;s rate stays.</li>
              <li>Attendance and payments move over. Same period and class? Empty weeks and an unpaid record here get filled from the duplicate.</li>
              <li>Away marks, plan payments and scene links move over.</li>
              <li>Blank contact fields here are filled from the duplicate{dup.email && !s.email ? ` (email ${dup.email})` : ""}{dup.phone && !s.phone ? ` (phone ${dup.phone})` : ""}; notes are combined.</li>
              <li>{dup.name} is then deleted. This can&apos;t be undone.</li>
            </ul>
          </>
        )}
      </Panel>

      <Panel
        open={delOpen}
        onClose={() => setDelOpen(false)}
        head={<><div className="eyebrow">Delete student</div><h2>{s.name}</h2></>}
        foot={<>
          <button className="btn ghost" onClick={() => setDelOpen(false)}>Cancel</button>
          <button className="btn" style={{ background: "var(--oxblood)", borderColor: "var(--oxblood)" }}
            disabled={busy || typed.trim().toLowerCase() !== s.name.trim().toLowerCase()} onClick={doDelete}>
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </>}
      >
        <p style={{ marginTop: 0, color: "var(--ink-2)" }}>
          This permanently removes {s.name} along with their classes, attendance, payments, Away marks and scene links. It can&apos;t be undone.
        </p>
        <p style={{ color: "var(--ink-2)" }}>If they&apos;ve just left the studio, set them to <b>Inactive</b> instead — their history stays.</p>
        <div className="field"><label>Type their name to confirm</label><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={s.name} /></div>
      </Panel>

      <Panel
        open={welcome}
        onClose={() => setWelcome(false)}
        head={<><div className="eyebrow">New student</div><h2>{s.name}</h2></>}
        foot={<button className="btn" onClick={() => setWelcome(false)}>Done</button>}
      >
        <p style={{ marginTop: 0, color: "var(--ink-2)" }}>{s.name} has been added to the roster.</p>
        <div className="sect-lbl">Welcome letter</div>
        <p style={{ color: "var(--ink-2)", fontSize: 13 }}>
          {s.email ? <>Send the studio welcome letter to <b>{s.email}</b>.</> : "No email on file yet — add one on their record to send the welcome letter."}
        </p>
        {s.email && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <button className="btn" style={{ justifyContent: "center" }} onClick={() => send("welcome")}>Email welcome letter</button>
            <button className="btn ghost" style={{ justifyContent: "center" }} onClick={() => send("quest")}>Email artist questionnaire</button>
          </div>
        )}
      </Panel>
    </>
  );
}
