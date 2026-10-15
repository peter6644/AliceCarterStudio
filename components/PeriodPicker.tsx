"use client";

import { usePathname, useRouter } from "next/navigation";
import { fmtD } from "@/lib/format";
import type { Period } from "@/lib/types";

/** Past-period picker. The current period is the default (no ?period= in the URL). */
export default function PeriodPicker({ periods, selected, current }: { periods: Period[]; selected: number; current: number }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <select
      className="perpick"
      value={selected}
      aria-label="Pay period"
      onChange={(e) => {
        const n = Number(e.target.value);
        router.push(n === current ? path : `${path}?period=${n}`);
      }}
    >
      {periods.map((p) => (
        <option key={p.n} value={p.n}>
          PP{p.n} · {fmtD(p.start)}–{fmtD(p.end)}{p.n === current ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}
