import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildEvaluationPrompt,
  buildSystemPrompt,
  fallbackQuestion,
  SECTIONS,
  type InterviewState,
} from "./interview-prompts";
import { findProhibitedTopic } from "./guardrails";
import { computeSalaryAlignment, salaryNeedsHumanReview } from "./salary";

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function getModel(sb: SB): Promise<string> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "ai_model").maybeSingle();
  return typeof data?.value === "string" && data.value ? data.value : DEFAULT_MODEL;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profileText(c: any) {
  if (!c) return "Not available.";
  const parts = [
    `Experience: ${c.experience_level} (${c.years_of_experience ?? 0} yrs)`,
    c.current_company ? `Current company: ${c.current_company}` : null,
    c.current_location ? `Location: ${c.current_location}` : null,
    Array.isArray(c.skills) && c.skills.length ? `Skills (claimed): ${(c.skills as string[]).join(", ")}` : null,
    c.notice_period_days != null ? `Notice period (recorded): ${c.notice_period_days} days` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

async function audit(sb: SB, userId: string, action: string, type: string, id: string | null, metadata = {}) {
  await sb.from("audit_logs").insert({ actor_id: userId, action, entity_type: type, entity_id: id, metadata });
}

async function activeBand(sb: SB, jobRoleId: string | null) {
  if (!jobRoleId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("salary_bands")
    .select("*")
    .eq("job_role_id", jobRoleId)
    .eq("is_active", true)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/* ---------------- create interview ---------------- */
export const createInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        candidateId: z.string().uuid(),
        jobRoleId: z.string().uuid().nullable(),
        experienceCategory: z.enum(["fresher", "experienced"]),
        interviewType: z.string().min(1).max(80),
        durationMinutes: z.number().int().min(10).max(120),
        roleContext: z.string().max(6000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const findActive = async () =>
      (await sb.from("interviews").select("id").eq("candidate_id", data.candidateId).eq("status", "in_progress").maybeSingle()).data;
    const existing = await findActive();
    if (existing) return { interviewId: existing.id as string, resumed: true };

    const { data: iv, error } = await sb
      .from("interviews")
      .insert({
        candidate_id: data.candidateId,
        job_role_id: data.jobRoleId,
        experience_category: data.experienceCategory,
        interview_type: data.interviewType,
        duration_minutes: data.durationMinutes,
        role_context: data.roleContext,
        interviewer_id: context.userId,
        state: { topics_covered: [], unresolved_followups: [], questions_asked: 0 },
      })
      .select("id")
      .single();
    if (error || !iv) {
      const again = await findActive();
      if (again) return { interviewId: again.id as string, resumed: true };
      throw new Error("Could not start the interview. You may not have access to this candidate.");
    }
    await sb.from("candidates").update({ status: "in_progress" }).eq("id", data.candidateId);
    await audit(sb, context.userId, "interview.started", "interview", iv.id);
    return { interviewId: iv.id as string, resumed: false };
  });

/* ---------------- interview turn ---------------- */
const TurnSchema = z.object({
  message: z.string().min(1).max(2000),
  section: z.string(),
  topics_covered: z.array(z.string()).default([]),
  unresolved_followups: z.array(z.string()).default([]),
  interview_complete: z.boolean().default(false),
});

export const interviewTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        interviewId: z.string().uuid(),
        text: z.string().trim().min(1).max(4000).optional(),
        clientMessageId: z.string().min(6).max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: iv } = await sb
      .from("interviews")
      .select("*, candidates(*), job_roles(title)")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv) return { ok: false as const, error: "Interview not found." };
    if (iv.status !== "in_progress") return { ok: false as const, error: "This interview has already ended." };

    const loadMsgs = async () =>
      ((await sb.from("interview_messages").select("*").eq("interview_id", iv.id).order("sequence_number")).data ?? []) as {
        sender_type: string;
        message: string;
        sequence_number: number;
        client_message_id: string | null;
      }[];
    let msgs = await loadMsgs();

    if (data.text) {
      const dup = data.clientMessageId && msgs.some((m) => m.client_message_id === data.clientMessageId);
      if (!dup) {
        const seq = (msgs.at(-1)?.sequence_number ?? 0) + 1;
        const { error } = await sb.from("interview_messages").insert({
          interview_id: iv.id,
          sender_type: "candidate",
          message: data.text,
          sequence_number: seq,
          client_message_id: data.clientMessageId ?? null,
          section: iv.current_section,
        });
        if (error && error.code !== "23505")
          return { ok: false as const, error: "Your answer could not be saved. Please try again." };
        msgs = await loadMsgs();
      }
    }

    const last = msgs.at(-1);
    if (last && last.sender_type === "ai") return { ok: true as const, generated: false, complete: false };

    const state: InterviewState = {
      topics_covered: iv.state?.topics_covered ?? [],
      unresolved_followups: iv.state?.unresolved_followups ?? [],
      questions_asked: iv.state?.questions_asked ?? 0,
    };
    const elapsed = Math.round((Date.now() - new Date(iv.started_at).getTime()) / 60000);
    const system = buildSystemPrompt({
      category: iv.experience_category,
      candidateName: iv.candidates?.full_name ?? "Candidate",
      jobRole: iv.job_roles?.title ?? "the role",
      roleContext: iv.role_context ?? "",
      durationMinutes: iv.duration_minutes,
      elapsedMinutes: elapsed,
      currentSection: iv.current_section,
      state,
      profile: profileText(iv.candidates),
    });
    const convo = msgs.map((m) => ({
      role: (m.sender_type === "ai" ? "assistant" : "user") as "assistant" | "user",
      content: m.message,
    }));
    if (convo.length === 0) convo.push({ role: "user", content: "[The candidate has joined the interview. Please begin.]" });

    const { callAIJson, AIError } = await import("./ai.server");
    const model = await getModel(sb);
    let turn: z.infer<typeof TurnSchema> | null = null;
    let flagged: string | null = null;
    try {
      for (let attempt = 0; attempt < 3 && !turn; attempt++) {
        const extra = flagged
          ? `\n\nGUARDRAIL: your previous draft touched a prohibited topic (${flagged}). Ask a different, strictly job-related question.`
          : "";
        let raw: unknown;
        try {
          raw = await callAIJson([{ role: "system", content: system + extra }, ...convo], model);
        } catch (e) {
          if (e instanceof AIError && e.message === "invalid_json") continue;
          throw e;
        }
        const parsed = TurnSchema.safeParse(raw);
        if (!parsed.success) continue;
        const hit = findProhibitedTopic(parsed.data.message);
        if (hit) {
          flagged = hit;
          await audit(sb, context.userId, "guardrail.blocked_question", "interview", iv.id, { topic: hit });
          continue;
        }
        turn = parsed.data;
      }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof AIError ? e.message : "The AI interviewer is temporarily unavailable. Your answers are saved — please retry.",
      };
    }
    if (!turn) {
      if (flagged) {
        turn = {
          message: fallbackQuestion(iv.current_section, iv.experience_category),
          section: iv.current_section,
          topics_covered: [],
          unresolved_followups: state.unresolved_followups,
          interview_complete: false,
        };
      } else {
        return { ok: false as const, error: "The AI returned an unreadable response. Your answers are saved — please retry." };
      }
    }

    const t = turn as z.infer<typeof TurnSchema>;
    const section: string = SECTIONS.some((s) => s.key === t.section) ? t.section : iv.current_section;
    const seq = (msgs.at(-1)?.sequence_number ?? 0) + 1;
    const { error: insErr } = await sb.from("interview_messages").insert({
      interview_id: iv.id,
      sender_type: "ai",
      message: t.message,
      sequence_number: seq,
      section,
    });
    if (insErr && insErr.code !== "23505")
      return { ok: false as const, error: "Could not save the interviewer's message. Please retry." };

    const newState: InterviewState = {
      topics_covered: Array.from(new Set([...state.topics_covered, ...t.topics_covered])).slice(0, 60),
      unresolved_followups: t.unresolved_followups.slice(0, 20),
      questions_asked: state.questions_asked + 1,
    };
    await sb
      .from("interviews")
      .update({ current_section: section, state: { ...newState, ai_marked_complete: t.interview_complete } })
      .eq("id", iv.id);
    return { ok: true as const, generated: true, complete: t.interview_complete };
  });

