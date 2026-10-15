import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** For owner-only pages: producers are sent back to their own class. */
export async function requireOwner() {
  const session = await getSession();
  if (session.staff?.role !== "owner") {
    redirect(session.staff?.class_id != null ? `/class/${session.staff.class_id}` : "/");
  }
  return session;
}
