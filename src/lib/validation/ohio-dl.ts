// Ohio DL format: 2 letters + 6 digits (e.g., "AB123456").
// Source: Ohio BMV. Not a checksum — just a format sanity check.

const OHIO_DL_RE = /^[A-Z]{2}\d{6}$/;

export function isValidOhioDl(raw: string): boolean {
  if (!raw) return false;
  return OHIO_DL_RE.test(raw.toUpperCase().trim());
}

export function normalizeOhioDl(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
