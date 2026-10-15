"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import Panel from "@/components/Panel";
import { useToast } from "@/lib/useToast";
import { createClient } from "@/lib/supabase/client";
import { fmtFull, ordinal } from "@/lib/format";
import type { ClassRow, Scene } from "@/lib/types";

import PasteScenes, { type ParsedScene } from "./PasteScenes";
import PartnerPicker, { matchNames, splitActors, type PickStudent } from "./PartnerPicker";

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
  cls: ClassRow; classes: ClassRow[]; initial: Scene[]; students: PickStudent[]; curDate: string;
  /** The class's four meeting dates in this pay period. */
  weekDates: string[];
}) {
  const toast = useToast();
  const isWed = cls.day === "Wednesday";
  const [scenes, setScenes] = useState(initial);
  const [date, setDate] = useState(() => curDate);
  const [draft, setDraft] = useState<Scene | null>(null);
  const [saving, setSaving] = useState(false);
  // Partners for the scene being edited: linked roster ids + names not on the roster.
  const [partners, setPartners] = useState<{ ids: string[]; others: string[]; touched: boolean }>({ ids: [], others: [], touched: false });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? id;

  function openScene(s: Scene) {
    setCustomDate(false);
    const ids = (s.actor_ids ?? []).map(String);
    let others = splitActors(s.actor_other);
    let linked = ids;
    if (!ids.length && s.actors) {
      // Older scenes only have the names typed in — link them to students where it's clear.
      const m = matchNames(splitActors(s.actors), students);
      linked = m.ids;
      others = [...others, ...m.others];
    }
    setPartners({ ids: linked, others, touched: false });
    setDraft({ ...s, actor_ids: linked });
  }
  function newScene() {
    setCustomDate(false);
    setPartners({ ids: [], others: [], touched: true });
    setDraft(blank(cls.id, date));
  }

  const dates = weekDates;
  // The class's next four meetings after this pay period, for planning ahead.
  const nextDates = [1, 2, 3, 4].map((k) => {
    const d = new Date(weekDates[3] + "T00:00");
    d.setDate(d.getDate() + 7 * k);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [customDate, setCustomDate] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  async function addPasted(rows: ParsedScene[], when: string, work: number) {
    const added: Scene[] = [];
    for (const r of rows) {
      const res = await insertScene({
        class_id: cls.id, date: when, actors: r.actors, actor_ids: r.ids,
        actor_other: r.others.length ? r.others.join(" & ") : null, scene: r.scene,
        work: isWed ? work : null, complete: false, alternate: false, cancelled: false, picked_up_by: "", notes: "",
      });
      if (res.error) {
        toast(`Added ${added.length} of ${rows.length}. Stopped at "${r.actors} – ${r.scene}": ${res.error.message}`, true);
        break;
      }
      added.push({ ...(res.data as Scene), id: String(res.data.id), class_id: String(res.data.class_id), date: String(res.data.date).slice(0, 10) });
    }
    if (added.length) {
      setScenes((xs) => [...xs, ...added]);
      if (dates.includes(when) || when > weekDates[3]) setDate(when);
      if (added.length === rows.length) { setPasteOpen(false); toast(`${added.length} scene${added.length === 1 ? "" : "s"} added to ${fmtFull(when)}`); }
    }
  }
  const upcoming = [...new Set(scenes.filter((x) => x.date > weekDates[3]).map((x) => x.date))].sort();
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

  /** Apply pairing changes to every work of the same pairing in this class (the master list entry). */
  async function updateGroup(origActors: string | null, origScene: string | null, patch: Partial<Scene>, exceptId?: string) {
    const sibs = scenes.filter((x) => x.class_id === cls.id && x.actors === origActors && x.scene === origScene && x.id !== exceptId);
    if (!sibs.length) return null;
    const { error } = await createClient().from("scenes").update(patch).in("id", sibs.map((x) => x.id));
    if (error) return error.message;
    const ids = new Set(sibs.map((x) => x.id));
    setScenes((xs) => xs.map((x) => (ids.has(x.id) ? { ...x, ...patch } : x)));
    return null;
  }

  // Editing a master-list pairing (all its works at once).
  const [pair, setPair] = useState<{ actors: string | null; scene: string | null; title: string } | null>(null);
  function openPair(first: Scene) {
    const ids = (first.actor_ids ?? []).map(String);
    let others = splitActors(first.actor_other);
    let linked = ids;
    if (!ids.length && first.actors) {
      const m = matchNames(splitActors(first.actors), students);
      linked = m.ids;
      others = [...others, ...m.others];
    }
    setPartners({ ids: linked, others, touched: false });
    setPair({ actors: first.actors, scene: first.scene, title: first.scene ?? "" });
  }
  async function savePair() {
    if (!pair) return;
    const names = [...partners.ids.map(nameOf), ...partners.others];
    if (!names.length || !pair.title.trim()) return toast("Add partners and a scene", true);
    const patch: Partial<Scene> = {
      actor_ids: partners.ids,
      actor_other: partners.others.length ? partners.others.join(" & ") : null,
      actors: partners.touched ? names.join(" & ") : pair.actors,
      scene: pair.title.trim(),
    };
    setSaving(true);
    const err = await updateGroup(pair.actors, pair.scene, patch);
    setSaving(false);
    if (err) return toast(`Couldn't save: ${err}`, true);
    setPair(null);
    toast("Master list updated");
  }

  async function save() {
    if (!draft) return;
    const d = { ...draft };
    d.actor_ids = partners.ids;
    d.actor_other = partners.others.length ? partners.others.join(" & ") : null;
    // Keep an existing pairing's wording (the rotation pool groups by it) unless partners changed.
    const names = [...partners.ids.map(nameOf), ...partners.others];
    if (!draft.id || partners.touched || !d.actors?.trim()) d.actors = names.join(" & ");
    if (!names.length || !d.scene?.trim()) return toast("Add partners and a scene", true);
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
    // Keep the other works of this pairing in step (names, links, title).
    if (id) {
      const orig = scenes.find((x) => x.id === id);
      if (orig && (orig.actors !== d.actors || orig.scene !== d.scene || JSON.stringify(orig.actor_ids ?? []) !== JSON.stringify(d.actor_ids ?? []))) {
        const err = await updateGroup(orig.actors, orig.scene, { actors: d.actors, actor_ids: d.actor_ids, actor_other: d.actor_other, scene: d.scene }, id);
        if (err) toast(`Saved this week, but other works of this pairing didn't update: ${err}`, true);
      }
    }
    setSaving(false);
    const norm = { ...saved, id: String(saved.id), class_id: String(saved.class_id), date: String(saved.date).slice(0, 10) };
    setScenes((xs) => (id ? xs.map((x) => (x.id === id ? norm : x)) : [...xs, norm]).filter((x) => x.class_id === cls.id));
    const inView = dates.includes(norm.date);
    if (norm.class_id === cls.id && inView) setDate(norm.date);
    setDraft(null);
    setCustomDate(false);
    toast(inView ? "Saved to list" : `Saved for ${fmtFull(norm.date)} — it'll show in that week's list`);
  }

  async function remove() {
    if (!draft?.id || !confirm("Remove from the list?")) return;
    const { error } = await createClient().from("scenes").delete().eq("id", draft.id);
    if (error) return toast(`Couldn't remove: ${error.message}`, true);
    setScenes((xs) => xs.filter((x) => x.id !== draft.id));
    setDraft(null);
    toast("Removed from list");
  }

  /** Names in a pairing that aren't attached to a student. */
  const unlinked = (x: Scene) => {
    const linked = (x.actor_ids ?? []).map((i) => nameOf(String(i)).toLowerCase());
    const guests = splitActors(x.actor_other).map((g) => g.toLowerCase());
    return splitActors(x.actors).filter((p) => {
      if (guests.includes(p.toLowerCase())) return false; // added on purpose as "not on roster"
      const lp = p.toLowerCase();
      return !linked.some((n) => n === lp || n.startsWith(lp + " ") || n.split(" ")[0] === lp.split(" ")[0]);
    });
  };
  const UnlinkedNote = ({ x }: { x: Scene }) => {
    const u = unlinked(x);
    return u.length ? <div className="ct" style={{ color: "var(--oxblood)", fontSize: 11.5 }}>? {u.join(", ")} not attached — tap to link</div> : null;
  };

  const row = (s: Scene, n: number) => (
    <div key={s.id} className={`slrow ${s.cancelled ? "cx" : ""}`} onClick={() => openScene(s)}>
      <div className="slnum">{n}</div>
      <div className="slmain">
        <div className="slpair">{s.actors}</div>
        <div className="slscene">{s.scene}</div>
        <UnlinkedNote x={s} />
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost sm" onClick={() => setPasteOpen(true)}>Paste list</button>
          <button className="btn sm" onClick={newScene}><Icon name="plus" />Add scene</button>
        </div>
      </div>

      <div className="week-switch">
        <span className="wk-label">Week of</span>
        {dates.map((x) => (
          <button key={x} className={`chip ${x === date ? "on" : ""}`} onClick={() => setDate(x)}>{fmtShort(x)}</button>
        ))}
        {upcoming.length > 0 && (
          <>
            <span className="wk-label" style={{ marginLeft: 6 }}>Coming up</span>
            {upcoming.map((x) => (
              <button key={x} className={`chip ${x === date ? "on" : ""}`} style={x === date ? undefined : { borderStyle: "dashed" }} onClick={() => setDate(x)}>{fmtShort(x)}</button>
            ))}
          </>
        )}
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
                  <div className="who"><div><div className="nm">{g.first.actors}</div><div className="ct">{g.first.scene} · {g.label}</div><UnlinkedNote x={g.first} /></div></div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn ghost sm" onClick={() => openPair(g.first)}>Edit names</button>
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
        open={!!pair}
        onClose={() => setPair(null)}
        head={<><div className="eyebrow">Master list · all works</div><h2>{[...partners.ids.map(nameOf), ...partners.others].join(" & ") || pair?.actors}</h2></>}
        foot={<>
          <button className="btn ghost" onClick={() => setPair(null)}>Cancel</button>
          <button className="btn" onClick={savePair} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>}
      >
        {pair && (
          <>
            <p style={{ marginTop: 0, color: "var(--ink-2)", fontSize: 13 }}>
              Changes apply to every work of this pairing in {cls.name}. Search a name to attach a student.
            </p>
            <div className="field">
              <label>Pairing</label>
              <PartnerPicker students={students} ids={partners.ids} others={partners.others}
                onChange={(ids, others) => setPartners({ ids, others, touched: true })} />
            </div>
            <div className="field">
              <label>Scene</label>
              <input value={pair.title} onChange={(e) => setPair({ ...pair, title: e.target.value })} />
            </div>
          </>
        )}
      </Panel>

      <Panel open={pasteOpen} onClose={() => setPasteOpen(false)} head={<><div className="eyebrow">{cls.name}</div><h2>Paste a scene list</h2></>}>
        <PasteScenes
          students={students}
          isWed={isWed}
          defaultDate={date}
          dateGroups={[
            { label: "This pay period", dates: dates.map((x) => ({ iso: x, label: fmtShort(x) })) },
            { label: "Next pay period", dates: nextDates.map((x) => ({ iso: x, label: fmtShort(x) })) },
            ...(![...dates, ...nextDates].includes(date) ? [{ label: "Selected", dates: [{ iso: date, label: fmtShort(date) }] }] : []),
          ]}
          onAdd={addPasted}
          onCancel={() => setPasteOpen(false)}
        />
      </Panel>

      <Panel
        open={!!d}
        onClose={() => setDraft(null)}
        head={<><div className="eyebrow">{d?.id ? "Edit list item" : "Add to list"}</div><h2>{[...partners.ids.map(nameOf), ...partners.others].join(" & ") || d?.actors || "New scene"}</h2></>}
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
              <PartnerPicker
                students={students}
                ids={partners.ids}
                others={partners.others}
                onChange={(ids, others) => setPartners({ ids, others, touched: true })}
              />
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
                {customDate ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="date" value={d.date} onChange={(e) => e.target.value && setDraft({ ...d, date: e.target.value })} />
                    <button type="button" className="btn ghost sm" onClick={() => setCustomDate(false)}>List</button>
                  </div>
                ) : (
                  <select
                    value={d.date}
                    onChange={(e) => (e.target.value === "__other" ? setCustomDate(true) : setDraft({ ...d, date: e.target.value }))}
                  >
                    <optgroup label="This pay period">
                      {dates.map((x) => <option key={x} value={x}>{fmtShort(x)}</option>)}
                    </optgroup>
                    <optgroup label="Next pay period">
                      {nextDates.map((x) => <option key={x} value={x}>{fmtShort(x)}</option>)}
                    </optgroup>
                    {![...dates, ...nextDates].includes(d.date) && (
                      <optgroup label="Saved date"><option value={d.date}>{fmtShort(d.date)}</option></optgroup>
                    )}
                    <option value="__other">Other date…</option>
                  </select>
                )}
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