/* ---------------- end + evaluate ---------------- */
const CompSchema = z.object({
  key: z.string(),
  name: z.string(),
  score: z.number().min(1).max(5).nullable(),
  assessed: z.boolean(),
  evidence: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  missing_information: z.array(z.string()).default([]),
});
const EvalSchema = z.object({
  summary: z.string().min(1),
  overall_assessment: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  project_assessment: z.string().default(""),
  communication_assessment: z.string().default(""),
  motivation_assessment: z.string().default(""),
  notice_period: z.string().nullable().default(null),
  availability: z.string().nullable().default(null),
  expected_salary_amount: z.number().nullable().default(null),
  expected_salary_text: z.string().nullable().default(null),
  competencies: z.array(CompSchema).min(1),
  red_flags: z
    .array(z.object({ flag: z.string(), evidence: z.string(), severity: z.enum(["low", "medium", "high"]).default("medium") }))
    .default([]),
  missing_information: z.array(z.string()).default([]),
  suggested_follow_up_questions: z.array(z.string()).default([]),
  recommendation: z.enum(["recommend_final", "hold_review", "not_recommended"]),
  recommendation_rationale: z.string().default(""),
  ai_notes: z.string().default(""),
});

export const endAndEvaluate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ interviewId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: iv } = await sb
      .from("interviews")
      .select("*, candidates(*), job_roles(title)")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv) return { ok: false as const, error: "Interview not found." };
    if (iv.status === "evaluated") return { ok: true as const };

    if (iv.status === "in_progress") {
      await sb.from("interviews").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", iv.id);
      await sb.from("candidates").update({ status: "evaluation_pending" }).eq("id", iv.candidate_id);
      await audit(sb, context.userId, "interview.completed", "interview", iv.id);
    }

    const { data: msgs } = await sb
      .from("interview_messages")
      .select("sender_type, message")
      .eq("interview_id", iv.id)
      .order("sequence_number");
    const transcript = (msgs ?? [])
      .map((m: { sender_type: string; message: string }) => `${m.sender_type === "ai" ? "INTERVIEWER" : "CANDIDATE"}: ${m.message}`)
      .join("\n\n");

    const jobRoleId = iv.job_role_id ?? iv.candidates?.job_role_id ?? null;
    const band = await activeBand(sb, jobRoleId);

    const { callAIJson, AIError } = await import("./ai.server");
    const model = await getModel(sb);
    let ev: z.infer<typeof EvalSchema> | null = null;
    let failure = "";
    try {
      for (let attempt = 0; attempt < 2 && !ev; attempt++) {
        let raw: unknown;
        try {
          raw = await callAIJson(
            [
              {
                role: "system",
                content: buildEvaluationPrompt({
                  category: iv.experience_category,
                  jobRole: iv.job_roles?.title ?? "the role",
                  roleContext: iv.role_context ?? "",
                  profile: profileText(iv.candidates),
                }),
              },
              { role: "user", content: `TRANSCRIPT:\n\n${transcript || "(no messages)"}` },
            ],
            model,
          );
        } catch (e) {
          if (e instanceof AIError && e.message === "invalid_json") continue;
          throw e;
        }
        const parsed = EvalSchema.safeParse(raw);
        if (parsed.success) ev = parsed.data;
        else failure = "The AI evaluation did not match the required format.";
      }
    } catch (e) {
      failure = e instanceof AIError ? e.message : "The AI evaluation service failed.";
    }

    const expected =
      iv.candidates?.expected_compensation != null ? Number(iv.candidates.expected_compensation) : (ev?.expected_salary_amount ?? null);
    const alignment = computeSalaryAlignment(expected, band);
    const salaryBase = {
      expected_salary: expected,
      salary_currency: band?.currency ?? "INR",
      band_min: band?.minimum_salary ?? null,
      band_max: band?.maximum_salary ?? null,
      salary_alignment: alignment,
    };

    if (!ev) {
      await sb.from("interviews").update({ status: "evaluation_failed" }).eq("id", iv.id);
      await sb.from("scorecards").upsert(
        {
          candidate_id: iv.candidate_id,
          interview_id: iv.id,
          ...salaryBase,
          final_recommendation: "hold_review",
          review_required: true,
          review_reasons: ["AI evaluation failure"],
          reviewer_status: "pending",
        },
        { onConflict: "interview_id" },
      );
      await sb.from("candidates").update({ status: "human_review" }).eq("id", iv.candidate_id);
      await audit(sb, context.userId, "evaluation.failed", "interview", iv.id);
      return { ok: false as const, error: failure || "Evaluation failed. The transcript is safe — you can retry." };
    }

    // normalise: no invented scores, no evidence-less red flags
    const competencies = ev.competencies.map((c) => ({
      ...c,
      score: c.assessed && c.score != null ? Math.round(c.score) : null,
      assessed: c.assessed && c.score != null,
    }));
    const redFlags = ev.red_flags.filter((r) => r.evidence.trim().length > 0);
    const notAssessed = competencies.filter((c) => !c.assessed).length;

    const reasons: string[] = [];
    if (salaryNeedsHumanReview(alignment)) {
      reasons.push(
        alignment === "above_band"
          ? "Salary expectation above approved band"
          : alignment === "below_band"
            ? "Salary expectation below approved band"
            : alignment === "band_not_configured"
              ? "No approved salary band configured"
              : "Expected salary not captured",
      );
    }
    if (redFlags.length) reasons.push(`${redFlags.length} red flag(s) identified`);
    if (notAssessed >= 3) reasons.push("Insufficient evidence for several competencies");
    if (iv.candidates?.notice_period_days == null && !ev.notice_period) reasons.push("Missing critical information: notice period");
    if (ev.recommendation === "not_recommended") reasons.push("AI advises not recommended — human confirmation required");
    const reviewRequired = reasons.length > 0;

    const { error: evErr } = await sb.from("interview_evaluations").upsert(
      {
        interview_id: iv.id,
        candidate_id: iv.candidate_id,
        competency_scores: competencies,
        strengths: ev.strengths,
        weaknesses: ev.concerns,
        summary: ev.summary,
        red_flags: redFlags,
        missing_information: ev.missing_information,
        recommendation: ev.recommendation,
        model,
        details: {
          overall_assessment: ev.overall_assessment,
          project_assessment: ev.project_assessment,
          communication_assessment: ev.communication_assessment,
          motivation_assessment: ev.motivation_assessment,
          notice_period: ev.notice_period,
          availability: ev.availability,
          expected_salary_text: ev.expected_salary_text,
          suggested_follow_up_questions: ev.suggested_follow_up_questions,
          recommendation_rationale: ev.recommendation_rationale,
        },
      },
      { onConflict: "interview_id" },
    );
    if (evErr) return { ok: false as const, error: "Could not save the evaluation. Please retry." };

    const { data: existingSc } = await sb.from("scorecards").select("id, ai_notes").eq("interview_id", iv.id).maybeSingle();
    const { error: scErr } = await sb.from("scorecards").upsert(
      {
        candidate_id: iv.candidate_id,
        interview_id: iv.id,
        ...salaryBase,
        final_recommendation: ev.recommendation,
        review_required: reviewRequired,
        review_reasons: reasons,
        reviewer_status: reviewRequired ? "pending" : "not_required",
        ai_notes: existingSc?.ai_notes || ev.ai_notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id" },
    );
    if (scErr) return { ok: false as const, error: "Could not save the scorecard. Please retry." };

    await sb.from("interviews").update({ status: "evaluated" }).eq("id", iv.id);
    await sb
      .from("candidates")
      .update({ status: reviewRequired ? "human_review" : ev.recommendation === "recommend_final" ? "recommended" : "on_hold" })
      .eq("id", iv.candidate_id);
    await audit(sb, context.userId, "evaluation.saved", "interview", iv.id, { reviewRequired, alignment });
    return { ok: true as const };
  });

