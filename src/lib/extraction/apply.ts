import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureKind, CaptureOwner, Customer, Deal, Vehicle } from "@/types/db";
import type {
  AnyExtraction,
  DriverLicenseExtraction,
  InsuranceCardExtraction,
  RegistrationExtraction,
  TitleExtraction,
  PayoffLetterExtraction,
  StockSheetExtraction,
  DmsScreenshotExtraction,
} from "@/types/extraction";
import { normalizeVin, isValidVin } from "@/lib/validation/vin";
import { isValidOhioDl } from "@/lib/validation/ohio-dl";
import { matchCustomer } from "./match-customer";

// Routes a Gemini extraction result into concrete DB writes on customers/deals/vehicles.
// Pure orchestration — no AI involved. Called from /api/captures after extractCapture resolves.

export interface ApplyContext {
  supabase: SupabaseClient;
  dealId: string;
  captureId: string;
  captureKind: CaptureKind;
  assignedTo: CaptureOwner;
  structured: AnyExtraction;
}

export interface ApplyResult {
  summary: string;
  fieldsApplied: string[];
  warnings: string[];
}

export async function applyExtraction(ctx: ApplyContext): Promise<ApplyResult> {
  switch (ctx.captureKind) {
    case "dl_front":
    case "dl_back":
      return applyDl(ctx, ctx.structured as DriverLicenseExtraction);
    case "insurance_card":
      return applyInsurance(ctx, ctx.structured as InsuranceCardExtraction);
    case "registration":
      return applyVehicleDoc(ctx, ctx.structured as RegistrationExtraction, "registration");
    case "title":
      return applyVehicleDoc(ctx, ctx.structured as TitleExtraction, "title");
    case "payoff_letter":
      return applyPayoff(ctx, ctx.structured as PayoffLetterExtraction);
    case "stock_sheet":
      return applyStockSheet(ctx, ctx.structured as StockSheetExtraction);
    case "dms_screenshot":
      return applyDms(ctx, ctx.structured as DmsScreenshotExtraction);
    default:
      return { summary: "No auto-apply for this capture type.", fieldsApplied: [], warnings: [] };
  }
}

// ─── DL ─────────────────────────────────────────────────────────────────────

