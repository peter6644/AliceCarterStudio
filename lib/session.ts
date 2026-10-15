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
};

/** The signed-in user plus their `staff` row (role + class). Cached per request. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: staff } = await supabase
    .from("staff")
    .select("user_id, email, role, class_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { userId: user.id, email: user.email ?? null, staff: (staff as Staff) ?? null };
});

/** Today's pay-period number from the database's `current_period()` helper. */
export const getCurrentPeriod = cache(async (): Promise<number | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_period");
  if (error) return null;
  return typeof data === "number" ? data : Number(data);
});
