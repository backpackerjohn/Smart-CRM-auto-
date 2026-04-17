// Domain types that mirror the Supabase schema in supabase/migrations/20260417000000_initial_schema.sql.
// Keep in sync with the migration. A future task is to generate these via `supabase gen types typescript`.

export type DealStage = "active" | "pending_finance" | "delivered" | "archived";

export type CaptureKind =
  | "dl_front"
  | "dl_back"
  | "insurance_card"
  | "registration"
  | "title"
  | "payoff_letter"
  | "stock_sheet"
  | "dms_screenshot"
  | "other";

export type CaptureOwner =
  | "primary"
  | "co_buyer"
  | "trade"
  | "vehicle_of_interest"
  | "unassigned";

export type ChatRole = "user" | "assistant" | "system";

export type ChecklistState = "missing" | "complete" | "manual" | "warn";

export type PdfMappingStatus = "ai_proposed" | "user_confirmed" | "user_overridden";

export interface Customer {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  dob: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  dl_number: string | null;
  dl_state: string | null;
  dl_expiration: string | null;
  ssn_last4: string | null;
  ssn_full: string | null;
  employer: string | null;
  employer_phone: string | null;
  occupation: string | null;
  monthly_income_cents: number | null;
  years_at_address: number | null;
  years_employed: number | null;
  notes: string | null;
}

export interface Vehicle {
  id: string;
  owner_id: string;
  created_at: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  mileage: number | null;
  stock_number: string | null;
}

export interface Deal {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  primary_customer_id: string | null;
  co_buyer_customer_id: string | null;
  vehicle_of_interest_id: string | null;
  trade_vehicle_id: string | null;
  trade_payoff_amount_cents: number | null;
  trade_payoff_good_through: string | null;
  trade_payoff_lender: string | null;
  insurance_carrier: string | null;
  insurance_policy: string | null;
  insurance_effective: string | null;
  insurance_expires: string | null;
  stage: DealStage;
  stage_changed_at: string;
  delivered_at: string | null;
  archived_at: string | null;
  title: string | null;
  notes: string | null;
}

export interface Capture {
  id: string;
  owner_id: string;
  created_at: string;
  deal_id: string | null;
  storage_path: string;
  mime_type: string;
  filename: string | null;
  kind: CaptureKind;
  assigned_to: CaptureOwner;
  device: string | null;
  bytes: number | null;
}

export interface Extraction {
  id: string;
  owner_id: string;
  created_at: string;
  capture_id: string;
  doc_type: CaptureKind;
  structured_data: Record<string, unknown>;
  confidence: Record<string, number>;
  model: string;
  model_version: string | null;
  latency_ms: number | null;
  raw_response: unknown;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  owner_id: string;
  created_at: string;
  deal_id: string;
  role: ChatRole;
  content: string;
  capture_id: string | null;
  metadata: Record<string, unknown>;
}

export interface CustomerEdit {
  id: string;
  owner_id: string;
  created_at: string;
  customer_id: string;
  deal_id: string | null;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  source: "chat" | "profile" | "extraction" | "system";
}

export interface PdfForm {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  storage_path: string;
  form_set: string | null;
  bytes: number | null;
  field_count: number | null;
}

export interface PdfFieldMapping {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  pdf_form_id: string;
  pdf_field_name: string;
  pdf_field_type: string | null;
  target_path: string | null;
  transform: string | null;
  default_value: string | null;
  status: PdfMappingStatus;
  ai_confidence: number | null;
  ai_rationale: string | null;
}

export interface FilledPdf {
  id: string;
  owner_id: string;
  created_at: string;
  deal_id: string;
  pdf_form_id: string;
  storage_path: string;
  bytes: number | null;
  fields_filled: number | null;
  fields_blank: number | null;
}

export interface ChecklistItem {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deal_id: string;
  kind: string;
  label: string;
  state: ChecklistState;
  source_capture_id: string | null;
  message: string | null;
  sort_order: number;
}
