export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

export const CANDIDATE_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  ready: { label: "Ready for Interview", tone: "info" },
  in_progress: { label: "Interview In Progress", tone: "primary" },
  evaluation_pending: { label: "Evaluation Pending", tone: "warning" },
  human_review: { label: "Human Review Required", tone: "warning" },
  recommended: { label: "Recommended for Final Round", tone: "success" },
  not_recommended: { label: "Not Recommended", tone: "danger" },
  on_hold: { label: "On Hold", tone: "neutral" },
};

export const SALARY_ALIGNMENT: Record<string, { label: string; tone: Tone }> = {
  within_band: { label: "Within Band", tone: "success" },
  below_band: { label: "Below Band", tone: "warning" },
  above_band: { label: "Above Band", tone: "danger" },
  band_not_configured: { label: "Band Not Configured", tone: "neutral" },
  pending_review: { label: "Pending Human Review", tone: "warning" },
};

export const RECOMMENDATION: Record<string, { label: string; tone: Tone }> = {
  recommend_final: { label: "Recommend for Final Round", tone: "success" },
  hold_review: { label: "Hold for Human Review", tone: "warning" },
  not_recommended: { label: "Not Recommended", tone: "danger" },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_required: { label: "Not Required", tone: "neutral" },
  pending: { label: "Pending Review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  info_requested: { label: "Info Requested", tone: "info" },
  returned: { label: "Returned", tone: "neutral" },
};

export const INTERVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  in_progress: { label: "In Progress", tone: "primary" },
  completed: { label: "Completed", tone: "info" },
  evaluated: { label: "Evaluated", tone: "success" },
  evaluation_failed: { label: "Evaluation Failed", tone: "danger" },
};

export const EXPERIENCE: Record<string, string> = {
  fresher: "Fresher",
  experienced: "Experienced (0–6 yrs)",
};

export function formatMoney(v: number | null | undefined, currency = "INR") {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(v));
  } catch {
    return `${currency} ${Number(v).toLocaleString()}`;
  }
}

export function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Pass-through = progressed / candidates with a recorded final-round outcome × 100. */
export function passThroughRate(outcomes: (string | null | undefined)[]): number | null {
  const recorded = outcomes.filter((o) => o === "progressed" || o === "not_progressed");
  if (recorded.length === 0) return null;
  return (recorded.filter((o) => o === "progressed").length / recorded.length) * 100;
}
