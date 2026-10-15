"use client";

import { useMemo, useState } from "react";
import { matchNames, splitActors, type PickStudent } from "./PartnerPicker";
import { ordinal } from "@/lib/format";

export type ParsedScene = { actors: string; scene: string; ids: string[]; others: string[] };

/**
 * Parse a pasted list, one scene per line, e.g.
 *   1- Darren & Shannon- The Apartment
 *   2. Clem & Shannon – Fight Club
 * Lines that don't look like "partners - scene" (headers, blank lines) are skipped.
 */
export function parseSceneList(text: string, students: PickStudent[]): ParsedScene[] {
  const out: ParsedScene[] = [];
  // Put each numbered item on its own line, even if pasted run together ("Wednesday night -- 1- …").
  const lines = text.replace(/\s+(?=\d{1,2}\s*[-.)]\s*\S)/g, "\n").split(/\r?\n/);
  for (const raw of lines) {
    if (!/^\s*(?:\d+|[•*·])/.test(raw) && /[-–—]{2,}\s*$/.test(raw.trim())) continue; // header like "Wednesday night --"
    const line = raw.replace(/^\s*(?:\d+|[•*·])\s*[-.):]?\s*/, "").trim();
    const m = /^(.*?)\s*[-–—:]\s+(.+)$/.exec(line) || /^(.*?)\s+[-–—]\s*(.+)$/.exec(line);
    if (!m) continue;
    const actors = m[1].trim().replace(/\s+/g, " ");
    const scene = m[2].trim().replace(/\s+/g, " ");
    if (!actors || !scene) continue;
    const { ids, others } = matchNames(splitActors(actors), students);
    out.push({ actors, scene, ids, others });
  }
  return out;
}

export default function PasteScenes({
  students, dateGroups, defaultDate, isWed, onAdd, onCancel,
}: {
  students: PickStudent[];
  dateGroups: { label: string; dates: { iso: string; label: string }[] }[];
  defaultDate: string;
  isWed: boolean;
  onAdd: (rows: ParsedScene[], date: string, work: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [work, setWork] = useState(1);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseSceneList(text, students), [text, students]);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? id;
  const chosen = rows.filter((_, i) => !skip.has(i));
  const unmatched = chosen.reduce((a, r) => a + r.others.length, 0);

  return (
    <>
      <p style={{ marginTop: 0, color: "var(--ink-2)", fontSize: 13 }}>
        Paste the list — one scene per line, like <i>1- Darren &amp; Shannon- The Apartment</i>. Names are matched to students
        (this class first). Anything that can&apos;t be matched is still added by name; you can link it later by opening the scene.
      </p>
      <div className="field">
        <label>List</label>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1- Darren & Shannon- The Apartment\n2- Clem & Shannon- Fight Club"} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Week of</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dateGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.dates.map((d) => <option key={d.iso} value={d.iso}>{d.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {isWed && (
          <div className="field">
            <label>Work</label>
            <select value={work} onChange={(e) => setWork(Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{ordinal(n)} work</option>)}
            </select>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="sect-lbl">Preview · {chosen.length} scene{chosen.length === 1 ? "" : "s"}</div>
          <div className="ledger">
            {rows.map((r, i) => {
              const off = skip.has(i);
              return (
                <div key={i} className="slrow" style={{ cursor: "default", opacity: off ? 0.45 : 1 }}>
                  <div className="slnum">{i + 1}</div>
                  <div className="slmain">
                    <div className="slpair" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {r.ids.map((id) => <span key={id} className="tag" style={{ background: "var(--wash-moss)", color: "var(--moss)" }}>✓ {nameOf(id)}</span>)}
                      {r.others.map((o) => <span key={o} className="tag" style={{ background: "var(--wash-ox)", color: "var(--oxblood)" }} title="Not matched to a student">? {o}</span>)}
                    </div>
                    <div className="slscene">{r.scene}</div>
                  </div>
                  <button type="button" className="btn ghost sm" onClick={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                    {off ? "Include" : "Skip"}
                  </button>
                </div>
              );
            })}
          </div>
          {unmatched > 0 && (
            <p className="ct" style={{ color: "var(--oxblood)", fontSize: 12.5, marginTop: 8 }}>
              {unmatched} name{unmatched === 1 ? "" : "s"} marked ? couldn&apos;t be matched (not on the roster, or more than one student has that name).
            </p>
          )}
        </>
      )}
      {text.trim() && !rows.length && <p className="error">No scenes found — each line needs partners, a dash, then the scene.</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="btn"
          disabled={!chosen.length || busy}
          onClick={async () => { setBusy(true); await onAdd(chosen, date, work); setBusy(false); }}
        >
          {busy ? "Adding…" : `Add ${chosen.length || ""} scene${chosen.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </>
  );
}
