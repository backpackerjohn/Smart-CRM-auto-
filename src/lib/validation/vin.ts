// ISO 3779 17-character VIN check-digit validation.
// Position 9 (0-indexed 8) is the check digit.

const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5,       P: 7,       R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidVin(raw: string): boolean {
  if (!raw) return false;
  const vin = raw.toUpperCase().trim();
  if (vin.length !== 17) return false;
  if (/[IOQ]/.test(vin)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = VIN_TRANSLITERATION[vin[i]!];
    if (v === undefined) return false;
    sum += v * WEIGHTS[i]!;
  }
  const mod = sum % 11;
  const checkChar = mod === 10 ? "X" : String(mod);
  return vin[8] === checkChar;
}

export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}
