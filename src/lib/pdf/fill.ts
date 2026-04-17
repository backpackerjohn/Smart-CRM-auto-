import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from "pdf-lib";
import type { PdfFieldMapping } from "@/types/db";
import { format, parseISO, isValid as isValidDate } from "date-fns";

// Deterministic PDF fill. No AI in this path.
// Given a PDF template + saved field mappings + a Deal's flattened data object,
// produce a filled PDF as a byte array. High-stakes validation runs before fill.

export interface FillResult {
  bytes: Uint8Array;
  fieldsFilled: number;
  fieldsBlank: number;
  missingTargets: string[];        // targetPaths we had no data for
}

/**
 * Resolve a dot path into a plain object. Supports cent→dollar currency transform.
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function applyTransform(value: unknown, transform: string | null): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);

  if (!transform || transform === "none") return s;
  if (transform === "uppercase") return s.toUpperCase();
  if (transform === "ssn-mask") return s.length >= 4 ? `XXX-XX-${s.slice(-4)}` : s;
  if (transform === "currency") {
    const cents = typeof value === "number" ? value : parseInt(s, 10);
    if (Number.isNaN(cents)) return s;
    return (cents / 100).toFixed(2);
  }
  if (transform.startsWith("date:")) {
    const fmt = transform.slice(5);
    const d = typeof value === "string" ? parseISO(s) : null;
    if (!d || !isValidDate(d)) return s;
    return format(d, fmt);
  }
  return s;
}

export interface FillInput {
  templateBytes: ArrayBuffer | Uint8Array;
  mappings: PdfFieldMapping[];
  data: Record<string, unknown>;   // flattened {primary: {...}, coBuyer: {...}, vehicle: {...}, trade: {...}, insurance: {...}, deal: {...}}
}

export async function fillPdf(input: FillInput): Promise<FillResult> {
  const pdf = await PDFDocument.load(input.templateBytes);
  const form = pdf.getForm();

  let filled = 0;
  let blank = 0;
  const missing: string[] = [];

  for (const mapping of input.mappings) {
    const field = form.getFieldMaybe(mapping.pdf_field_name);
    if (!field) continue;

    let value: string | null = null;
    if (mapping.target_path) {
      const raw = getByPath(input.data, mapping.target_path);
      value = applyTransform(raw, mapping.transform);
      if (!value && mapping.default_value) value = mapping.default_value;
      if (!value) missing.push(mapping.target_path);
    } else if (mapping.default_value) {
      value = mapping.default_value;
    }

    try {
      if (field instanceof PDFTextField) {
        if (value) { field.setText(value); filled++; } else { blank++; }
      } else if (field instanceof PDFCheckBox) {
        if (value && /^(yes|true|1|x)$/i.test(value)) { field.check(); filled++; } else { blank++; }
      } else if (field instanceof PDFRadioGroup) {
        if (value) { try { field.select(value); filled++; } catch { blank++; } } else { blank++; }
      } else if (field instanceof PDFDropdown) {
        if (value) { try { field.select(value); filled++; } catch { blank++; } } else { blank++; }
      }
    } catch {
      blank++;
    }
  }

  // Keep fields editable after fill — dealer may tweak before printing.
  // To flatten instead: form.flatten();

  const bytes = await pdf.save();
  return { bytes, fieldsFilled: filled, fieldsBlank: blank, missingTargets: missing };
}

/**
 * Read the named form-field list from a PDF template — used during PDF upload
 * before asking Gemini to propose mappings.
 */
export async function readPdfFieldNames(bytes: ArrayBuffer | Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  return form.getFields().map((f) => ({
    name: f.getName(),
    type:
      f instanceof PDFTextField ? "text" :
      f instanceof PDFCheckBox ? "checkbox" :
      f instanceof PDFRadioGroup ? "radio" :
      f instanceof PDFDropdown ? "dropdown" : "other",
  }));
}
