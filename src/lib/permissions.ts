import type { AppRole } from "./auth";

/** Explicit HR permission layer. UI uses it to hide controls; RLS enforces the same rules server-side. */
export type HrPermission = "view_notes" | "view_salary" | "view_scorecards" | "approve" | "manage_bands" | "run_interviews" | "ats_push";

const MATRIX: Record<AppRole, HrPermission[]> = {
  admin: ["view_notes", "view_salary", "view_scorecards", "approve", "manage_bands", "run_interviews", "ats_push"],
  recruiter: ["view_notes", "view_salary", "view_scorecards", "run_interviews", "ats_push"],
  reviewer: ["view_notes", "view_salary", "view_scorecards", "approve"],
};

export function can(roles: AppRole[], p: HrPermission) {
  return roles.some((r) => MATRIX[r]?.includes(p));
}
export const isHr = (roles: AppRole[]) => roles.length > 0;