async function applyDl(ctx: ApplyContext, dl: DriverLicenseExtraction): Promise<ApplyResult> {
  const targetIsCoBuyer = ctx.assignedTo === "co_buyer";
  const customerIdField: "primary_customer_id" | "co_buyer_customer_id" =
    targetIsCoBuyer ? "co_buyer_customer_id" : "primary_customer_id";

  const { data: deal } = await ctx.supabase
    .from("deals")
    .select("*")
    .eq("id", ctx.dealId)
    .single();
  if (!deal) return { summary: "Deal not found.", fieldsApplied: [], warnings: [] };

  const patch = stripEmpty({
    first_name: dl.firstName,
    middle_name: dl.middleName,
    last_name: dl.lastName,
    dob: dl.dob,
    dl_number: dl.dlNumber,
    dl_state: dl.dlState,
    dl_expiration: dl.dlExpiration,
    address_line1: dl.addressLine1,
    address_line2: dl.addressLine2,
    city: dl.city,
    state: dl.state,
    zip: dl.zip,
  });

  let customerId: string | null = deal[customerIdField];
  let wasReused = false;

  // If no customer linked yet, try matching existing by DL#
  if (!customerId) {
    const existing = await matchCustomer(ctx.supabase, {
      dlNumber: dl.dlNumber,
      firstName: dl.firstName,
      lastName: dl.lastName,
      dob: dl.dob,
    });
    if (existing) {
      customerId = existing.id;
      wasReused = true;
    }
  }

  if (!customerId) {
    const { data: created, error: insErr } = await ctx.supabase
      .from("customers")
      .insert(patch)
      .select("id")
      .single();
    if (insErr || !created) {
      return { summary: `Could not create customer: ${insErr?.message}`, fieldsApplied: [], warnings: [] };
    }
    customerId = created.id;
    await ctx.supabase
      .from("deals")
      .update({ [customerIdField]: customerId })
      .eq("id", ctx.dealId);
  } else {
    await mergeAndAudit(ctx, "customers", customerId, patch);
    if (wasReused) {
      await ctx.supabase
        .from("deals")
        .update({ [customerIdField]: customerId })
        .eq("id", ctx.dealId);
    }
  }

  // Auto-set deal title if blank
  if (!deal.title && (dl.lastName || dl.firstName)) {
    const lead = dl.lastName ?? dl.firstName ?? "";
    await ctx.supabase.from("deals").update({ title: lead }).eq("id", ctx.dealId);
  }

  // Mark the capture assigned_to so the checklist sees it
  if (ctx.assignedTo === "unassigned") {
    await ctx.supabase
      .from("captures")
      .update({ assigned_to: targetIsCoBuyer ? "co_buyer" : "primary" })
      .eq("id", ctx.captureId);
  }

  const warnings: string[] = [];
  if (dl.dlState && dl.dlState.toUpperCase() !== "OH") {
    warnings.push(`DL state is ${dl.dlState}, not OH — confirm with customer.`);
  } else if (dl.dlState && dl.dlState.toUpperCase() === "OH" && dl.dlNumber && !isValidOhioDl(dl.dlNumber)) {
    warnings.push(`DL# "${dl.dlNumber}" doesn't match Ohio 2-letter + 6-digit format — verify.`);
  }

  // Prior-deal count for the returning-customer signal.
  let priorDealsLabel = "";
  if (wasReused) {
    const { count } = await ctx.supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .or(`primary_customer_id.eq.${customerId},co_buyer_customer_id.eq.${customerId}`)
      .neq("id", ctx.dealId);
    if (typeof count === "number" && count > 0) {
      priorDealsLabel = ` (${count} prior deal${count === 1 ? "" : "s"})`;
    }
  }

  const who = targetIsCoBuyer ? "co-buyer" : "primary";
  const namePart = dl.lastName ? ` ${dl.lastName}` : "";
  const verb = wasReused ? "Reused existing" : "Created";
  return {
    summary: `${verb} ${who} customer${namePart}${priorDealsLabel}. Applied ${Object.keys(patch).length} DL fields.`,
    fieldsApplied: Object.keys(patch),
    warnings,
  };
}

// ─── Insurance ──────────────────────────────────────────────────────────────

async function applyInsurance(ctx: ApplyContext, ins: InsuranceCardExtraction): Promise<ApplyResult> {
  const patch = stripEmpty({
    insurance_carrier: ins.carrier,
    insurance_policy: ins.policyNumber,
    insurance_effective: ins.effectiveDate,
    insurance_expires: ins.expirationDate,
  });
  if (Object.keys(patch).length === 0) {
    return { summary: "Insurance card: nothing to apply.", fieldsApplied: [], warnings: [] };
  }
  const { error } = await ctx.supabase.from("deals").update(patch).eq("id", ctx.dealId);
  if (error) return { summary: `Insurance apply failed: ${error.message}`, fieldsApplied: [], warnings: [] };

  return {
    summary: `Applied insurance: ${ins.carrier ?? "carrier"}${ins.policyNumber ? ` · policy ${ins.policyNumber}` : ""}.`,
    fieldsApplied: Object.keys(patch),
    warnings: [],
  };
}

// ─── Registration / Title ───────────────────────────────────────────────────

