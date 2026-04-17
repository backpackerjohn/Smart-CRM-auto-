import type { SupabaseClient } from "@supabase/supabase-js";
import { computeChecklist } from "./compute";
import type { Capture, Customer, Deal, PdfForm, Vehicle } from "@/types/db";

/**
 * Recompute checklist for a Deal from fresh data and replace its checklist_items rows.
 * Idempotent — safe to call after any mutation that might affect deal state.
 *
 * For v1 (single-user, single-dealership), we treat every uploaded PdfForm as "planned"
 * for every deal — the user is filling the same small set of forms each time.
 * A per-deal planned-forms picker is a future slice.
 */
export async function recomputeChecklist(
  supabase: SupabaseClient,
  dealId: string,
): Promise<{ inserted: number } | { error: string }> {
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (dealErr) return { error: dealErr.message };
  if (!deal) return { error: "deal not found" };

  const [primaryRes, coBuyerRes, capturesRes, formsRes] = await Promise.all([
    deal.primary_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.primary_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.co_buyer_customer_id
      ? supabase.from("customers").select("*").eq("id", deal.co_buyer_customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("captures").select("*").eq("deal_id", dealId),
    supabase.from("pdf_forms").select("*"),
  ]);

  const captures = (capturesRes.data ?? []) as Capture[];

  const hasPrimaryDlFront = captures.some(
    (c) => c.kind === "dl_front" && (c.assigned_to === "primary" || c.assigned_to === "unassigned"),
  );
  const hasPrimaryDlBack = captures.some(
    (c) => c.kind === "dl_back" && (c.assigned_to === "primary" || c.assigned_to === "unassigned"),
  );
  const hasCoBuyerDlFront = captures.some((c) => c.kind === "dl_front" && c.assigned_to === "co_buyer");
  const hasCoBuyerDlBack = captures.some((c) => c.kind === "dl_back" && c.assigned_to === "co_buyer");
  const hasInsuranceCapture = captures.some((c) => c.kind === "insurance_card");
  const hasRegistrationCapture = captures.some((c) => c.kind === "registration" || c.kind === "title");

  const rows = computeChecklist({
    deal: deal as Deal,
    primary: (primaryRes.data ?? null) as Customer | null,
    coBuyer: (coBuyerRes.data ?? null) as Customer | null,
    hasPrimaryDlFront,
    hasPrimaryDlBack,
    hasCoBuyerDlFront,
    hasCoBuyerDlBack,
    hasInsuranceCapture,
    hasRegistrationCapture,
    plannedForms: (formsRes.data ?? []) as PdfForm[],
  });

  // Replace: delete all then insert fresh. Simple + correct; cheap for the row counts we see.
  await supabase.from("checklist_items").delete().eq("deal_id", dealId);

  if (rows.length === 0) return { inserted: 0 };

  const inserts = rows.map((r) => ({
    deal_id: dealId,
    kind: r.kind,
    label: r.label,
    state: r.state,
    source_capture_id: r.sourceCaptureId ?? null,
    message: r.message ?? null,
    sort_order: r.sortOrder,
  }));

  const { error: insErr } = await supabase.from("checklist_items").insert(inserts);
  if (insErr) return { error: insErr.message };

  return { inserted: inserts.length };
}
