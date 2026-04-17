// Deterministic parser for common typed corrections in the chat thread.
// Runs BEFORE the Gemini chat model so that high-confidence updates don't
// go through the LLM — faster, cheaper, and predictable.
//
// Philosophy: only match on explicit, unambiguous phrasings. When in doubt,
// return no matches and let the chat model respond normally.

export type CorrectionScope = "primary" | "co_buyer" | "deal" | "vehicle_of_interest" | "trade";

export interface Correction {
  scope: CorrectionScope;
  /** DB column name on the target table. */
  field: string;
  /** Value in the shape expected by the column (string, number, ISO date). */
  value: string | number;
  /** Human label for the "Got it — updated X" acknowledgment. */
  label: string;
}

const MONEY_NUMBER = /([\d,]+(?:\.\d{1,2})?)/;
const DATE = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})/;
const PHONE = /([0-9][0-9\-\s\(\)\.\+]{6,20})/;
const ZIP = /(\d{5}(?:-\d{4})?)/;
const VIN = /([A-HJ-NPR-Z0-9]{17})/;
const SSN = /(\d{3}-?\d{2}-?\d{4})/;
const EMAIL = /([^\s@]+@[^\s@]+\.[^\s@]+)/;

export function parseCorrections(text: string): Correction[] {
  // Split into phrase-sized pieces so "address is X. payoff is Y" yields both.
  const pieces = text
    .split(/[\n;.]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: Correction[] = [];
  for (const piece of pieces) {
    const got = parseOne(piece);
    for (const c of got) {
      if (!out.some((x) => x.scope === c.scope && x.field === c.field)) out.push(c);
    }
  }
  return out;
}

function parseOne(s: string): Correction[] {
  const corrections: Correction[] = [];

  // ─── Who is being addressed? ──────────────────────────────────────────────
  // Default scope is primary customer. "co-buyer's address" → co_buyer scope.
  const isCoBuyer = /\bco[-\s]?buyer(?:'s)?\b/i.test(s);
  const customerScope: CorrectionScope = isCoBuyer ? "co_buyer" : "primary";
  // Strip the "co-buyer" prefix so field-detection regexes still line up.
  const body = s.replace(/\bco[-\s]?buyer(?:'s)?\b/gi, "").trim();

  // ─── Address ──────────────────────────────────────────────────────────────
  let m: RegExpExecArray | null;
  if ((m = /^address\s+(?:is|=|:)\s*(.{5,200})$/i.exec(body))) {
    corrections.push({ scope: customerScope, field: "address_line1", value: m[1]!.trim(), label: "address" });
  }

  if ((m = /^city\s+(?:is|=|:)\s*([A-Za-z][A-Za-z\s\-'\.]{1,60})$/i.exec(body))) {
    corrections.push({ scope: customerScope, field: "city", value: m[1]!.trim(), label: "city" });
  }

  if ((m = new RegExp(`\\bzip(?:code)?\\s+(?:is|=|:)?\\s*${ZIP.source}`, "i").exec(body))) {
    corrections.push({ scope: customerScope, field: "zip", value: m[1]!, label: "ZIP" });
  }

  // ─── Contact ──────────────────────────────────────────────────────────────
  if ((m = new RegExp(`^phone\\s+(?:is|=|:)?\\s*${PHONE.source}$`, "i").exec(body))) {
    corrections.push({ scope: customerScope, field: "phone", value: normalizePhone(m[1]!), label: "phone" });
  }

  if ((m = new RegExp(`^email\\s+(?:is|=|:)?\\s*${EMAIL.source}$`, "i").exec(body))) {
    corrections.push({ scope: customerScope, field: "email", value: m[1]!.toLowerCase(), label: "email" });
  }

  // ─── DOB ──────────────────────────────────────────────────────────────────
  if ((m = new RegExp(`\\b(?:dob|date of birth|birthdate)\\s+(?:is|=|:)?\\s*${DATE.source}`, "i").exec(body))) {
    const iso = toIsoDate(m[1]!);
    if (iso) corrections.push({ scope: customerScope, field: "dob", value: iso, label: "DOB" });
  }

  // ─── Payoff ───────────────────────────────────────────────────────────────
  if ((m = new RegExp(`\\bpayoff\\s+(?:is|=|:)?\\s*\\$?\\s*${MONEY_NUMBER.source}`, "i").exec(body))) {
    const cents = moneyToCents(m[1]!);
    if (cents !== null) {
      corrections.push({ scope: "deal", field: "trade_payoff_amount_cents", value: cents, label: "payoff" });
    }
    const thruMatch = new RegExp(`good\\s+through\\s+${DATE.source}`, "i").exec(body);
    if (thruMatch) {
      const iso = toIsoDate(thruMatch[1]!);
      if (iso) corrections.push({ scope: "deal", field: "trade_payoff_good_through", value: iso, label: "payoff good-through" });
    }
  }

  if ((m = /^lender\s+(?:is|=|:)?\s*(.+)$/i.exec(body))) {
    corrections.push({ scope: "deal", field: "trade_payoff_lender", value: m[1]!.trim(), label: "lender" });
  }

  // ─── Income + employer (credit app inputs) ────────────────────────────────
  if ((m = new RegExp(`^(?:monthly\\s+)?income\\s+(?:is|=|:)?\\s*\\$?\\s*${MONEY_NUMBER.source}\\s*(?:\\/\\s*(mo|month|yr|year|annually))?`, "i").exec(body))) {
    let cents = moneyToCents(m[1]!);
    if (cents !== null) {
      const per = m[2]?.toLowerCase();
      if (per && /yr|year|annually/.test(per)) cents = Math.round(cents / 12);
      corrections.push({ scope: customerScope, field: "monthly_income_cents", value: cents, label: "monthly income" });
    }
  }

  if ((m = /^employer\s+(?:is|=|:)?\s*(.+)$/i.exec(body))) {
    corrections.push({ scope: customerScope, field: "employer", value: m[1]!.trim(), label: "employer" });
  }

  if ((m = /^occupation\s+(?:is|=|:)?\s*(.+)$/i.exec(body))) {
    corrections.push({ scope: customerScope, field: "occupation", value: m[1]!.trim(), label: "occupation" });
  }

  // ─── SSN (high-stakes — strict, and only via explicit "ssn" prefix) ──────
  if ((m = new RegExp(`\\bssn\\s+(?:is|=|:)?\\s*${SSN.source}`, "i").exec(body))) {
    const raw = m[1]!.replace(/-/g, "");
    corrections.push({ scope: customerScope, field: "ssn_full", value: raw, label: "SSN" });
    corrections.push({ scope: customerScope, field: "ssn_last4", value: raw.slice(-4), label: "SSN last 4" });
  }

  // ─── VIN ──────────────────────────────────────────────────────────────────
  if ((m = new RegExp(`\\bvin\\s+(?:is|=|:)?\\s*${VIN.source}`, "i").exec(body))) {
    // Default to vehicle_of_interest unless the message mentions "trade".
    const scope: CorrectionScope = /\btrade\b/i.test(s) ? "trade" : "vehicle_of_interest";
    corrections.push({ scope, field: "vin", value: m[1]!.toUpperCase(), label: "VIN" });
  }

  // ─── Stock number ─────────────────────────────────────────────────────────
  if ((m = /^stock\s*(?:#|number|no)?\s+(?:is|=|:)?\s*([A-Z0-9\-]{2,20})$/i.exec(body))) {
    corrections.push({ scope: "vehicle_of_interest", field: "stock_number", value: m[1]!.toUpperCase(), label: "stock number" });
  }

  return corrections;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9+]/g, "");
}

function moneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Normalize "1/5/2026", "01/05/2026", "2026-01-05" → "2026-01-05".
 * Returns null if unparseable.
 */
export function toIsoDate(raw: string): string | null {
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [y, mo, d] = raw.split("-");
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
    const [mo, d, y] = raw.split("/");
    const year = y!.length === 2 ? (Number(y) >= 50 ? `19${y}` : `20${y}`) : y!;
    return `${year}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}