async function applyVehicleDoc(
  ctx: ApplyContext,
  reg: RegistrationExtraction | TitleExtraction,
  kind: "registration" | "title",
): Promise<ApplyResult> {
  // Registrations/titles on a customer's personal paperwork = their trade.
  // Unless capture explicitly says vehicle_of_interest.
  const target: "trade" | "voi" = ctx.assignedTo === "vehicle_of_interest" ? "voi" : "trade";
  const vehicleIdField = target === "trade" ? "trade_vehicle_id" : "vehicle_of_interest_id";

  const { data: deal } = await ctx.supabase
    .from("deals")
    .select("*")
    .eq("id", ctx.dealId)
    .single();
  if (!deal) return { summary: "Deal not found.", fieldsApplied: [], warnings: [] };

  const patch = stripEmpty({
    vin: reg.vin ? normalizeVin(reg.vin) : undefined,
    year: reg.year,
    make: reg.make,
    model: reg.model,
  });

  const warnings: string[] = [];
  if (reg.vin && !isValidVin(normalizeVin(reg.vin))) {
    warnings.push(`VIN failed checksum (${reg.vin}) — confirm manually.`);
  }

  let vehicleId: string | null = deal[vehicleIdField];

  if (!vehicleId) {
    const { data: created, error } = await ctx.supabase
      .from("vehicles")
      .insert(patch)
      .select("id")
      .single();
    if (error || !created) {
      return { summary: `Could not create vehicle: ${error?.message}`, fieldsApplied: [], warnings };
    }
    vehicleId = created.id;
    await ctx.supabase
      .from("deals")
      .update({ [vehicleIdField]: vehicleId })
      .eq("id", ctx.dealId);
  } else {
    await mergeAndAudit(ctx, "vehicles", vehicleId, patch);
  }

  // Mark capture assignment
  if (ctx.assignedTo === "unassigned") {
    await ctx.supabase
      .from("captures")
      .update({ assigned_to: target === "trade" ? "trade" : "vehicle_of_interest" })
      .eq("id", ctx.captureId);
  }

  const label = target === "trade" ? "trade" : "vehicle of interest";
  return {
    summary: `Applied ${kind} to ${label}: ${[reg.year, reg.make, reg.model].filter(Boolean).join(" ") || "(partial)"}.`,
    fieldsApplied: Object.keys(patch),
    warnings,
  };
}

// ─── Payoff ─────────────────────────────────────────────────────────────────

async function applyPayoff(ctx: ApplyContext, p: PayoffLetterExtraction): Promise<ApplyResult> {
  const patch = stripEmpty({
    trade_payoff_amount_cents: p.amountCents,
    trade_payoff_good_through: p.goodThroughDate,
    trade_payoff_lender: p.lender,
  });
  if (Object.keys(patch).length === 0) {
    return { summary: "Payoff: nothing to apply.", fieldsApplied: [], warnings: [] };
  }

  const { error } = await ctx.supabase.from("deals").update(patch).eq("id", ctx.dealId);
  if (error) return { summary: `Payoff apply failed: ${error.message}`, fieldsApplied: [], warnings: [] };

  const amt = p.amountCents ? `$${(p.amountCents / 100).toFixed(2)}` : "amount";
  return {
    summary: `Applied payoff: ${amt}${p.lender ? ` with ${p.lender}` : ""}${p.goodThroughDate ? ` good through ${p.goodThroughDate}` : ""}.`,
    fieldsApplied: Object.keys(patch),
    warnings: [],
  };
}

// ─── Stock sheet ────────────────────────────────────────────────────────────

