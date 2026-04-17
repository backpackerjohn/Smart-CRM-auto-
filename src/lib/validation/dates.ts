import { isValid, parseISO, differenceInYears, isBefore, isAfter } from "date-fns";

export function isValidIsoDate(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return isValid(parseISO(raw));
}

export function isExpired(dateIso: string | null | undefined, asOf: Date = new Date()): boolean {
  if (!dateIso) return false;
  const d = parseISO(dateIso);
  return isValid(d) && isBefore(d, asOf);
}

export function isInsuranceExpiringBefore(
  insuranceExpires: string | null | undefined,
  beforeDate: string | Date | null | undefined,
): boolean {
  if (!insuranceExpires || !beforeDate) return false;
  const expires = parseISO(insuranceExpires);
  const before = typeof beforeDate === "string" ? parseISO(beforeDate) : beforeDate;
  return isValid(expires) && isValid(before) && isBefore(expires, before);
}

export function ageInYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = parseISO(dob);
  if (!isValid(d)) return null;
  return differenceInYears(new Date(), d);
}

export function isDateInFuture(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const d = parseISO(raw);
  return isValid(d) && isAfter(d, new Date());
}
