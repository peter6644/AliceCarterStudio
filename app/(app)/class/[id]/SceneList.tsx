"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import Panel from "@/components/Panel";
import { useToast } from "@/lib/useToast";
import { createClient } from "@/lib/supabase/client";
import { fmtFull, ordinal } from "@/lib/format";
import type { ClassRow, Scene } from "@/lib/types";

type Lite = { id: string; name: string };

const fmtShort = (iso: string) =>
  new Date(iso + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const blank = (cid: string, date: string): Scene => ({
  id: "", class_id: cid, date, actors: "", actor_ids: [], actor_other: null, scene: "",
  work: 1, complete: false, alternate: false, cancelled: false, picked_up_by: "", notes: "",
});

/** Rotation pool for Wednesday classes — ported from the original poolFor(). */
function poolFor(scenes: Scene[]) {
  const g = new Map<string, Scene[]>();
  for (const x of scenes) {
    const k = `${x.actors}|${x.scene}`;
    g.set(k, [...(g.get(k) ?? []), x]);
  }
  return [...g.entries()]
    .map(([key, a]) => {
      a.sort((x, y) => x.date.localeCompare(y.date));
      const complete = a.some((z) => z.complete && !z.cancelled);
      const dw = a.filter((z) => !z.cancelled).map((z) => z.work || 0);
      const worksDone = dw.length ? Math.max(...dw) : 0;
      const last = a[a.length - 1];
      const next = last.cancelled ? last.work || 1 : worksDone + 1;
      const label = last.cancelled
        ? `cancelled — re-run ${ordinal(last.work || 1)}`
        : worksDone ? `${ordinal(worksDone)} work latest` : "not yet worked";
      return { key, first: a[0], complete, next, label };
    })
    .filter((z) => !z.complete);
}

async function insertScene(row: Omit<Scene, "id">) {
  const sb = createClient();
  let res = await sb.from("scenes").insert(row).select("*").single();
  if (res.error && /null value in column "id"/i.test(res.error.message)) {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    res = await sb.from("scenes").insert({ ...row, id }).select("*").single();
  }
  return res;
}

export default function SceneList({
  cls, classes, initial, students, curDate, weekDates,
}: {
  cls: ClassRow; classes: ClassRow[]; initial: Scene[]; students: Lite[]; curDate: string;
  /** The class's four meeting dates in this pay period. */
  weekDates: string[];
}) {
  const toast = useToast();
  const isWed = cls.day === "Wednesday";
  const [scenes, setScenes] = useState(initial);
  const [date, setDate] = useState(() => curDate);
  const [draft, setDraft] = useState<Scene | null>(null);
  const [saving, setSaving] = useState(false);

  const dates = weekDates;
  const onDate = scenes.filter((s) => s.date === date);
  const main = onDate.filter((s) => !s.alternate);
  const alts = onDate.filter((s) => s.alternate);
  const pool = isWed ? poolFor(scenes) : [];

  async function patch(s: Scene, p: Partial<Scene>, msg: string) {
    const before = scenes;
    setScenes((xs) => xs.map((x) => (x.id === s.id ? { ...x, ...p } : x)));
    const { error } = await createClient().from("scenes").update(p).eq("id", s.id);
    if (error) { setScenes(before); toast(`Couldn't save: ${error.message}`, true); }
    else toast(msg);
  }

  async function addPoolWork(g: ReturnType<typeof poolFor>[number]) {
    const f = g.first;
    const res = await insertScene({
      class_id: cls.id, date, actors: f.actors, actor_ids: f.actor_ids ?? [], actor_other: f.actor_other,
      scene: f.scene, work: g.next, complete: false, alternate: false, cancelled: false, picked_up_by: "", notes: "",
    });
    if (res.error) return toast(`Couldn't add: ${res.error.message}`, true);
    setScenes((xs) => [...xs, { ...(res.data as Scene), id: String(res.data.id), class_id: String(res.data.class_id), date: String(res.data.date).slice(0, 10) }]);
    toast(`${ordinal(g.next)} work added to ${fmtFull(date)}`);
  }

  /** Retire a pairing from the pool: mark its latest work complete. */
  async function markPoolComplete(g: ReturnType<typeof poolFor>[number]) {
    const group = scenes.filter((x) => `${x.actors}|${x.scene}` === g.key).sort((a, b) => a.date.localeCompare(b.date));
    const target = [...group].reverse().find((x) => !x.cancelled) ?? group[group.length - 1];
    if (!target) return;
    await patch(target, { complete: true, cancelled: false }, `${g.first.actors} · ${g.first.scene} marked complete`);
  }

  async function save() {
    if (!draft) return;
    const d = { ...draft };
    const linked = students.filter((s) => (d.actor_ids ?? []).includes(s.id));
    if (!d.actors?.trim() && linked.length) d.actors = linked.map((s) => s.name.split(" ")[0]).join(" & ");
    if (!d.actors?.trim() || !d.scene?.trim()) return toast("Add partners and a scene", true);
    const wed = classes.find((c) => c.id === d.class_id)?.day === "Wednesday";
    if (!wed) Object.assign(d, { work: null, complete: false, alternate: false, cancelled: false });
    else d.picked_up_by = "";
    setSaving(true);
    const { id, ...row } = d;
    let saved: Scene | null = null;
    if (id) {
      const { data, error } = await createClient().from("scenes").update(row).eq("id", id).select("*").single();
      if (error) { setSaving(false); return toast(`Couldn't save: ${error.message}`, true); }
      saved = data as Scene;
    } else {
      const res = await insertScene(row);
      if (res.error) { setSaving(false); return toast(`Couldn't save: ${res.error.message}`, true); }
      saved = res.data as Scene;
    }
    setSaving(false);
    const norm = { ...saved, id: String(saved.id), class_id: String(saved.class_id), date: String(saved.date).slice(0, 10) };
    setScenes((xs) => (id ? xs.map((x) => (x.id === id ? norm : x)) : [...xs, norm]).filter((x) => x.class_id === cls.id));
    if (norm.class_id === cls.id) setDate(norm.date);
    setDraft(null);
    toast("Saved to list");
  }

  async function remove() {
    if (!draft?.id || !confirm("Remove from the list?")) return;
    const { error } = await createClient().from("scenes").delete().eq("id", draft.id);
    if (error) return toast(`Couldn't remove: ${error.message}`, true);
    setScenes((xs) => xs.filter((x) => x.id !== draft.id));
    setDraft(null);
    toast("Removed from list");
  }

  const row = (s: Scene, n: number) => (
    <div key={s.id} className={`slrow ${s.cancelled ? "cx" : ""}`} onClick={() => setDraft({ ...s, actor_ids: s.actor_ids ?? [] })}>
      <div className="slnum">{n}</div>
      <div className="slmain">
        <div className="slpair">{s.actors}</div>
        <div className="slscene">{s.scene}</div>
      </div>
      <div className="slmeta">
        {isWed ? (
          <>
            {s.cancelled ? <span className="sstat cxd">Cancelled</span>
              : s.complete ? <span className="sstat performed">Complete</span>
              : <span className="workpill">{ordinal(s.work)} work</span>}
            {s.alternate && <span className="alt-tag">ALT</span>}
          </>
        ) : s.picked_up_by ? <span className="pickup-inline">picked up by {s.picked_up_by}</span> : null}
      </div>
      {isWed && (
        <button
          className={`cxbtn ${s.cancelled ? "on" : ""}`}
          title={s.cancelled ? "Restore to rotation" : "Mark cancelled"}
          onClick={(e) => {
            e.stopPropagation();
            const c = !s.cancelled;
            patch(s, c ? { cancelled: true, complete: false } : { cancelled: false }, c ? "Cancelled — back in rotation" : "Restored to the list");
          }}
        >
          {s.cancelled ? "↩" : "✕"}
        </button>
      )}
      <span className="arrow"><Icon name="arrow" /></span>
    </div>
  );

  const d = draft;
  const dWed = d ? classes.find((c) => c.id === d.class_id)?.day === "Wednesday" : false;
  const seg = (on: boolean, label: string, fn: () => void) => <button type="button" className={on ? "on" : ""} onClick={fn}>{label}</button>;

  return (
    <>
      <div className="scene-head">
        <div className="scene-note">
          {isWed
            ? "Rotating master list. Mark a scene cancelled to send it back into rotation; a pairing leaves after their 2nd work."
            : "Fresh weekly list — sent Friday for the following Monday. Tap a scene to reassign partners or note who picked it up."}
        </div>
        <button className="btn sm" onClick={() => setDraft(blank(cls.id, date))}><Icon name="plus" />Add scene</button>
      </div>

      <div className="week-switch">
        <span className="wk-label">Week of</span>
        {dates.map((x) => (
          <button key={x} className={`chip ${x === date ? "on" : ""}`} onClick={() => setDate(x)}>{fmtShort(x)}</button>
        ))}
      </div>

      {main.length || alts.length ? (
        <>
          <div className="ledger">{main.length ? main.map((s, i) => row(s, i + 1)) : <div className="empty">No scenes on the main list.</div>}</div>
          {alts.length > 0 && (<><div className="sect-lbl">Alternates</div><div className="ledger">{alts.map((s, i) => row(s, i + 1))}</div></>)}
        </>
      ) : (
        <div className="ledger"><div className="empty"><span className="serif">No scenes this week</span>Use “Add scene” to build the {fmtFull(date)} list.</div></div>
      )}

      {isWed && (
        <>
          <div className="sect-lbl">Rotation pool · master list ({pool.length})</div>
          {pool.length ? (
            <div className="ledger">
              {pool.map((g) => (
                <div key={g.key} className="rec static">
                  <div className="who"><div><div className="nm">{g.first.actors}</div><div className="ct">{g.first.scene} · {g.label}</div></div></div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn ghost sm" onClick={() => addPoolWork(g)}>Add {ordinal(g.next)} work</button>
                    <button className="btn ghost sm" style={{ color: "var(--moss)", borderColor: "var(--moss)" }} onClick={() => markPoolComplete(g)}>✓ Mark complete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ledger"><div className="empty">Pool is clear.</div></div>
          )}
        </>
      )}

      <Panel
        open={!!d}
        onClose={() => setDraft(null)}
        head={<><div className="eyebrow">{d?.id ? "Edit list item" : "Add to list"}</div><h2>{d?.actors || "New scene"}</h2></>}
        foot={
          <>
            {d?.id
              ? <button className="btn ghost" onClick={remove} style={{ color: "var(--oxblood)", borderColor: "var(--oxblood)" }}>Remove</button>
              : <button className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>}
            <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </>
        }
      >
        {d && (
          <>
            <div className="field">
              <label>{dWed ? "Pairing — partners fixed for Scene Study" : "Partners — edit to reassign"}</label>
              <input value={d.actors ?? ""} placeholder="e.g. Reece & Sariah" onChange={(e) => setDraft({ ...d, actors: e.target.value })} />
            </div>
            <div className="field">
              <label>Link to students (for their scene history)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {students.map((s) => {
                  const on = (d.actor_ids ?? []).includes(s.id);
                  return (
                    <button key={s.id} type="button" className={`checkpill ${on ? "on" : ""}`}
                      onClick={() => setDraft({ ...d, actor_ids: on ? (d.actor_ids ?? []).filter((x) => x !== s.id) : [...(d.actor_ids ?? []), s.id] })}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <label>Scene</label>
              <input value={d.scene ?? ""} placeholder="e.g. Truly Madly Deeply" onChange={(e) => setDraft({ ...d, scene: e.target.value })} />
            </div>
            <div className="row2">
              {classes.length > 1 && (
                <div className="field">
                  <label>Class</label>
                  <select value={d.class_id} onChange={(e) => setDraft({ ...d, class_id: e.target.value })}>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Week of</label>
                <select value={d.date} onChange={(e) => setDraft({ ...d, date: e.target.value })}>
                  {[...new Set([...dates, d.date])].sort().map((x) => <option key={x} value={x}>{fmtFull(x)}</option>)}
                </select>
              </div>
            </div>
            {dWed ? (
              <>
                <div className="row2">
                  <div className="field">
                    <label>Work</label>
                    <select value={d.work ?? 1} onChange={(e) => setDraft({ ...d, work: Number(e.target.value) })}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{ordinal(n)} work</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Alternate?</label>
                    <div className="seg">
                      {seg(!d.alternate, "Regular", () => setDraft({ ...d, alternate: false }))}
                      {seg(!!d.alternate, "Alternate", () => setDraft({ ...d, alternate: true }))}
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Status</label>
                  <div className="seg">
                    {seg(!d.complete && !d.cancelled, "On list", () => setDraft({ ...d, complete: false, cancelled: false }))}
                    {seg(!!d.cancelled, "Cancelled", () => setDraft({ ...d, complete: false, cancelled: true }))}
                    {seg(!!d.complete && !d.cancelled, "Complete", () => setDraft({ ...d, complete: true, cancelled: false }))}
                  </div>
                </div>
              </>
            ) : (
              <div className="field">
                <label>Picked up by <span style={{ color: "var(--ink-3)", fontWeight: 500, letterSpacing: 0, textTransform: "none" }}>(if a partner cancelled)</span></label>
                <input value={d.picked_up_by ?? ""} placeholder="Name covering the scene" onChange={(e) => setDraft({ ...d, picked_up_by: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label>Notes</label>
              <textarea value={d.notes ?? ""} onChange={(e) => setDraft({ ...d, notes: e.target.value })} />
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
