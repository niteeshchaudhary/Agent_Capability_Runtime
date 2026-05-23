const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_PATTERN = /^(\d+)([smhd])$/;

/**
 * Parse duration strings like "15m", "1h" or a number of seconds.
 */
export function parseExpiresIn(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error("expiresIn must be a positive integer (seconds)");
    }
    return value;
  }

  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (trimmed !== "" && Number.isInteger(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid expiresIn "${value}". Use seconds (number) or duration like 15m, 1h, 30s, 1d`,
    );
  }

  const amount = Number(match[1]!);
  const unitKey = match[2] as keyof typeof UNIT_MS;
  const unitMs = UNIT_MS[unitKey];
  if (unitMs === undefined) {
    throw new Error(`Invalid expiresIn unit in "${value}"`);
  }
  return Math.floor((amount * unitMs) / 1_000);
}

export function createTokenId(): string {
  return `cap_${crypto.randomUUID()}`;
}
