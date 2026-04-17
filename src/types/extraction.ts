// Structured extraction result types — one per document kind the AI can parse.
// Kept separate from DB types so we can evolve extraction schemas without migration churn.
// Gemini returns JSON shaped by a responseSchema; these interfaces mirror that.

export interface DriverLicenseExtraction {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string;                   // ISO date
  dlNumber?: string;
  dlState?: string;               // 2-letter, "OH" expected for 99% of captures
  dlExpiration?: string;          // ISO date
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  sex?: string;
  height?: string;
  weight?: string;
  eyes?: string;
  issueDate?: string;
}

export interface InsuranceCardExtraction {
  carrier?: string;
  policyNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  namedInsured?: string;
  vehicleVin?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
}

export interface RegistrationExtraction {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  ownerName?: string;
  ownerAddress?: string;
  plate?: string;
  expiration?: string;
  state?: string;
}

export interface TitleExtraction extends RegistrationExtraction {
  titleNumber?: string;
  lienHolder?: string;
}

export interface PayoffLetterExtraction {
  lender?: string;
  amountCents?: number;
  goodThroughDate?: string;
  accountNumberLast4?: string;
  perDiemCents?: number;
  vin?: string;
}

export interface StockSheetExtraction {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  mileage?: number;
  stockNumber?: string;
  msrpCents?: number;
  invoiceCents?: number;
}

export interface DmsScreenshotExtraction {
  // Generic labeled-table parsing — the model returns an array of (label, value) pairs
  // plus an attempted best-effort mapping into our known fields.
  labeledFields: Array<{ label: string; value: string }>;
  suggested: {
    customer?: Partial<DriverLicenseExtraction>;
    vehicle?: Partial<StockSheetExtraction>;
    trade?: Partial<RegistrationExtraction>;
  };
}

export type AnyExtraction =
  | DriverLicenseExtraction
  | InsuranceCardExtraction
  | RegistrationExtraction
  | TitleExtraction
  | PayoffLetterExtraction
  | StockSheetExtraction
  | DmsScreenshotExtraction;
