import type { Customer, Deal, PdfForm } from "@/types/db";
import type { ChecklistRow, ChecklistKind } from "@/types/checklist";
import { isExpired, isInsuranceExpiringBefore } from "@/lib/validation/dates";

/**
 * Deterministic checklist. Inputs are the Deal's flattened state + which PDFs
 * the rep intends to fill (determines whether credit-app rows are surfaced).
 */
export interface ComputeInput {
  deal: Deal;
  primary: Customer | null;
  coBuyer: Customer | null;
  hasPrimaryDlFront: boolean;
  hasPrimaryDlBack: boolean;
  hasCoBuyerDlFront: boolean;
  hasCoBuyerDlBack: boolean;
  hasInsuranceCapture: boolean;
  hasRegistrationCapture: boolean;
  plannedForms: PdfForm[];          // which PDFs rep plans to fill
}

function row(
  kind: ChecklistKind,
  label: string,
  state: ChecklistRow["state"],
  sortOrder: number,
  message?: string,
): ChecklistRow {
  return { kind, label, state, sortOrder, message };
}

export function computeChecklist(input: ComputeInput): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  const hasCoBuyer = input.coBuyer !== null;
  const hasCreditApp = input.plannedForms.some((f) =>
    /credit[\s_-]?app/i.test(f.name) || f.form_set === "credit_app",
  );

  // Primary DL
  rows.push(row(
    "primary_dl_front",
    "Primary DL — front",
    input.hasPrimaryDlFront ? "complete" : "missing",
    10,
  ));
  rows.push(row(
    "primary_dl_back",
    "Primary DL — back",
    input.hasPrimaryDlBack ? "complete" : "missing",
    11,
  ));
  if (input.primary?.dl_expiration && isExpired(input.primary.dl_expiration)) {
    rows.push(row(
      "primary_dl_front",
      "Primary DL is expired",
      "warn",
      12,
      `expired ${input.primary.dl_expiration}`,
    ));
  }

  // Co-buyer DL (only if co-buyer exists)
  if (hasCoBuyer) {
    rows.push(row("co_buyer_dl_front", "Co-buyer DL — front", input.hasCoBuyerDlFront ? "complete" : "missing", 20));
    rows.push(row("co_buyer_dl_back", "Co-buyer DL — back", input.hasCoBuyerDlBack ? "complete" : "missing", 21));
  }

  // Insurance
  rows.push(row(
    "insurance_card",
    "Insurance card",
    input.hasInsuranceCapture || input.deal.insurance_carrier ? "complete" : "missing",
    30,
  ));
  if (input.deal.insurance_expires && input.deal.delivered_at === null && isInsuranceExpiringBefore(
    input.deal.insurance_expires, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
  )) {
    rows.push(row(
      "insurance_card",
      "Insurance expires within 7 days — verify with customer",
      "warn",
      31,
      input.deal.insurance_expires,
    ));
  }

  // Vehicle of interest
  rows.push(row(
    "vehicle_of_interest",
    "Vehicle of interest",
    input.deal.vehicle_of_interest_id ? "complete" : "missing",
    40,
  ));

  // Trade
  if (input.deal.trade_vehicle_id) {
    rows.push(row(
      "trade_registration",
      "Trade registration / title",
      input.hasRegistrationCapture ? "complete" : "missing",
      50,
    ));
    const hasPayoff = input.deal.trade_payoff_amount_cents !== null && input.deal.trade_payoff_good_through !== null;
    rows.push(row(
      "trade_payoff",
      "Trade payoff",
      hasPayoff ? "complete" : "missing",
      51,
    ));
  }

  // Credit app — only if rep plans to fill a credit app
  if (hasCreditApp) {
    rows.push(row(
      "credit_app_ssn_primary",
      "Primary SSN (credit app)",
      input.primary?.ssn_full || input.primary?.ssn_last4 ? "complete" : "manual",
      60,
    ));
    rows.push(row(
      "credit_app_income_primary",
      "Primary income (credit app)",
      input.primary?.monthly_income_cents !== null && input.primary?.monthly_income_cents !== undefined ? "complete" : "manual",
      61,
    ));
    if (hasCoBuyer) {
      rows.push(row(
        "credit_app_ssn_co_buyer",
        "Co-buyer SSN (credit app)",
        input.coBuyer?.ssn_full || input.coBuyer?.ssn_last4 ? "complete" : "manual",
        70,
      ));
      rows.push(row(
        "credit_app_income_co_buyer",
        "Co-buyer income (credit app)",
        input.coBuyer?.monthly_income_cents !== null && input.coBuyer?.monthly_income_cents !== undefined ? "complete" : "manual",
        71,
      ));
    }
  }

  return rows;
}
