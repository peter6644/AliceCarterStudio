"use client";

import { useMemo, useState } from "react";

export type PickStudent = { id: string; name: string; inClass: boolean };

/** Split a legacy "Reece & Sariah" pairing into names. */
export function splitActors(text: string | null | undefined) {
  return (text || "").split(/\s*(?:&|,|\/|\band\b|\+)\s*/i).map((x) => x.trim()).filter(Boolean);
}

/** Match typed/legacy names to roster students (full name, else a unique first-name match, class first). */
export function matchNames(parts: string[], students: PickStudent[]) {
  const ids: string[] = [];
  const others: string[] = [];
  for (const p of parts) {
    const lp = p.toLowerCase();
    let hit = students.find((s) => s.name.toLowerCase() === lp);
    if (!hit) {
      const starts = (pool: PickStudent[]) => pool.filter((s) => s.name.toLowerCase().split(/\s+/)[0] === lp.split(/\s+/)[0] && s.name.toLowerCase().startsWith(lp));
      const inCls = starts(students.filter((s) => s.inClass));
      const all = starts(students);
      hit = inCls.length === 1 ? inCls[0] : all.length === 1 ? all[0] : undefined;
    }
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
    else if (!hit) others.push(p);
  }
  return { ids, others };
}

/** Search-and-tap partner picker. Roster students are linked; anyone else can be added by name. */
export default function PartnerPicker({
  students, ids, others, onChange,
}: {
  students: PickStudent[];
  ids: string[];
  others: string[];
  onChange: (ids: string[], others: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const n = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!n) return [];
    return students
      .filter((s) => !ids.includes(s.id) && s.name.toLowerCase().split(/\s+/).some((w, i, arr) => arr.slice(i).join(" ").startsWith(n)) )
      .sort((a, b) => Number(b.inClass) - Number(a.inClass) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [n, students, ids]);

  const add = (id: string) => { onChange([...ids, id], others); setQ(""); };
  const addOther = () => { if (q.trim()) { onChange(ids, [...others, q.trim()]); setQ(""); } };

  return (
    <div>
      {(ids.length > 0 || others.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {ids.map((id) => (
            <span key={id} className="checkpill on" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {byId.get(id)?.name ?? id}
              <button type="button" aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id), others)}
                style={{ border: "none", background: "none", color: "inherit", fontWeight: 700, padding: 0 }}>×</button>
            </span>
          ))}
          {others.map((o, i) => (
            <span key={`o${i}`} className="checkpill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="Not linked to a roster student">
              {o} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>(not on roster)</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(ids, others.filter((_, j) => j !== i))}
                style={{ border: "none", background: "none", color: "inherit", fontWeight: 700, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={q}
        placeholder={ids.length + others.length ? "Add another partner…" : "Type a name, e.g. Reece"}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (matches[0]) add(matches[0].id); else addOther(); }
        }}
      />
      {n && (
        <div className="addresults" style={{ marginTop: 6 }}>
          {matches.map((s) => (
            <button key={s.id} type="button" className="addrow" onClick={() => add(s.id)}>
              <span><span className="arn">{s.name}</span><span className="art">{s.inClass ? "in this class" : "other class"}</span></span>
              <span className="addplus">+ add</span>
            </button>
          ))}
          <button type="button" className="addrow" onClick={addOther}>
            <span><span className="arn">Add “{q.trim()}”</span><span className="art">not on the roster — won&apos;t link to a student</span></span>
            <span className="addplus">+ add</span>
          </button>
        </div>
      )}
    </div>
  );
}
