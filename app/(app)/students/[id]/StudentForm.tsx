"use client";

import { useActionState } from "react";
import { saveStudent, type SaveState } from "./actions";

export type EditableStudent = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  emergency: string | null;
  status: string | null;
  notes: string | null;
  tags: string[] | null;
  is_trade: boolean | null;
  trade_role: string | null;
  trade_value: number | null;
  welcome_sent: boolean | null;
  quest_sent: boolean | null;
  extras_sent: boolean | null;
  tuition_sent: boolean | null;
  agreement_sent: boolean | null;
};

const FLAGS: [keyof EditableStudent, string][] = [
  ["welcome_sent", "Welcome / policies"],
  ["quest_sent", "Artist questionnaire"],
  ["tuition_sent", "Tuition policy"],
  ["extras_sent", "Supplemental list"],
  ["agreement_sent", "Payment agreement"],
];

export default function StudentForm({ student, statuses }: { student: EditableStudent; statuses: string[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(
    saveStudent.bind(null, student.id),
    {}
  );

  return (
    <form action={action} className="card">
      <h2>Details</h2>
      <div className="grid2">
        <div className="field"><label>Name</label><input name="name" defaultValue={student.name} required /></div>
        <div className="field">
          <label>Status</label>
          <input name="status" defaultValue={student.status ?? ""} list="statuses" />
          <datalist id="statuses">{statuses.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="field"><label>Phone</label><input name="phone" type="tel" defaultValue={student.phone ?? ""} /></div>
        <div className="field"><label>Email</label><input name="email" type="email" defaultValue={student.email ?? ""} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Emergency contact</label><input name="emergency" defaultValue={student.emergency ?? ""} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Tags (comma separated)</label><input name="tags" defaultValue={(student.tags ?? []).join(", ")} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Notes</label><textarea name="notes" rows={3} defaultValue={student.notes ?? ""} />
        </div>
      </div>

      <h3 style={{ fontSize: "1.05rem", margin: "8px 0" }}>Trade</h3>
      <div className="grid2">
        <label className="check"><input type="checkbox" name="is_trade" defaultChecked={!!student.is_trade} /> Pays by trade</label>
        <span />
        <div className="field"><label>Trade role</label><input name="trade_role" defaultValue={student.trade_role ?? ""} /></div>
        <div className="field">
          <label>Trade value ($)</label>
          <input name="trade_value" inputMode="decimal" defaultValue={student.trade_value ?? 305} />
        </div>
      </div>

      <h3 style={{ fontSize: "1.05rem", margin: "8px 0" }}>Onboarding sent</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginBottom: 16 }}>
        {FLAGS.map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" name={k} defaultChecked={!!student[k]} /> {label}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        {state.ok && !pending && <span style={{ color: "var(--moss)" }}>Saved</span>}
        {state.error && <span className="error">{state.error}</span>}
      </div>
    </form>
  );
}
