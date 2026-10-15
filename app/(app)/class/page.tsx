import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getClasses, getStudio, resolvePeriod } from "@/lib/data";
import { clsAbbr } from "@/lib/format";
import { isActive } from "@/lib/domain/money";
import { Icon } from "@/components/icons";

/** "Which class?" picker (the Classes tab). Producers go straight to theirs. */
export default async function ClassPicker() {
  const { staff } = await getSession();
  if (staff?.role !== "owner") redirect(staff?.class_id != null ? `/class/${staff.class_id}` : "/");
  const [classes, { period }] = await Promise.all([getClasses(), resolvePeriod()]);
  const ix = await getStudio(String(period.n));
  return (
    <>
      <div className="chapter"><div className="top"><div><div className="eyebrow">Go to class</div><h1>Which class?</h1></div></div></div>
      <div className="pickwrap">
        {classes.map((c) => (
          <Link key={c.id} className="pickrow" href={`/class/${c.id}`}>
            <span className="pkbadge">{clsAbbr(c)}</span>
            <span className="pkmeta">
              <span className="pkname">{c.name}</span>
              <span className="pksub">{c.day} · {c.start_time}–{c.end_time} · {(ix.inClass.get(c.id) ?? []).filter(isActive).length} in</span>
            </span>
            <span className="arrow"><Icon name="arrow" /></span>
          </Link>
        ))}
      </div>
    </>
  );
}
