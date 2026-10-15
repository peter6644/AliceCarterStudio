"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/lib/useToast";
import type { ClassRow, Scene } from "@/lib/types";

const ORD = ["1ST", "2ND", "3RD", "4TH", "5TH"];
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** "WED-NIGHT - SCENE STUDY" from the class's day, start time and format. */
function classLabel(cls: ClassRow) {
  const day = (cls.day || "").slice(0, 3).toUpperCase();
  const m = /(\d+)(?::\d+)?\s*([AP]M)/i.exec(cls.start_time || "");
  let part = "";
  if (m) {
    const h = (Number(m[1]) % 12) + (m[2].toUpperCase() === "PM" ? 12 : 0);
    part = h >= 17 ? "NIGHT" : h < 12 ? "AM" : "PM";
  }
  const fmt = (cls.format || cls.name || "").toUpperCase();
  return `${day}${part ? "-" + part : ""} - ${fmt}`;
}
const startLabel = (cls: ClassRow) => (cls.start_time || "").replace(/\s+/g, "").toUpperCase();

const DEFAULT_LOCATION = "Just a reminder that the class is upstairs above Tamashii Ramen House.\n11024 W Magnolia Blvd, North Hollywood, CA 91601";
const DEFAULT_SIG = "Best,\nPeter Alvarez\nClass Producer\n310-560-6759";

/** The weekly scene-list email, ready to edit and open in the producer's mail app. */
export default function EmailList({
  cls, date, weekNumber, scenes, recipients, onClose,
}: {
  cls: ClassRow;
  date: string;
  weekNumber: number;
  scenes: Scene[];
  recipients: { name: string; email: string }[];
  onClose: () => void;
}) {
  const toast = useToast();
  const locKey = `daybook:email-location:${cls.id}`;
  const sigKey = "daybook:email-signature";
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [sig, setSig] = useState(DEFAULT_SIG);
  useEffect(() => {
    setLocation(store.get(locKey) ?? DEFAULT_LOCATION);
    setSig(store.get(sigKey) ?? DEFAULT_SIG);
  }, [locKey]);

  const dateLabel = new Date(date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  const main = scenes.filter((s) => !s.alternate && !s.cancelled);
  const alts = scenes.filter((s) => s.alternate && !s.cancelled);
  const line = (s: Scene, i: number) => `${i + 1}- ${s.actors}- ${s.scene}`;

  const generated = useMemo(() => {
    const parts = [
      `REMINDER, WE ARE ENTERING THE ${ORD[weekNumber - 1] ?? weekNumber + "TH"} WEEK OF THE CURRENT PAY PERIOD.`,
      "PLEASE PAY ACCORDINGLY.",
      "",
      "THERE IS A $35 LATE FEE FOR TUITION NOT RECEIVED ON OR BEFORE THE FIRST DAY OF THE PAY PERIOD.",
      "",
      "PLEASE CONFIRM",
      "",
      location.trim(),
      "",
      "SCENE LIST",
      `Week ${weekNumber}`,
      ...main.map(line),
      ...(alts.length ? ["", "ALTERNATES", ...alts.map(line)] : []),
      "",
      sig.trim(),
    ];
    return parts.join("\n").replace(/\n{3,}/g, "\n\n");
  }, [weekNumber, location, sig, main, alts]);

  const [subject, setSubject] = useState(`${classLabel(cls)} - ${dateLabel} - ${startLabel(cls)} START`);
  const [body, setBody] = useState(generated);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setBody(generated); }, [generated, edited]);

  const emails = recipients.map((r) => r.email);
  const href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
    catch { toast("Couldn't copy — select the text and copy it", true); }
  }

  return (
    <>
      <div className="field">
        <label>To (BCC) · {emails.length} student{emails.length === 1 ? "" : "s"} in {cls.name}</label>
        <div className="ct" style={{ color: "var(--ink-2)", fontSize: 12.5 }}>
          {recipients.length ? recipients.map((r) => r.name).join(", ") : "No student emails on file for this class."}
        </div>
        {emails.length > 0 && <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => copy(emails.join(", "), "Emails")}>Copy emails</button>}
      </div>
      <div className="field"><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field">
        <label>Message {edited && <button type="button" onClick={() => setEdited(false)} style={{ border: "none", background: "none", color: "var(--brass-deep)", textDecoration: "underline", fontSize: 11, padding: 0, marginLeft: 6 }}>reset</button>}</label>
        <textarea rows={16} value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} style={{ fontSize: 13, lineHeight: 1.5 }} />
      </div>
      <details style={{ marginBottom: 14 }}>
        <summary className="ct" style={{ cursor: "pointer", color: "var(--brass-deep)", fontWeight: 600 }}>Location &amp; signature (saved on this device)</summary>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Location for {cls.name}</label>
          <textarea rows={2} value={location} onChange={(e) => { setLocation(e.target.value); store.set(locKey, e.target.value); }} />
        </div>
        <div className="field">
          <label>Signature</label>
          <textarea rows={4} value={sig} onChange={(e) => { setSig(e.target.value); store.set(sigKey, e.target.value); }} />
        </div>
      </details>
      {!main.length && <p className="error" style={{ fontSize: 13 }}>There are no scenes on this week yet.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="btn" href={href} onClick={() => setTimeout(onClose, 300)}>Open in email</a>
        <button type="button" className="btn ghost" onClick={() => copy(`${subject}\n\n${body}`, "Email")}>Copy text</button>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
