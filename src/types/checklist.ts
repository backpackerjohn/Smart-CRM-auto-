// Checklist items are deterministic. The rules below derive them from the Deal's data.
// See src/lib/checklist/compute.ts for the reducer.

export interface ChecklistRow {
  kind: ChecklistKind;
  label: string;
  state: "missing" | "complete" | "manual" | "warn";
  sourceCaptureId?: string;
  message?: string;
  sortOrder: number;
}

export type ChecklistKind =
  | "primary_dl_front"
  | "primary_dl_back"
  | "primary_dl_expired"
  | "co_buyer_dl_front"
  | "co_buyer_dl_back"
  | "co_buyer_dl_expired"
  | "insurance_card"
  | "insurance_expiring_soon"
  | "vehicle_of_interest"
  | "trade_registration"
  | "trade_payoff"
  | "credit_app_ssn_primary"
  | "credit_app_ssn_co_buyer"
  | "credit_app_income_primary"
  | "credit_app_income_co_buyer";
