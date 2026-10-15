"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import Panel from "@/components/Panel";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/useToast";
import { initials } from "@/lib/format";
import { mailtoHref, template } from "@/lib/templates";
import { today } from "@/lib/write";
import type { Inquiry } from "@/lib/types";

const STATUSES = ["new", "contacted", "trial", "enrolled", "passed"] as const;
const BADGE: Record<string, [string, string, string]> = {
  new: ["New", "var(--ink-2)", "var(--rule-soft)"],
  contacted: ["Contacted", "var(--brass-deep)", "var(--wash-brass)"],
  trial: ["Trial", "#5b2ee5", "rgba(91,46,229,.13)"],
  enrolled: ["Enrolled", "var(--moss)", "var(--wash-moss)"],
  passed: ["Passed", "var(--ink-3)", "var(--rule-soft)"],
};
const Badge = ({ st }: { st: string | null }) => {
  const m = BADGE[st || "new"] ?? BADGE.new;
  return <span className="badge" style={{ color: m[1], background: m[2] }}>{m[0]}</span>;
};
const cols = "1.8fr 1.6fr .9fr .9fr 30px";

export default function Inquiries({ initial, openNew }: { initial: Inquiry[]; openNew: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [d, setD] = useState<Inquiry | null>(null);
  const [saving, setSaving] = useState(false);

  const blank = (): Inquiry => ({ id: "", name: "", phone: "", email: "", status: "new", source: "", label: "", notes: "", created: today() });
  useEffect(() => { if (openNew) setD(blank()); }, [openNew]);

  const list = useMemo(() => {
    let l = rows;
    const n = q.trim().toLowerCase();
    if (n) l = l.filter((x) => `${x.name ?? ""}${x.email ?? ""}${x.phone ?? ""}${x.source ?? ""}${x.label ?? ""}`.toLowerCase().includes(n));
    if (status !== "all") l = l.filter((x) => (x.status || "new") === status);
    return l;
  }, [rows, q, status]);
  const shown = list.slice(0, 80);
  const cnt = (st: string) => rows.filter((x) => (x.status || "new") === st).length;

  async function persist(x: Inquiry): Promise<Inquiry | null> {
    const sb = createClient();
    const { id, ...row } = x;
    if (id) {
      const { error } = await sb.from("inquiries").update(row).eq("id", id);
      if (error) { toast(`Couldn't save: ${error.message}`, true); return null; }
      setRows((rs) => rs.map((r) => (r.id === id ? x : r)));
      return x;
    }
    let res = await sb.from("inquiries").insert(row).select("*").single();
    if (res.error && /null value in column "id"/i.test(res.error.message)) {
      res = await sb.from("inquiries").insert({ ...row, id: `l${Date.now().toString(36)}` }).select("*").single();
    }
    if (res.error) { toast(`Couldn't save: ${res.error.message}`, true); return null; }
    const saved = { ...(res.data as Inquiry), id: String(res.data.id) };
    setRows((rs) => [saved, ...rs]);
    return saved;
  }

  async function save() {
    if (!d) return;
    setSaving(true);
    const ok = await persist({ ...d, name: d.name?.trim() || "", email: d.email?.trim() || null, phone: d.phone?.trim() || null });
    setSaving(false);
    if (ok) { setD(null); toast("Inquiry saved"); }
  }

  async function sendInfo() {
    if (!d?.email) return toast("No email on file", true);
    window.location.href = mailtoHref(d.email, template("info"));
    const next = { ...d, status: d.status === "new" || !d.status ? "contacted" : d.status };
    const saved = await persist(next);
    if (saved) { setD(saved); toast("Class info opened in your email"); }
  }

  async function convert() {
    if (!d) return;
    const saved = await persist({ ...d, status: "enrolled" });
    if (!saved) return;
    const qs = new URLSearchParams({
      name: saved.name ?? "", email: saved.email ?? "", phone: saved.phone ?? "",
      notes: `From inquiry ${saved.created ?? ""}`.trim(),
    });
    router.push(`/students/new?${qs}`);
  }

  async function remove() {
    if (!d?.id || !confirm("Delete this inquiry?")) return;
    const { error } = await createClient().from("inquiries").delete().eq("id", d.id);
    if (error) return toast(`Couldn't delete: ${error.message}`, true);
    setRows((rs) => rs.filter((r) => r.id !== d.id));
    setD(null);
    toast("Inquiry deleted");
  }

  const chip = (v: string, l: string) => <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}>{l}</button>;

  return (
    <>
      <div className="chapter">
        <div className="top">
          <div>
            <div className="eyebrow">{rows.length} inquiries · {cnt("new")} new</div>
            <h1>Inquiries</h1>
            <div className="desc">Everyone who has reached out through the site. Work them down the pipeline, and convert to a student when they enroll.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn ghost" href="/templates">Templates</a>
            <button className="btn" onClick={() => setD(blank())}><Icon name="plus" />Add inquiry</button>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input placeholder="Search name, email, source" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          {chip("all", "All")}
          {STATUSES.map((s) => chip(s, BADGE[s][0]))}
        </div>
      </div>
      <div className="ledger">
        <div className="lhead" style={{ gridTemplateColumns: cols }}><span>Name</span><span>Contact</span><span>Reached out</span><span>Status</span><span /></div>
        {shown.length ? shown.map((l) => (
          <div key={l.id} className="rec" style={{ gridTemplateColumns: cols }} onClick={() => setD(l)}>
            <div className="who"><div className="avatar">{initials(l.name || "?")}</div><div><div className="nm">{l.name || "—"}</div><div className="ct">{l.source || l.label || "Inquiry"}</div></div></div>
            <div className="ct" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l.email || l.phone || "—"}</div>
            <div className="ct">{l.created || "—"}</div>
            <div><Badge st={l.status} /></div>
            <span className="arrow"><Icon name="arrow" /></span>
          </div>
        )) : <div className="empty"><span className="serif">No inquiries match</span>Adjust the filters above.</div>}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-3)" }}>Showing {shown.length} of {list.length}{list.length > 80 ? " — refine with search" : ""}</div>

      <Panel
        open={!!d}
        onClose={() => setD(null)}
        head={<><div className="eyebrow">Inquiry{d?.created ? ` · ${d.created}` : ""}</div><h2>{d?.name || "New inquiry"}</h2></>}
        foot={<>
          {d?.id && <button className="btn ghost" onClick={remove} style={{ color: "var(--oxblood)", borderColor: "var(--oxblood)" }}>Delete</button>}
          <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>}
      >
        {d && (
          <>
            <div className="row2">
              <div className="field"><label>Name</label><input value={d.name ?? ""} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
              <div className="field"><label>Reached out</label><input type="date" value={d.created ?? ""} onChange={(e) => setD({ ...d, created: e.target.value || null })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Email</label><input type="email" value={d.email ?? ""} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input type="tel" value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Source</label><input value={d.source ?? ""} onChange={(e) => setD({ ...d, source: e.target.value })} /></div>
              <div className="field"><label>Label</label><input value={d.label ?? ""} onChange={(e) => setD({ ...d, label: e.target.value })} /></div>
            </div>
            <div className="field"><label>Status</label>
              <select value={d.status || "new"} onChange={(e) => setD({ ...d, status: e.target.value })}>
                {STATUSES.map((v) => <option key={v} value={v}>{BADGE[v][0]}</option>)}
              </select>
            </div>
            <div className="field"><label>Notes</label><textarea value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
            {d.email && (
              <>
                <button className="btn ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={sendInfo}>Send class info &amp; schedule</button>
                <a className="btn ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} href={`mailto:${d.email}`}>Email {(d.name || "").split(" ")[0]}</a>
              </>
            )}
            <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={convert}>Convert to student</button>
          </>
        )}
      </Panel>
    </>
  );
}
