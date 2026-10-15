import Link from "next/link";
import { getSession, getCurrentPeriod } from "@/lib/session";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, staff } = await getSession();

  if (!staff) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
        <div className="card" style={{ maxWidth: 420 }}>
          <h2>No access yet</h2>
          <p className="muted">
            {email} is signed in, but isn&apos;t set up as studio staff. Ask the owner to add you.
          </p>
          <form action={signOut}><button className="btn secondary">Sign out</button></form>
        </div>
      </main>
    );
  }

  const period = await getCurrentPeriod();
  const isOwner = staff.role === "owner";

  return (
    <div>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
          borderBottom: "1px solid var(--line)", background: "var(--paper-raised)", flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div className="badge-logo">AC</div>
          <span className="display" style={{ fontSize: 20 }}>Day Book</span>
        </Link>
        <nav style={{ display: "flex", gap: 14, flex: 1, flexWrap: "wrap" }}>
          {isOwner ? (
            <>
              <Link href="/">Dashboard</Link>
              <Link href="/students">Roster</Link>
              <span className="muted">Scenes</span>
              <span className="muted">Inquiries</span>
            </>
          ) : (
            <Link href={`/class/${staff.class_id}`}>My class</Link>
          )}
        </nav>
        <span className="muted" style={{ fontSize: 14 }}>
          {period ? `Period ${period}` : "Period unknown"} · {isOwner ? "Owner" : "Producer"}
        </span>
        <form action={signOut}><button className="btn secondary" style={{ minHeight: 36 }}>Sign out</button></form>
      </header>
      <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
