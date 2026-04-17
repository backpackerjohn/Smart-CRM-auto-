import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@/types/db";

/**
 * Find an existing Customer by DL number (exact) first, then by last_name + dob.
 * Returns null if nothing found.
 *
 * Per the strategy doc: "Match on DL# first, then name + DOB."
 * For v1 we auto-reuse when DL# matches; the "confirm with user" UX is a future slice.
 */
export async function matchCustomer(
  supabase: SupabaseClient,
  hints: { dlNumber?: string | null; firstName?: string | null; lastName?: string | null; dob?: string | null },
): Promise<Customer | null> {
  if (hints.dlNumber) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("dl_number", hints.dlNumber)
      .limit(1)
      .maybeSingle();
    if (data) return data as Customer;
  }

  if (hints.lastName && hints.dob) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("last_name", hints.lastName)
      .eq("dob", hints.dob)
      .limit(1)
      .maybeSingle();
    if (data) return data as Customer;
  }

  return null;
}
