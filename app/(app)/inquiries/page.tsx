import { requireOwner } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";
import type { Inquiry } from "@/lib/types";
import Inquiries from "./Inquiries";

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireOwner();
  const { new: openNew } = await searchParams;
  const sb = await createClient();
  const { data, error } = await sb.from("inquiries").select("*").order("created", { ascending: false, nullsFirst: false }).range(0, 4999);
  if (error) return <p className="error">Couldn&apos;t load inquiries: {error.message}</p>;
  const rows = ((data ?? []) as Inquiry[]).map((l) => ({ ...l, id: String(l.id), created: l.created ? String(l.created).slice(0, 10) : null }));
  return <Inquiries initial={rows} openNew={openNew === "1"} />;
}
