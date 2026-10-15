import { getSession } from "@/lib/session";
import { getClasses } from "@/lib/data";
import { signOut } from "@/app/login/actions";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, staff } = await getSession();

  if (!staff) {
    return (
      <div className="gate">
        <div className="gatecard">
          <img className="glogo" src="/logo.jpg" alt="" />
          <div className="gtitle">No access yet</div>
          <p style={{ color: "var(--ink-2)" }}>
            {email} is signed in, but isn&apos;t set up as studio staff. Ask the owner to add you.
          </p>
          <form action={signOut}><button className="btn ghost">Sign out</button></form>
        </div>
      </div>
    );
  }

  const classes = await getClasses();
  const producerClass = classes.find((c) => String(c.id) === String(staff.class_id)) ?? null;

  return (
    <Shell role={staff.role} classes={classes} producerClass={producerClass} signOut={signOut}>
      {children}
    </Shell>
  );
}
