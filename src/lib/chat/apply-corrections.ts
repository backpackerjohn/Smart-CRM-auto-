import type { SupabaseClient } from "@supabase/supabase-js";
import type { Correction, CorrectionScope } from "./parse-corrections";

export interface AppliedCorrection {
  scope: CorrectionScope;
  field: string;
  label: string;
  previous: unknown;
  next: unknown;
}

/**
 * Apply a batch of parsed corrections to the appropriate rows.
 * - primary / co_buyer → customers (auto-create + link to deal if missing)
 * - deal → deals
 * - vehicle_of_interest / trade → vehicles (auto-create + link to deal if missing)
 *
 * Audit rows for customer updates go to customer_edits with source='chat'.
 * Returns the list of successfully applied corrections.
 */
export async function applyCorrections(
  supabase: SupabaseClient,
  dealId: string,
  corrections: Correction[],
): Promise<AppliedCorrection[]> {
  if (corrections.length === 0) return [];

  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).single();
  if (!deal) return [];

  // Group corrections by target.
  const customerPatches: Record<CorrectionScope, Record<string, unknown>> = {
    primary: {},
    co_buyer: {},
    deal: {},
    vehicle_of_interest: {},
    trade: {},
  };
  const customerLabels: Record<CorrectionScope, Record<string, string>> = {
    primary: {}, co_buyer: {}, deal: {}, vehicle_of_interest: {}, trade: {},
  };

  for (const c of corrections) {
    customerPatches[c.scope][c.field] = c.value;
    customerLabels[c.scope][c.field] = c.label;
  }

  const applied: AppliedCorrection[] = [];

  // ─── Customers (primary / co_buyer) ─────────────────────────────────────
  for (const scope of ["primary", "co_buyer"] as const) {
    const patch = customerPatches[scope];
    if (Object.keys(patch).length === 0) continue;

    const idField = scope === "primary" ? "primary_customer_id" : "co_buyer_customer_id";
    let customerId: string | null = deal[idField];

    if (!customerId) {
      const { data: created } = await supabase
        .from("customers")
        .insert(patch)
        .select("*")
        .single();
      if (!created) continue;
      customerId = created.id;
      await supabase.from("deals").update({ [idField]: customerId }).eq("id", dealId);

      for (const [field, next] of Object.entries(patch)) {
        applied.push({ scope, field, label: customerLabels[scope][field]!, previous: null, next });
      }
    } else {
      const { data: existing } = await supabase.from("customers").select("*").eq("id", customerId).single();
      if (!existing) continue;
      const diff: Record<string, unknown> = {};
      const edits: Array<Record<string, unknown>> = [];
      for (const [field, next] of Object.entries(patch)) {
        const previous = (existing as Record<string, unknown>)[field] ?? null;
        if (previous === next) continue;
        diff[field] = next;
        edits.push({
          customer_id: customerId,
          deal_id: dealId,
          field_path: field,
          old_value: previous,
          new_value: next,
          source: "chat",
        });
        applied.push({ scope, field, label: customerLabels[scope][field]!, previous, next });
      }
      if (Object.keys(diff).length > 0) {
        await supabase.from("customers").update(diff).eq("id", customerId);
      }
      if (edits.length > 0) {
        await supabase.from("customer_edits").insert(edits);
      }
    }
  }

  // ─── Deal ────────────────────────────────────────────────────────────────
  const dealPatch = customerPatches.deal;
  if (Object.keys(dealPatch).length > 0) {
    const diff: Record<string, unknown> = {};
    for (const [field, next] of Object.entries(dealPatch)) {
      const previous = (deal as Record<string, unknown>)[field] ?? null;
      if (previous === next) continue;
      diff[field] = next;
      applied.push({ scope: "deal", field, label: customerLabels.deal[field]!, previous, next });
    }
    if (Object.keys(diff).length > 0) {
      await supabase.from("deals").update(diff).eq("id", dealId);
    }
  }

  // ─── Vehicles (VOI / trade) ─────────────────────────────────────────────
  for (const scope of ["vehicle_of_interest", "trade"] as const) {
    const patch = customerPatches[scope];
    if (Object.keys(patch).length === 0) continue;

    const idField = scope === "trade" ? "trade_vehicle_id" : "vehicle_of_interest_id";
    let vehicleId: string | null = deal[idField];

    if (!vehicleId) {
      const { data: created } = await supabase.from("vehicles").insert(patch).select("id").single();
      if (!created) continue;
      vehicleId = created.id;
      await supabase.from("deals").update({ [idField]: vehicleId }).eq("id", dealId);
      for (const [field, next] of Object.entries(patch)) {
        applied.push({ scope, field, label: customerLabels[scope][field]!, previous: null, next });
      }
    } else {
      const { data: existing } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
      if (!existing) continue;
      const diff: Record<string, unknown> = {};
      for (const [field, next] of Object.entries(patch)) {
        const previous = (existing as Record<string, unknown>)[field] ?? null;
        if (previous === next) continue;
        diff[field] = next;
        applied.push({ scope, field, label: customerLabels[scope][field]!, previous, next });
      }
      if (Object.keys(diff).length > 0) {
        await supabase.from("vehicles").update(diff).eq("id", vehicleId);
      }
    }
  }

  return applied;
}
