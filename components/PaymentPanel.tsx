"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Panel from "@/components/Panel";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/useToast";
import { fmtD, fmtFull, money } from "@/lib/format";
import { CASH, recOut } from "@/lib/domain/money";
import { saveRec, today } from "@/lib/write";
import type { Period, Rec } from "@/lib/types";

export type PayClassRow = { classId: string; className: string; rate: number; rec: Rec };
export type PayStudent = {
  id: string;
  name: string;
  notes: string | null;
  /** undefined = the students table has no start_date column yet */
  startDate?: string | null;
  unlimited: boolean;
  planAmount: number;
  planMonths: number;
  planCovered: boolean;
  paidThrough: string | null;
  isTrade: boolean;
  rows: PayClassRow[];
};

const METHODS = ["Unpaid", "Venmo", "Card", "Cash", "Trade"];

function addMonths(base: string, m: number) {
  const d = new Date(base.slice(0, 10) + "T00:00");
  d.setMonth(d.getMonth() + (m || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Slide-over to mark a student paid / unpaid / partial for a period, adjust what's due, and keep notes. */
export default function PaymentPanel({
  student, period, onClose, onSaved,
}: {
  student: PayStudent | null;
  period: Period;
  onClose: () => void;
  onSaved: (studentId: string, owes: number) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<PayClassRow[]>([]);
  const [notes, setNotes] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [planMethod, setPlanMethod] = useState("Card");

  useEffect(() => {
    if (!student) return;
    setRows(student.rows.map((r) => ({ ...r, rec: { ...r.rec } })));
    setNotes(student.notes ?? "");
    setStart(student.startDate ?? "");
  }, [student]);

  if (!student) return <Panel open={false} onClose={onClose} head={null}>{null}</Panel>;
  const s = student;
  const owes = rows.reduce((a, r) => a + recOut(r.rec), 0);

  const setRec = (i: number, patch: Partial<Rec>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, rec: { ...r.rec, ...patch } } : r)));

  function setMethod(i: number, m: string) {
    const r = rows[i].rec;
    const patch: Partial<Rec> = { paid_by: m };
    if (CASH.includes(m)) { if (!r.paid_date) patch.paid_date = today(); }
    else { patch.amount_paid = null; if (m === "Unpaid") patch.paid_date = null; }
    setRec(i, patch);
  }

  async function save(markAllPaid?: string) {
    setBusy(true);
    let next = rows;
    if (markAllPaid) {
      next = rows.map((r) => ({ ...r, rec: { ...r.rec, paid_by: markAllPaid, amount_paid: null, paid_date: r.rec.paid_date || today() } }));
      setRows(next);
    }
    const errs: string[] = [];
    for (const r of next) {
      const rec = { ...r.rec };
      if (rec.amount_paid != null && rec.amount_paid >= (Number(rec.tuition_due) || 0)) rec.amount_paid = null;
      const e = await saveRec(rec);
      if (e) errs.push(`${r.className}: ${e}`);
    }
    const sb = createClient();
    const patch: Record<string, unknown> = {};
    if ((s.notes ?? "") !== notes) patch.notes = notes.trim() || null;
    if (s.startDate !== undefined && (s.startDate ?? "") !== start) patch.start_date = start || null;
    if (Object.keys(patch).length) {
      const { error } = await sb.from("students").update(patch).eq("id", s.id);
      if (error) errs.push(`notes: ${error.message}`);
    }
    setBusy(false);
    if (errs.length) return toast(`Couldn't save — ${errs[0]}`, true);
    const left = next.reduce((a, r) => a + recOut(r.rec), 0);
    toast(left > 0 ? `Saved · ${money(left)} still owed` : `${s.name} · paid`);
    onSaved(s.id, left);
  }

  async function saveStudentOnly() {
    const patch: Record<string, unknown> = {};
    if ((s.notes ?? "") !== notes) patch.notes = notes.trim() || null;
    if (s.startDate !== undefined && (s.startDate ?? "") !== start) patch.start_date = start || null;
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    const { error } = await createClient().from("students").update(patch).eq("id", s.id);
    setBusy(false);
    if (error) return toast(`Couldn't save: ${error.message}`, true);
    toast("Notes saved");
    onSaved(s.id, s.planCovered ? 0 : s.planAmount);
  }

  async function recordPlan() {
    setBusy(true);
    const sb = createClient();
    const paidThrough = addMonths(period.end, s.planMonths || 3);
    const ins = await sb.from("plan_payments").insert({ period: period.n, student_id: s.id, amount: s.planAmount, method: planMethod, paid_date: today() });
    if (ins.error) { setBusy(false); return toast(`Couldn't record: ${ins.error.message}`, true); }
    const up = await sb.from("students").update({ paid_through: paidThrough, pays_by: planMethod, ...(notes !== (s.notes ?? "") ? { notes: notes.trim() || null } : {}) }).eq("id", s.id);
    setBusy(false);
    if (up.error) return toast(`Payment saved, but paid-through didn't update: ${up.error.message}`, true);
    toast(`${money(s.planAmount)} · ${planMethod} · covered through ${fmtD(paidThrough)}`);
    onSaved(s.id, 0);
  }

  return (
    <Panel
      open
      onClose={onClose}
      head={<><div className="eyebrow">PP{period.n} · {fmtD(period.start)}–{fmtD(period.end)}</div><h2>{s.name}</h2></>}
      foot={s.unlimited ? (
        <>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" disabled={busy} onClick={saveStudentOnly}>{busy ? "Saving…" : "Save notes"}</button>
        </>
      ) : (
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save"}</button>
        </>
      )}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className={`pill ${owes > 0 || (s.unlimited && !s.planCovered) ? "due" : "paid"}`}>
          {s.unlimited ? (s.planCovered ? "Plan covered" : `Plan due ${money(s.planAmount)}`) : owes > 0 ? `Owes ${money(owes)}` : "Paid"}
        </span>
        <Link href={`/students/${s.id}`} className="ct" style={{ color: "var(--brass-deep)", fontWeight: 600, textDecoration: "none" }}>Open record ›</Link>
      </div>

      {s.unlimited ? (
        <>
          <div className="drow"><span className="l">Unlimited plan</span><span className="r">{money(s.planAmount)} / {s.planMonths} mo</span></div>
          <div className="drow"><span className="l">Paid through</span><span className="r">{s.paidThrough ? fmtFull(s.paidThrough) : "—"}</span></div>
          <div className="field" style={{ marginTop: 14 }}><label>Method</label>
            <select value={planMethod} onChange={(e) => setPlanMethod(e.target.value)}>{["Card", "Venmo", "Cash"].map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={recordPlan}>Record {money(s.planAmount)} plan payment</button>
        </>
      ) : (
        <>
          {rows.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="ct" style={{ alignSelf: "center", color: "var(--ink-3)" }}>Mark all classes paid:</span>
              {["Venmo", "Card", "Cash"].map((m) => <button key={m} className="btn ghost sm" disabled={busy} onClick={() => save(m)}>{m}</button>)}
            </div>
          )}
          {rows.map((r, i) => {
            const due = Number(r.rec.tuition_due) || 0;
            const o = recOut(r.rec);
            const cash = CASH.includes(r.rec.paid_by || "");
            const perClass = r.rate / 4;
            return (
              <div key={r.classId} className="cincard" style={{ marginBottom: 12 }}>
                <div className="cinhead" style={{ marginBottom: 8 }}>
                  <div className="cinname">{r.className}</div>
                  <span className={o > 0 ? "owe-mini" : "ok-mini"}>{o > 0 ? `${money(o)} owed` : "✓ Paid"}</span>
                </div>
                <div className="seg" style={{ marginBottom: 10 }}>
                  {METHODS.map((m) => (
                    <button key={m} type="button" className={(r.rec.paid_by || "Unpaid") === m ? "on" : ""} onClick={() => setMethod(i, m)}>{m}</button>
                  ))}
                </div>
                <div className="row2">
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>Due this period</label>
                    <input inputMode="decimal" value={r.rec.tuition_due ?? ""} onChange={(e) => setRec(i, { tuition_due: e.target.value === "" ? 0 : Number(e.target.value) })} />
                  </div>
                  {cash && (
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>Amount paid</label>
                      <input inputMode="decimal" placeholder={`${due} (in full)`} value={r.rec.amount_paid ?? ""}
                        onChange={(e) => setRec(i, { amount_paid: e.target.value === "" ? null : Number(e.target.value) })} />
                    </div>
                  )}
                </div>
                {perClass > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <span className="ct" style={{ color: "var(--ink-3)", alignSelf: "center", fontSize: 12 }}>Classes:</span>
                    {[3, 4, 5, 6].map((n) => (
                      <button key={n} type="button" className={`chip ${Math.abs(due - perClass * n) < 0.01 ? "on" : ""}`} style={{ padding: "5px 10px" }}
                        onClick={() => setRec(i, { tuition_due: Math.round(perClass * n * 100) / 100 })}>
                        {n} · {money(perClass * n)}
                      </button>
                    ))}
                  </div>
                )}
                {cash && (
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>Paid on</label>
                    <input type="date" value={(r.rec.paid_date ?? "").slice(0, 10)} onChange={(e) => setRec(i, { paid_date: e.target.value || null })} />
                  </div>
                )}
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Note for this period</label>
                  <input value={r.rec.notes ?? ""} placeholder="e.g. paid for 5 classes to line up with the pay period"
                    onChange={(e) => setRec(i, { notes: e.target.value })} />
                </div>
              </div>
            );
          })}
          {!rows.length && <p className="muted">Not enrolled in any class this period.</p>}
        </>
      )}

      <div className="sect-lbl">Student notes</div>
      {s.startDate !== undefined ? (
        <div className="field">
          <label>Start date</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      ) : null}
      <div className="field">
        <label>Notes (shown on check-in)</label>
        <textarea rows={3} value={notes} placeholder="e.g. Started Oct 8. Next payment covers 5 classes to align with PP11." onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Panel>
  );
}
