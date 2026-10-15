"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { ok?: boolean; error?: string };

const SENT_FLAGS = ["welcome_sent", "quest_sent", "extras_sent", "tuition_sent", "agreement_sent"] as const;

/**
 * Updates contact, status, notes, onboarding flags and trade details.
 * Tuition rates and plan amounts are deliberately NOT editable here.
 */
export async function saveStudent(id: string, _prev: SaveState, form: FormData): Promise<SaveState> {
  await requireOwner();

  const text = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const name = text("name");
  if (!name) return { error: "Name can't be empty." };

  const isTrade = form.get("is_trade") === "on";
  const tradeRaw = text("trade_value");
  let tradeValue: number | null = null;
  if (tradeRaw != null) {
    tradeValue = Number(tradeRaw);
    if (!Number.isFinite(tradeValue) || tradeValue < 0) return { error: "Trade value must be a dollar amount." };
  }

  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const update: Record<string, unknown> = {
    name,
    phone: text("phone"),
    email: text("email"),
    emergency: text("emergency"),
    status: text("status"),
    notes: text("notes"),
    tags,
    is_trade: isTrade,
    trade_role: isTrade ? text("trade_role") : null,
    trade_value: isTrade ? tradeValue : null,
  };
  for (const f of SENT_FLAGS) update[f] = form.get(f) === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("students").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
  return { ok: true };
}
