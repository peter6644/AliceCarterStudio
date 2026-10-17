"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import PaymentPanel, { type PayStudent } from "@/components/PaymentPanel";
import { initials, money } from "@/lib/format";
import type { Period } from "@/lib/types";

export type OweRow = { student: PayStudent; owes: number; sub: string };

/** Who owes this period — tap anyone to mark them paid, partial, or unpaid. */
export default function OutstandingList({ rows, period, openId }: { rows: OweRow[]; period: Period; openId?: string }) {
  const router = useRouter();
  const [owes, setOwes] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.student.id, r.owes])));
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PayStudent | null>(null);

  useEffect(() => setOwes(Object.fromEntries(rows.map((r) => [r.student.id, r.owes]))), [rows]);
  useEffect(() => {
    if (openId) setOpen(rows.find((r) => r.student.id === openId)?.student ?? null);
  }, [openId, rows]);

  // Keep anyone who was owing at load in view (so you see them flip to Paid), plus everyone if "show all".
  const owingAtLoad = useMemo(() => new Set(rows.filter((r) => r.owes > 0).map((r) => r.student.id)), [rows]);
  const n = q.trim().toLowerCase();
  const list = rows
    .filter((r) => showAll || n || owingAtLoad.has(r.student.id))
    .filter((r) => !n || r.student.name.toLowerCase().includes(n))
    .sort((a, b) => (owes[b.student.id] ?? 0) - (owes[a.student.id] ?? 0) || a.student.name.localeCompare(b.student.name));
  const owingNow = rows.filter((r) => (owes[r.student.id] ?? 0) > 0);
  const total = owingNow.reduce((a, r) => a + (owes[r.student.id] ?? 0), 0);

  return (
    <>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input placeholder="Find anyone to record a payment" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          <button className={`chip ${!showAll ? "on" : ""}`} onClick={() => setShowAll(false)}>Owing · {owingNow.length}</button>
          <button className={`chip ${showAll ? "on" : ""}`} onClick={() => setShowAll(true)}>Everyone · {rows.length}</button>
        </div>
      </div>
      {list.length ? (
        <div className="ledger">
          {list.map(({ student: s, sub }) => {
            const o = owes[s.id] ?? 0;
            return (
              <div key={s.id} className="rec" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => setOpen(s)}>
                <div className="who">
                  <div className="avatar">{initials(s.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{s.name}</div>
                    <div className="ct">{sub}</div>
                    {s.notes && <div className="ct" style={{ color: "var(--brass-deep)" }}>📝 {s.notes}</div>}
                  </div>
                </div>
                <div style={{ justifySelf: "end", display: "flex", gap: 10, alignItems: "center" }}>
                  <span className={`pill ${o > 0 ? "due" : "paid"}`}>{o > 0 ? money(o) : "Paid"}</span>
                  <span className="tag">{o > 0 ? "Record" : "Edit"}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ledger"><div className="empty"><span className="serif">All settled</span>No balances due this session.</div></div>
      )}
      <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>
        <b>{owingNow.length}</b> student{owingNow.length === 1 ? "" : "s"} owing · <b style={{ color: "var(--oxblood)" }}>{money(total)}</b> outstanding this session
      </div>

      <PaymentPanel
        student={open}
        period={period}
        onClose={() => setOpen(null)}
        onSaved={(id, left) => {
          setOwes((x) => ({ ...x, [id]: left }));
          setOpen(null);
          router.refresh();
        }}
      />
    </>
  );
}