/* ---------------- salary validation ---------------- */
export const validateSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobRoleId: z.string().uuid(), expected: z.number().nonnegative().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const band = await activeBand(context.supabase as SB, data.jobRoleId);
    const alignment = computeSalaryAlignment(data.expected, band);
    return {
      alignment,
      requiresHumanReview: salaryNeedsHumanReview(alignment),
      band: band ? { min: Number(band.minimum_salary), max: Number(band.maximum_salary), currency: band.currency as string } : null,
    };
  });

/* ---------------- human review ---------------- */
const ACTIONS = {
  approve: "approved",
  reject: "rejected",
  request_info: "info_requested",
  return: "returned",
} as const;

export const recordReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scorecardId: z.string().uuid(),
        action: z.enum(["approve", "reject", "request_info", "return"]),
        comments: z.string().max(4000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", context.userId);
    const r = (roles ?? []).map((x: { role: string }) => x.role);
    if (!r.includes("reviewer") && !r.includes("admin")) throw new Error("Only reviewers or admins can record review decisions.");
    const { data: sc } = await sb.from("scorecards").select("*").eq("id", data.scorecardId).maybeSingle();
    if (!sc) throw new Error("Scorecard not found.");
    const newStatus = ACTIONS[data.action];
    await sb.from("scorecards").update({ reviewer_status: newStatus, updated_at: new Date().toISOString() }).eq("id", sc.id);
    await sb.from("review_actions").insert({
      scorecard_id: sc.id,
      reviewer_id: context.userId,
      action: data.action,
      previous_status: sc.reviewer_status,
      new_status: newStatus,
      comments: data.comments || null,
    });
    if (data.comments)
      await sb.from("reviewer_notes").insert({
        candidate_id: sc.candidate_id,
        interview_id: sc.interview_id,
        reviewer_id: context.userId,
        note_type: "reviewer",
        note: data.comments,
      });
    const candStatus =
      data.action === "approve"
        ? sc.final_recommendation === "recommend_final"
          ? "recommended"
          : sc.final_recommendation === "not_recommended"
            ? "not_recommended"
            : "on_hold"
        : data.action === "return"
          ? "human_review"
          : "on_hold";
    await sb.from("candidates").update({ status: candStatus }).eq("id", sc.candidate_id);
    await audit(sb, context.userId, `review.${data.action}`, "scorecard", sc.id, { from: sc.reviewer_status, to: newStatus });
    return { ok: true };
  });
