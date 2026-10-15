import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "producer";

export type Staff = {
  user_id: string;
  email: string | null;
  role: Role;
  class_id: string | number | null;
};

export type Session = {
  userId: string;
  email: string | null;
  staff: Staff | null;
  /** The raw role text stored in `staff`, for diagnosing mismatches. */
  rawRole: string | null;
};

/**
 * The signed-in user plus their effective role and class. Cached per request.
 * Role and class come from the database's own `is_owner()` / `my_class()`
 * helpers — the same functions Row-Level Security uses — with the `staff`
 * row as a fallback, so the UI can never disagree with what RLS allows.
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: row }, ownerRes, classRes] = await Promise.all([
    supabase.from("staff").select("user_id, email, role, class_id").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("is_owner"),
    supabase.rpc("my_class"),
  ]);

  const rawRole = row?.role != null ? String(row.role) : null;
  if (!row) return { userId: user.id, email: user.email ?? null, staff: null, rawRole };

  const roleText = (rawRole ?? "").trim().toLowerCase();
  const isOwner = ownerRes.error ? roleText === "owner" : ownerRes.data === true;
  const classId = (classRes.error ? null : classRes.data) ?? row.class_id ?? null;

  return {
    userId: user.id,
    email: user.email ?? null,
    rawRole,
    staff: {
      user_id: row.user_id,
      email: row.email,
      role: isOwner ? "owner" : "producer",
      class_id: classId,
    },
  };
});

/** Today's pay-period number from the database's `current_period()` helper. */
export const getCurrentPeriod = cache(async (): Promise<number | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_period");
  if (error) return null;
  return typeof data === "number" ? data : Number(data);
});
