export type SalaryAlignment =
  | "within_band"
  | "below_band"
  | "above_band"
  | "band_not_configured"
  | "pending_review";

export interface SalaryBand {
  minimum_salary: number;
  maximum_salary: number;
  currency?: string;
}

/** Deterministic salary comparison — never delegated to the AI. */
export function computeSalaryAlignment(
  expected: number | null | undefined,
  band: SalaryBand | null | undefined,
): SalaryAlignment {
  if (!band) return "band_not_configured";
  if (expected == null || Number.isNaN(Number(expected))) return "pending_review";
  const v = Number(expected);
  if (v < Number(band.minimum_salary)) return "below_band";
  if (v > Number(band.maximum_salary)) return "above_band";
  return "within_band";
}

/** Any expectation outside the band (or unknown) needs a human. */
export function salaryNeedsHumanReview(a: SalaryAlignment): boolean {
  return a !== "within_band";
}