async function applyStockSheet(ctx: ApplyContext, s: StockSheetExtraction): Promise<ApplyResult> {
  const { data: deal } = await ctx.supabase
    .from("deals")
    .select("*")
    .eq("id", ctx.dealId)
    .single();
  if (!deal) return { summary: "Deal not found.", fieldsApplied: [], warnings: [] };

  const patch = stripEmpty({
    vin: s.vin ? normalizeVin(s.vin) : undefined,
    year: s.year,
    make: s.make,
    model: s.model,
    trim: s.trim,
    color: s.color,
    mileage: s.mileage,
    stock_number: s.stockNumber,
  });

  const warnings: string[] = [];
  if (s.vin && !isValidVin(normalizeVin(s.vin))) {
    warnings.push(`VIN failed checksum (${s.vin}) — confirm manually.`);
  }

  let vehicleId = deal.vehicle_of_interest_id as string | null;
  if (!vehicleId) {
    const { data: created } = await ctx.supabase
      .from("vehicles")
      .insert(patch)
      .select("id")
      .single();
    vehicleId = created?.id ?? null;
    if (vehicleId) {
      await ctx.supabase
        .from("deals")
        .update({ vehicle_of_interest_id: vehicleId })
        .eq("id", ctx.dealId);
    }
  } else {
    await mergeAndAudit(ctx, "vehicles", vehicleId, patch);
  }

  if (ctx.assignedTo === "unassigned") {
    await ctx.supabase
      .from("captures")
      .update({ assigned_to: "vehicle_of_interest" })
      .eq("id", ctx.captureId);
  }

  return {
    summary: `Applied vehicle of interest: ${[s.year, s.make, s.model, s.trim].filter(Boolean).join(" ") || "(partial)"}.`,
    fieldsApplied: Object.keys(patch),
    warnings,
  };
}

// ─── DMS screenshot (best effort) ───────────────────────────────────────────

async function applyDms(ctx: ApplyContext, dms: DmsScreenshotExtraction): Promise<ApplyResult> {
  const applied: string[] = [];
  const warnings: string[] = [];

  if (dms.suggested?.customer && hasAnyValue(dms.suggested.customer)) {
    const res = await applyDl(
      { ...ctx, assignedTo: "primary" },
      dms.suggested.customer,
    );
    applied.push(...res.fieldsApplied.map((f) => `customer.${f}`));
    warnings.push(...res.warnings);
  }
  if (dms.suggested?.vehicle && hasAnyValue(dms.suggested.vehicle)) {
    const res = await applyStockSheet(
      { ...ctx, assignedTo: "vehicle_of_interest" },
      dms.suggested.vehicle,
    );
    applied.push(...res.fieldsApplied.map((f) => `vehicle.${f}`));
    warnings.push(...res.warnings);
  }
  if (dms.suggested?.trade && hasAnyValue(dms.suggested.trade)) {
    const res = await applyVehicleDoc(
      { ...ctx, assignedTo: "trade" },
      dms.suggested.trade,
      "registration",
    );
    applied.push(...res.fieldsApplied.map((f) => `trade.${f}`));
    warnings.push(...res.warnings);
  }

  const fieldCount = dms.labeledFields?.length ?? 0;
  return {
    summary: `DMS screen: parsed ${fieldCount} labeled fields. ${applied.length > 0 ? `Applied ${applied.length}.` : "No confident mapping."}`,
    fieldsApplied: applied,
    warnings,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out as Partial<T>;
}

function hasAnyValue(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj).some((v) => v !== null && v !== undefined && v !== "");
}

/**
 * Merge a patch into an existing row. Only writes fields that changed, and
 * writes a customer_edits audit row for each field (for customers only).
 */
async function mergeAndAudit(
  ctx: ApplyContext,
  table: "customers" | "vehicles",
  rowId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: existing } = await ctx.supabase.from(table).select("*").eq("id", rowId).single();
  if (!existing) return;

  const diff: Record<string, unknown> = {};
  const edits: Array<Record<string, unknown>> = [];

  for (const [field, newValue] of Object.entries(patch)) {
    const oldValue = (existing as Record<string, unknown>)[field];
    if (oldValue === newValue) continue;
    // If existing has a real value and new value would overwrite, preserve existing — extraction data augments, doesn't clobber.
    if (oldValue !== null && oldValue !== undefined && oldValue !== "") continue;
    diff[field] = newValue;
    if (table === "customers") {
      edits.push({
        customer_id: rowId,
        deal_id: ctx.dealId,
        field_path: field,
        old_value: oldValue ?? null,
        new_value: newValue,
        source: "extraction",
      });
    }
  }

  if (Object.keys(diff).length > 0) {
    await ctx.supabase.from(table).update(diff).eq("id", rowId);
  }
  if (edits.length > 0) {
    await ctx.supabase.from("customer_edits").insert(edits);
  }
}
