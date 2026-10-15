"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";

export type RosterRow = {
  id: string;
  name: string;
  search: string;
  active: boolean;
  away: boolean;
  classIds: string[];
  classNames: string[];
  sub: string;
  unlimited: boolean;
  trade: boolean;
  owing: boolean;
  standing: { cls: string; text: string };
};

export default function Roster({ rows, classes, period }: { rows: RosterRow[]; classes: { id: string; name: string }[]; period: number }) {
  const [status, setStatus] = useState<"all" | "active" | "away" | "inactive">("active");
  const [flag, setFlag] = useState<"all" | "owing" | "trade" | "unlimited" | "multi">("all");
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");

  const activeN = rows.filter((r) => r.active).length;
  const awayN = rows.filter((r) => r.away).length;

  const list = useMemo(() => {
    let l = status === "all" ? rows : status === "away" ? rows.filter((r) => r.away) : rows.filter((r) => (status === "active" ? r.active : !r.active));
    const n = q.trim().toLowerCase();
    if (n) l = l.filter((r) => r.search.includes(n));
    if (cls !== "all") l = l.filter((r) => r.classIds.includes(cls));
    if (flag === "owing") l = l.filter((r) => r.owing);
    if (flag === "trade") l = l.filter((r) => r.trade);
    if (flag === "unlimited") l = l.filter((r) => r.unlimited);
    if (flag === "multi") l = l.filter((r) => r.classIds.length > 1 && !r.unlimited);
    return [...l].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, status, flag, cls, q]);

  const chip = (on: boolean, label: string, fn: () => void) => (
    <button key={label} className={`chip ${on ? "on" : ""}`} onClick={fn}>{label}</button>
  );

  return (
    <>
      <div className="chapter">
        <div className="top">
          <div>
            <div className="eyebrow">{activeN} active · {rows.length - activeN} inactive</div>
            <h1>Master Roster</h1>
            <div className="desc">Every student, split by standing. Tap anyone to see classes, per-class rates, and their balance.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn ghost" href="/templates">Email templates</Link>
            <Link className="btn" href="/students/new"><Icon name="plus" />Add student</Link>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg segscroll" style={{ maxWidth: 520 }}>
          <button className={status === "all" ? "on" : ""} onClick={() => setStatus("all")}>All · {rows.length}</button>
          <button className={status === "active" ? "on" : ""} onClick={() => setStatus("active")}>Active · {activeN}</button>
          <button className={status === "away" ? "on" : ""} onClick={() => setStatus("away")}>Away · {awayN}</button>
          <button className={status === "inactive" ? "on" : ""} onClick={() => setStatus("inactive")}>Inactive · {rows.length - activeN}</button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input placeholder="Search name, role, note" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          {chip(flag === "all", "All", () => setFlag("all"))}
          {chip(flag === "owing", "Owing", () => setFlag("owing"))}
          {chip(flag === "trade", "Trade", () => setFlag("trade"))}
          {chip(flag === "unlimited", "Unlimited", () => setFlag("unlimited"))}
          {chip(flag === "multi", "Multi", () => setFlag("multi"))}
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: -4 }}>
        <div className="chips">
          {chip(cls === "all", "All classes", () => setCls("all"))}
          {classes.map((c) => chip(cls === c.id, c.name, () => setCls(c.id)))}
        </div>
      </div>

      <div className="ledger">
        <div className="lhead roster"><span>Student</span><span>Classes</span><span>Standing · PP{period}</span><span /></div>
        {list.length ? (
          list.map((s) => (
            <Link key={s.id} className="rec roster" href={`/students/${s.id}`}>
              <div className="who">
                <div className="avatar">{initials(s.name)}</div>
                <div>
                  <div className="nm">{s.name}{s.away && <> <span className="tag awaytag">Away</span></>}</div>
                  <div className="ct">{s.sub}</div>
                </div>
              </div>
              <div className="cls clscell">
                {s.classNames.length ? s.classNames.map((n) => <span key={n} className="tag">{n}</span>) : <span className="ct">No class</span>}
                {s.unlimited ? <span className="tag" style={{ background: "rgba(91,46,229,.12)", color: "#5b2ee5" }}>Unlimited</span>
                  : s.classIds.length > 1 ? <span className="tag" style={{ background: "var(--wash-ox)", color: "var(--oxblood)" }}>Multi</span> : null}
              </div>
              <div className="paycell"><span className={`pill ${s.standing.cls}`}>{s.standing.text}</span></div>
              <span className="arrow"><Icon name="arrow" /></span>
            </Link>
          ))
        ) : (
          <div className="empty"><span className="serif">No one matches</span>Adjust the filters above.</div>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-3)" }}>{list.length} shown</div>
    </>
  );
}
