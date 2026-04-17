import { callStructured } from "./client";
import {
  dlSchema,
  insuranceSchema,
  registrationSchema,
  titleSchema,
  payoffSchema,
  stockSheetSchema,
  dmsScreenshotSchema,
} from "./schemas";
import type { CaptureKind } from "@/types/db";
import type {
  DriverLicenseExtraction,
  InsuranceCardExtraction,
  RegistrationExtraction,
  TitleExtraction,
  PayoffLetterExtraction,
  StockSheetExtraction,
  DmsScreenshotExtraction,
} from "@/types/extraction";

// System instruction kept short. Avoid over-specifying — Gemini structured output does the heavy lifting.
const SYSTEM = `You extract structured data from dealership documents. Output must match the provided JSON schema exactly. Leave fields blank when not clearly legible. Do not guess VINs, DL numbers, or dollar amounts — if unclear, omit.`;

interface ImagePart {
  inlineData: { data: string; mimeType: string };
}

function imagePart(base64: string, mimeType: string): ImagePart {
  return { inlineData: { data: base64, mimeType } };
}

function textPart(text: string) {
  return { text };
}

export interface ExtractInput {
  imageBase64: string;
  mimeType: string;
  kind: CaptureKind;
  context?: string;           // extra hint, e.g. "Ohio DL expected" or "back side"
}

const schemaFor: Record<CaptureKind, unknown> = {
  dl_front: dlSchema,
  dl_back: dlSchema,
  insurance_card: insuranceSchema,
  registration: registrationSchema,
  title: titleSchema,
  payoff_letter: payoffSchema,
  stock_sheet: stockSheetSchema,
  dms_screenshot: dmsScreenshotSchema,
  other: dlSchema,             // default; caller should re-kind before extracting
};

const promptFor: Record<CaptureKind, string> = {
  dl_front: "Extract the front-of-driver-license fields. Ohio DLs are the common case.",
  dl_back: "Extract any fields visible on the back of the driver license (barcode data, address if on back, etc.).",
  insurance_card: "Extract the insurance card fields. Include effective and expiration dates.",
  registration: "Extract the vehicle registration fields.",
  title: "Extract the vehicle title fields including title number and lien holder if present.",
  payoff_letter: "Extract the lender payoff information. Use cents, not dollars, for money amounts.",
  stock_sheet: "Extract the vehicle stock sheet / window sticker fields.",
  dms_screenshot:
    "This is a DMS (dealer management system) screen. Parse visible labeled fields into (label, value) pairs. In the `suggested` object, best-effort map into customer/vehicle/trade shapes if the screen is clearly one of those.",
  other: "Extract any dealership-relevant fields you can identify.",
};

export async function extractCapture(input: ExtractInput) {
  const schema = schemaFor[input.kind];
  const prompt = promptFor[input.kind];
  const ctx = input.context ? `\n\nContext: ${input.context}` : "";

  const { value, latencyMs, raw } = await callStructured<unknown>(
    [
      {
        role: "user",
        parts: [textPart(prompt + ctx), imagePart(input.imageBase64, input.mimeType)],
      },
    ],
    {
      systemInstruction: SYSTEM,
      responseSchema: schema,
      temperature: 0.1,
    },
  );

  return {
    structured: value as
      | DriverLicenseExtraction
      | InsuranceCardExtraction
      | RegistrationExtraction
      | TitleExtraction
      | PayoffLetterExtraction
      | StockSheetExtraction
      | DmsScreenshotExtraction,
    latencyMs,
    model: raw.modelVersion ?? "gemini",
    raw,
  };
}
