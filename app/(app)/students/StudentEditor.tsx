"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/useToast";
import { TRADE_DEFAULT } from "@/lib/domain/money";
import type { ClassRow, Enrollment, Student } from "@/lib/types";

type Plan = "perclass" | "unlimited" | "trade";

export const NEW_STUDENT: Student = {
  id: "", name: "", phone: "", email: "", emergency: "", status: "active",
  plan: "perclass", plan_amount: 1500, plan_months: 3, paid_through: null, pays_by: "Card",
  is_trade: false, trade_role: "", trade_value: TRADE_DEFAULT, tags: [], notes: "",
  welcome_sent: null, quest_sent: null, extras_sent: null, tuition_sent: null, agreement_sent: null,
};

/** Add / edit a student — the original "Edit record" panel, saving to Supabase. */
export default function StudentEditor({
  student, enrollments, classes, nextId, onDone,
}: {
  student: Student;
  enrollments: Enrollment[];
  classes: ClassRow[];
  nextId?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !student.id;
  const [d, setD] = useState<Student>({ ...student });
  const [plan, setPlan] = useState<Plan>(student.is_trade ? "trade" : (student.plan || "").toLowerCase() === "unlimited" ? "unlimited" : "perclass");
  const [en, setEn] = useState<Record<string, string>>(
    Object.fromEntries(enrollments.map((e) => [String(e.class_id), e.rate == null ? "" : String(e.rate)]))
  );
  const [tagsText, setTagsText] = useState((student.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Student>) => setD((x) => ({ ...x, ...p }));

  async function save() {
    const name = (d.name || "").trim();
    if (!name) return toast("Add a name first", true);
    const row: Partial<Student> = {
      name,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      emergency: d.emergency?.trim() || null,
      status: d.status || "active",
      notes: d.notes?.trim() || null,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      ...("start_date" in student ? { start_date: d.start_date || null } : {}),
      is_trade: plan === "trade",
      plan: plan === "unlimited" ? "unlimited" : "perclass",
    };
    if (plan === "unlimited") {
      Object.assign(row, {
        plan_amount: Number(d.plan_amount) || 1500,
        plan_months: Number(d.plan_months) || 3,
        paid_through: d.paid_through || null,
        pays_by: d.pays_by || "Card",
      });
    } else if (plan === "trade") {
      Object.assign(row, { trade_role: d.trade_role?.trim() || null, trade_value: Number(d.trade_value) || TRADE_DEFAULT, pays_by: "Trade" });
    } else {
      Object.assign(row, { pays_by: d.pays_by === "Trade" ? "Card" : d.pays_by || "Card" });
    }
    for (const [cid, r] of Object.entries(en)) {
      if (plan !== "unlimited" && (r.trim() === "" || !Number.isFinite(Number(r)))) {
        return toast(`Enter a rate for ${classes.find((c) => c.id === cid)?.name ?? "each class"}`, true);
      }
    }

    setSaving(true);
    const sb = createClient();
    let id = student.id;
    if (isNew) {
      let res = await sb.from("students").insert(nextId ? { ...row, id: nextId } : row).select("id").single();
      if (res.error && nextId && /duplicate/i.test(res.error.message)) {
        res = await sb.from("students").insert({ ...row, id: `s${Date.now().toString(36)}` }).select("id").single();
      }
      if (res.error) { setSaving(false); return toast(`Couldn't add: ${res.error.message}`, true); }
      id = String(res.data.id);
    } else {
      const { error } = await sb.from("students").update(row).eq("id", id);
      if (error) { setSaving(false); return toast(`Couldn't save: ${error.message}`, true); }
    }

    // Sync enrollments: remove unchecked, add new, update changed rates.
    const before = new Map(enrollments.map((e) => [String(e.class_id), e.rate]));
    const rateOf = (cid: string) => (plan === "unlimited" && en[cid].trim() === "" ? 0 : Number(en[cid]));
    const errs: string[] = [];
    for (const cid of before.keys()) {
      if (!(cid in en)) {
        const { error } = await sb.from("enrollments").delete().match({ student_id: id, class_id: cid });
        if (error) errs.push(error.message);
      }
    }
    for (const cid of Object.keys(en)) {
      if (!before.has(cid)) {
        const { error } = await sb.from("enrollments").insert({ student_id: id, class_id: cid, rate: rateOf(cid) });
        if (error) errs.push(error.message);
      } else if (Number(before.get(cid)) !== rateOf(cid)) {
        const { error } = await sb.from("enrollments").update({ rate: rateOf(cid) }).match({ student_id: id, class_id: cid });
        if (error) errs.push(error.message);
      }
    }
    setSaving(false);
    if (errs.length) toast(`Saved, but classes didn't fully update: ${errs[0]}`, true);
    else toast(isNew ? `${name} added` : "Record updated");
    if (isNew) router.push(`/students/${id}?welcome=1`);
    else { onDone?.(); router.refresh(); }
  }

  const seg = (on: boolean, label: string, fn: () => void) => <button type="button" className={on ? "on" : ""} onClick={fn}>{label}</button>;

  return (
    <>
      <div className="field"><label>Full name</label><input value={d.name} placeholder="First Last" onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="row2">
        <div className="field"><label>Phone</label><input type="tel" value={d.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></div>
        <div className="field"><label>Email</label><input type="email" value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></div>
      </div>
      {"start_date" in student && (
        <div className="field"><label>Start date</label>
          <input type="date" value={(d.start_date ?? "").slice(0, 10)} onChange={(e) => set({ start_date: e.target.value || null })} />
        </div>
      )}
      <div className="field"><label>Emergency contact</label><input value={d.emergency ?? ""} onChange={(e) => set({ emergency: e.target.value })} /></div>
      <div className="field"><label>Status</label>
        <div className="seg">
          {seg((d.status || "active") === "active", "Active", () => set({ status: "active" }))}
          {seg(d.status === "inactive", "Inactive", () => set({ status: "inactive" }))}
        </div>
      </div>

      <div className="sect-lbl">Payment plan</div>
      <div className="field"><label>Plan</label>
        <div className="seg">
          {seg(plan === "perclass", "Per-class", () => setPlan("perclass"))}
          {seg(plan === "unlimited", "Unlimited", () => setPlan("unlimited"))}
          {seg(plan === "trade", "Trade", () => setPlan("trade"))}
        </div>
      </div>
      {plan === "unlimited" ? (
        <>
          <div className="row2">
            <div className="field"><label>Amount</label><input type="number" value={d.plan_amount ?? 1500} onChange={(e) => set({ plan_amount: Number(e.target.value) })} /></div>
            <div className="field"><label>Every N months</label><input type="number" value={d.plan_months ?? 3} onChange={(e) => set({ plan_months: Number(e.target.value) })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Pays by</label>
              <select value={d.pays_by ?? "Card"} onChange={(e) => set({ pays_by: e.target.value })}>{["Card", "Venmo", "Cash"].map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <div className="field"><label>Paid through</label><input type="date" value={(d.paid_through ?? "").slice(0, 10)} onChange={(e) => set({ paid_through: e.target.value || null })} /></div>
          </div>
        </>
      ) : plan === "trade" ? (
        <>
          <div className="field"><label>Trade role</label><input value={d.trade_role ?? ""} placeholder="Camera · Producer · Footage Sender" onChange={(e) => set({ trade_role: e.target.value })} /></div>
          <div className="field"><label>Trade value / period</label><input type="number" inputMode="numeric" value={d.trade_value ?? TRADE_DEFAULT} onChange={(e) => set({ trade_value: Number(e.target.value) })} /></div>
        </>
      ) : (
        <div className="field"><label>Pays by</label>
          <select value={d.pays_by === "Trade" ? "Card" : d.pays_by ?? "Card"} onChange={(e) => set({ pays_by: e.target.value })}>{["Card", "Venmo", "Cash"].map((m) => <option key={m}>{m}</option>)}</select>
        </div>
      )}

      <div className="sect-lbl">Classes{plan === "unlimited" ? " (included)" : " & per-class rate"}</div>
      {classes.map((c) => {
        const on = c.id in en;
        return (
          <div key={c.id} className="enroll-row">
            <button type="button" className={`checkpill ${on ? "on" : ""}`} style={{ textAlign: "left" }}
              onClick={() => setEn((x) => { const n = { ...x }; if (on) delete n[c.id]; else n[c.id] = plan === "unlimited" ? "0" : "350"; return n; })}>
              {c.name}
            </button>
            {on && plan !== "unlimited" ? (
              <input className="enr-rate tnum" type="number" placeholder="rate" value={en[c.id]} onChange={(e) => setEn((x) => ({ ...x, [c.id]: e.target.value }))} />
            ) : <span />}
          </div>
        );
      })}
      {plan !== "unlimited" && <p className="ct" style={{ color: "var(--ink-3)", fontSize: 12 }}>New students: $350/period, or $325 paying cash.</p>}

      <div className="field" style={{ marginTop: 14 }}><label>Tags (comma separated)</label>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
      </div>
      <div className="field"><label>Notes</label><textarea value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDone && <button className="btn ghost" onClick={onDone}>Cancel</button>}
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add student" : "Save"}</button>
      </div>
    </>
  );
}
