"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { clsAbbr } from "@/lib/format";
import type { ClassRow } from "@/lib/types";

type Props = {
  role: "owner" | "producer";
  classes: ClassRow[];
  producerClass: ClassRow | null;
  signOut: () => Promise<void>;
  children: React.ReactNode;
};

const TOP: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Dashboard", icon: "dash" },
  { href: "/students", label: "Roster", icon: "roster" },
  { href: "/class", label: "Classes", icon: "cls" },
  { href: "/payments", label: "Payments", icon: "pay" },
  { href: "/inquiries", label: "Inquiries", icon: "crm" },
];

export default function Shell({ role, classes, producerClass, signOut, children }: Props) {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  if (role === "producer") {
    return (
      <div className="prodwrap">
        <header className="prodbar">
          <div className="pbrandrow">
            <img className="plogo" src="/logo.jpg" alt="" />
            <div>
              <div className="pcls">{producerClass?.name ?? "No class assigned"}</div>
              <div className="pdayrole">{producerClass ? `${producerClass.day} · Producer` : "Producer"}</div>
            </div>
          </div>
          <form action={signOut}>
            <button className="btn ghost sm">Sign out</button>
          </form>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <img className="logo" src="/logo.jpg" alt="Alice Carter Studio" />
            <div className="sub">Day Book</div>
          </div>
          <nav className="rail-nav">
            <Link className={`navitem ${on("/") ? "on" : ""}`} href="/"><Icon name="dash" /><span>Dashboard</span></Link>
            <Link className={`navitem ${on("/students") ? "on" : ""}`} href="/students"><Icon name="roster" /><span>Roster</span></Link>
            <div className="navlabel">Classes</div>
            {classes.map((c) => (
              <Link key={c.id} className={`navitem sub ${path === `/class/${c.id}` ? "on" : ""}`} href={`/class/${c.id}`}>
                <span className="rn">{clsAbbr(c)}</span>
                <span>{c.name}</span>
              </Link>
            ))}
            <Link className={`navitem ${on("/payments") ? "on" : ""}`} href="/payments"><Icon name="pay" /><span>Payments</span></Link>
            <Link className={`navitem ${on("/inquiries") ? "on" : ""}`} href="/inquiries"><Icon name="crm" /><span>Inquiries</span></Link>
          </nav>
          <div className="rail-foot">
            <form action={signOut}>
              <button style={{ textDecoration: "none", color: "var(--brass-deep)", fontWeight: 600 }}>↩ Sign out</button>
            </form>
          </div>
        </aside>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </div>
      <nav className="tabbar">
        {TOP.map((n) => (
          <Link key={n.href} className={`tb ${on(n.href) ? "on" : ""}`} href={n.href}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
