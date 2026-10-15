import { requireOwner } from "@/lib/owner";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { money } from "@/lib/format";
import { enrollmentsOf, isActive, isAway, isUnlimited, planCovered, studentOwes, tradeValueOf } from "@/lib/domain/money";
import Roster, { type RosterRow } from "./Roster";

export default async function RosterPage() {
  await requireOwner();
  const [{ period: p }, classes] = await Promise.all([resolvePeriod(), getClasses()]);
  const ix = await getStudio(String(p.n));
  const clsName = new Map(classes.map((c) => [c.id, c.name]));

  const rows: RosterRow[] = ix.students.map((s) => {
    const en = enrollmentsOf(ix, s);
    const unl = isUnlimited(s);
    const owes = s.is_trade ? 0 : studentOwes(ix, p, s);
    const total = unl
      ? `${money(s.plan_amount)}/${s.plan_months ?? "?"}mo`
      : s.is_trade ? `${money(tradeValueOf(s))} trade`
      : money(en.reduce((a, e) => a + (Number(e.rate) || 0), 0));
    let standing: RosterRow["standing"];
    if (unl) standing = planCovered(s, p) ? { cls: "plan", text: "Unlimited · current" } : { cls: "due", text: `Unlimited · ${money(s.plan_amount)}` };
    else if (s.is_trade) standing = { cls: "trade", text: `Trade${s.trade_role ? " · " + s.trade_role : ""}` };
    else standing = owes > 0 ? { cls: "due", text: `Owes ${money(owes)}` } : { cls: "paid", text: "Paid" };
    return {
      id: s.id,
      name: s.name,
      search: `${s.name} ${s.phone ?? ""} ${s.email ?? ""} ${s.trade_role ?? ""} ${s.notes ?? ""} ${(s.tags ?? []).join(" ")}`.toLowerCase(),
      active: isActive(s),
      away: isActive(s) && isAway(ix, p.n, s.id),
      classIds: en.map((e) => String(e.class_id)),
      classNames: en.map((e) => clsName.get(String(e.class_id)) ?? String(e.class_id)),
      sub: `${s.pays_by || "—"} · ${total}`,
      unlimited: unl,
      trade: !!s.is_trade,
      owing: owes > 0,
      standing,
    };
  });

  return <Roster rows={rows} classes={classes.map((c) => ({ id: c.id, name: c.name }))} period={p.n} />;
}
