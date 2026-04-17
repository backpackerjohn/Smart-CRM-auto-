import { callStructured } from "./client";
import { pdfMappingSchema } from "./schemas";

// AI-proposes a mapping between a PDF's named form fields and our data model.
// The user reviews the mapping once; afterwards the fill path is deterministic.

export interface PdfMapProposal {
  pdfFieldName: string;
  targetPath?: string;
  transform?: string;
  confidence?: number;
  rationale?: string;
}

export interface ProposeMappingInput {
  formName: string;
  fieldNames: Array<{ name: string; type: string | null }>;
}

const ALLOWED_ROOTS = [
  "primary.firstName", "primary.middleName", "primary.lastName",
  "primary.dob", "primary.dlNumber", "primary.dlState", "primary.dlExpiration",
  "primary.addressLine1", "primary.addressLine2", "primary.city", "primary.state", "primary.zip",
  "primary.phone", "primary.email",
  "primary.ssnFull", "primary.ssnLast4", "primary.employer", "primary.employerPhone",
  "primary.occupation", "primary.monthlyIncomeCents", "primary.yearsAtAddress", "primary.yearsEmployed",
  "coBuyer.firstName", "coBuyer.middleName", "coBuyer.lastName",
  "coBuyer.dob", "coBuyer.dlNumber", "coBuyer.dlState", "coBuyer.dlExpiration",
  "coBuyer.addressLine1", "coBuyer.addressLine2", "coBuyer.city", "coBuyer.state", "coBuyer.zip",
  "coBuyer.phone", "coBuyer.email",
  "coBuyer.ssnFull", "coBuyer.ssnLast4", "coBuyer.employer", "coBuyer.employerPhone",
  "coBuyer.occupation", "coBuyer.monthlyIncomeCents", "coBuyer.yearsAtAddress", "coBuyer.yearsEmployed",
  "vehicle.vin", "vehicle.year", "vehicle.make", "vehicle.model", "vehicle.trim", "vehicle.color",
  "vehicle.mileage", "vehicle.stockNumber",
  "trade.vin", "trade.year", "trade.make", "trade.model", "trade.color", "trade.mileage",
  "trade.payoffAmountCents", "trade.payoffGoodThrough", "trade.payoffLender",
  "insurance.carrier", "insurance.policy", "insurance.effective", "insurance.expires",
  "deal.createdAt", "deal.title",
] as const;

const SYSTEM = `You map fillable PDF field names to a dealership CRM data model.

Allowed target paths (use exactly these strings; leave blank if no good match):
${ALLOWED_ROOTS.join(", ")}

Guidelines:
- Credit app forms usually have an "applicant" / "co-applicant" (or "borrower" / "co-borrower") split. Route accordingly.
- "txt_ssn_1", "TaxID", "ssn" → primary.ssnFull. "TaxID_co" → coBuyer.ssnFull.
- Date fields: transform "date:MM/DD/YYYY" for typical retail forms.
- Currency fields in dollars: use primary.monthlyIncomeCents with transform "currency" (source is cents, transform divides by 100).
- Confidence 0.9+ for obvious matches, 0.5-0.8 for best-guess, <0.5 for weak matches.
- Omit transform if 'none'.`;

export async function proposePdfMapping(input: ProposeMappingInput): Promise<PdfMapProposal[]> {
  const prompt = `Form: ${input.formName}\n\nFields (name | type):\n${input.fieldNames
    .map((f) => `${f.name} | ${f.type ?? "text"}`)
    .join("\n")}`;

  const { value } = await callStructured<{ mappings: PdfMapProposal[] }>(
    [{ role: "user", parts: [{ text: prompt }] }],
    {
      systemInstruction: SYSTEM,
      responseSchema: pdfMappingSchema,
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  );

  return value.mappings ?? [];
}
