import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildEvaluationPrompt,
  buildSystemPrompt,
  fallbackQuestion,
  getTurnPolicy,
  isOrderedTurn,
  SECTIONS,
  type InterviewState,
} from "./interview-prompts";
import { findProhibitedTopic } from "./guardrails";
import { normaliseCompetencies, quoteInTranscript } from "./evaluation";
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

async function audit(sb: SB, userId: string | null, action: string, type: string, id: string | null, metadata = {}) {
  await sb.from("audit_logs").insert({ actor_id: userId, action, entity_type: type, entity_id: id, metadata });
}

/** Privileged writer for AI/workflow rows. Only call after the caller's access was verified with their own client. */
async function writer(): Promise<SB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SB;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function turnHandler({ data, context }: { data: { interviewId: string; text?: string | undefined; clientMessageId?: string | undefined }; context: { supabase: any; userId: string | null } }) {
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
        section: string;
      }[];
    let msgs = await loadMsgs();

    const w = await writer();
    if (data.text) {
      let saved = !!data.clientMessageId && msgs.some((m) => m.client_message_id === data.clientMessageId);
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const seq = (msgs.at(-1)?.sequence_number ?? 0) + 1;
        const { error } = await w.from("interview_messages").insert({
          interview_id: iv.id,
          sender_type: "candidate",
          message: data.text,
          sequence_number: seq,
          client_message_id: data.clientMessageId ?? null,
          section: iv.current_section,
        });
        msgs = await loadMsgs();
        if (!error) saved = true;
        else if (error.code === "23505") {
          // Either this exact answer was already saved (retry) or another message took the sequence slot.
          saved = !!data.clientMessageId && msgs.some((m) => m.client_message_id === data.clientMessageId);
        } else return { ok: false as const, error: "Your answer could not be saved. Please try again." };
      }
      if (!saved) return { ok: false as const, error: "Your answer could not be saved. Please try again." };
    }

    const last = msgs.at(-1);
    if (last && last.sender_type === "ai") return { ok: true as const, generated: false, complete: false };

    const state: InterviewState = {
      topics_covered: iv.state?.topics_covered ?? [],
      unresolved_followups: iv.state?.unresolved_followups ?? [],
      questions_asked: iv.state?.questions_asked ?? 0,
    };
    const elapsed = Math.round((Date.now() - new Date(iv.started_at).getTime()) / 60000);
    const answersInSection = msgs.filter((m) => m.sender_type === "candidate" && m.section === iv.current_section).length;
    const turnPolicy = getTurnPolicy(iv.current_section, answersInSection);
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
      turnPolicy,
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
        if (!isOrderedTurn(turnPolicy, parsed.data)) continue;
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
          message: fallbackQuestion(turnPolicy.allowedSections[0] ?? iv.current_section, iv.experience_category),
          section: turnPolicy.allowedSections[0] ?? iv.current_section,
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
    const { error: insErr } = await w.from("interview_messages").insert({
      interview_id: iv.id,
      sender_type: "ai",
      message: t.message,
      sequence_number: seq,
      section,
    });
    if (insErr?.code === "23505") return { ok: true as const, generated: false, complete: false }; // another request answered first
    if (insErr) return { ok: false as const, error: "Could not save the interviewer's message. Please retry." };

    const newState: InterviewState = {
      topics_covered: Array.from(new Set([...state.topics_covered, ...t.topics_covered])).slice(0, 60),
      unresolved_followups: t.unresolved_followups.slice(0, 20),
      questions_asked: state.questions_asked + 1,
    };
    const { error: stErr } = await w
      .from("interviews")
      .update({ current_section: section, state: { ...newState, ai_marked_complete: t.interview_complete } })
      .eq("id", iv.id);
    if (stErr) return { ok: false as const, error: "Could not update the interview progress. Please retry." };
    return { ok: true as const, generated: true, complete: t.interview_complete };
}

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
  .handler(({ data, context }) => turnHandler({ data, context }));

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
  expected_salary_currency: z.string().nullable().default(null),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evaluateHandler({ data, context }: { data: { interviewId: string }; context: { supabase: any; userId: string | null } }) {
    const sb = context.supabase as SB;
    const { data: iv } = await sb
      .from("interviews")
      .select("*, candidates(*), job_roles(title)")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv) return { ok: false as const, error: "Interview not found." };
    if (iv.status === "evaluated") return { ok: true as const };
    const w = await writer();

    if (iv.status === "in_progress") {
      const { error: cErr } = await w.from("interviews").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", iv.id).eq("status", "in_progress");
      if (cErr) return { ok: false as const, error: "Could not close the interview. Please retry." };
      await w.from("candidates").update({ status: "evaluation_pending" }).eq("id", iv.candidate_id);
      await audit(w, context.userId, "interview.completed", "interview", iv.id);
    }

    const { data: msgs } = await sb
      .from("interview_messages")
      .select("sender_type, message, sequence_number")
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

    // Salary precedence: the candidate's own statement in the interview wins over a pre-entered value;
    // a disagreement between the two, or a currency other than the band's, goes to a human.
    const recorded = iv.candidates?.expected_compensation != null ? Number(iv.candidates.expected_compensation) : null;
    const stated = ev?.expected_salary_amount ?? null;
    const expected = stated ?? recorded;
    const statedCurrency = (ev?.expected_salary_currency ?? "").trim().toUpperCase() || null;
    const bandCurrency = (band?.currency as string | undefined) ?? "INR";
    const currencyMismatch = !!statedCurrency && stated != null && statedCurrency !== bandCurrency.toUpperCase();
    const salaryConflict = stated != null && recorded != null && Math.abs(stated - recorded) > 0.5;
    const alignment = currencyMismatch ? "pending_review" : computeSalaryAlignment(expected, band);
    const salaryBase = {
      expected_salary: expected,
      salary_currency: currencyMismatch ? statedCurrency : bandCurrency,
      band_min: band?.minimum_salary ?? null,
      band_max: band?.maximum_salary ?? null,
      salary_alignment: alignment,
    };

    const { data: existingSc } = await w.from("scorecards").select("id, ai_notes, reviewer_status, review_reasons").eq("interview_id", iv.id).maybeSingle();

    if (!ev) {
      await w.from("interviews").update({ status: "evaluation_failed" }).eq("id", iv.id);
      await w.from("scorecards").upsert(
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
      await w.from("candidates").update({ status: "human_review" }).eq("id", iv.candidate_id);
      await audit(w, context.userId, "evaluation.failed", "interview", iv.id);
      return { ok: false as const, error: failure || "Evaluation failed. The transcript is safe — you can retry." };
    }

    // normalise: full competency set, no invented or evidence-less scores, red flags tied to the transcript
    const competencies = normaliseCompetencies(ev.competencies);
    const candidateText = (msgs ?? [])
      .filter((m: { sender_type: string }) => m.sender_type === "candidate")
      .map((m: { message: string }) => m.message)
      .join("\n");
    const redFlags = ev.red_flags
      .filter((r) => r.evidence.trim().length > 0)
      .map((r) => ({ ...r, verified: quoteInTranscript(r.evidence, candidateText) }));
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
    if (currencyMismatch) reasons.push(`Salary stated in ${statedCurrency}, band is in ${bandCurrency} — confirm with candidate`);
    if (salaryConflict) reasons.push("Interview salary differs from the recruiter-entered expectation");
    if (redFlags.length) reasons.push(`${redFlags.length} red flag(s) identified`);
    if (redFlags.some((r) => !r.verified)) reasons.push("Red flag evidence could not be matched to the transcript");
    if (notAssessed >= 3) reasons.push("Insufficient evidence for several competencies");
    if (iv.candidates?.notice_period_days == null && !ev.notice_period) reasons.push("Missing critical information: notice period");
    if (ev.recommendation === "not_recommended") reasons.push("AI advises not recommended — human confirmation required");
    if (ev.recommendation === "hold_review") reasons.push("AI recommends hold — human decision required");
    const reviewRequired = reasons.length > 0;

    const { error: evErr } = await w.from("interview_evaluations").upsert(
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
          expected_salary_currency: ev.expected_salary_currency,
          suggested_follow_up_questions: ev.suggested_follow_up_questions,
          recommendation_rationale: ev.recommendation_rationale,
        },
      },
      { onConflict: "interview_id" },
    );
    if (evErr) return { ok: false as const, error: "Could not save the evaluation. Please retry." };

    // Keep a human decision already recorded on a real (non-failure) scorecard.
    const wasFailure = (existingSc?.review_reasons ?? []).includes("AI evaluation failure");
    const keepDecision = !!existingSc && !wasFailure && !["pending", "not_required"].includes(existingSc.reviewer_status);
    const { error: scErr } = await w.from("scorecards").upsert(
      {
        candidate_id: iv.candidate_id,
        interview_id: iv.id,
        ...salaryBase,
        final_recommendation: ev.recommendation,
        review_required: reviewRequired,
        review_reasons: reasons,
        reviewer_status: keepDecision ? existingSc!.reviewer_status : reviewRequired ? "pending" : "not_required",
        ai_notes: existingSc?.ai_notes || ev.ai_notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id" },
    );
    if (scErr) return { ok: false as const, error: "Could not save the scorecard. Please retry." };

    await w.from("interviews").update({ status: "evaluated" }).eq("id", iv.id);
    await w
      .from("candidates")
      .update({ status: reviewRequired ? "human_review" : ev.recommendation === "recommend_final" ? "recommended" : "on_hold" })
      .eq("id", iv.candidate_id);
    await audit(w, context.userId, "evaluation.saved", "interview", iv.id, { reviewRequired, alignment });
    return { ok: true as const };
}

export const endAndEvaluate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ interviewId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => evaluateHandler({ data, context }));

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
    const w = await writer();
    const { error: uErr } = await w.from("scorecards").update({ reviewer_status: newStatus, updated_at: new Date().toISOString() }).eq("id", sc.id);
    if (uErr) throw new Error("Could not save the review decision. Please retry.");
    const { error: aErr } = await w.from("review_actions").insert({
      scorecard_id: sc.id,
      reviewer_id: context.userId,
      action: data.action,
      previous_status: sc.reviewer_status,
      new_status: newStatus,
      comments: data.comments || null,
    });
    if (aErr) throw new Error("Decision saved, but its history entry failed. Please retry.");
    if (data.comments) {
      const { error: nErr } = await w.from("reviewer_notes").insert({
        candidate_id: sc.candidate_id,
        interview_id: sc.interview_id,
        reviewer_id: context.userId,
        note_type: "reviewer",
        note: data.comments,
      });
      if (nErr) throw new Error("Decision saved, but the comment could not be stored.");
    }
    const candStatus =
      data.action === "approve"
        ? sc.final_recommendation === "recommend_final"
          ? "recommended"
          : sc.final_recommendation === "not_recommended"
            ? "not_recommended"
            : "on_hold"
        : data.action === "reject"
          ? "not_recommended"
          : data.action === "return"
            ? "human_review"
            : "on_hold";
    const { error: cErr } = await w.from("candidates").update({ status: candStatus }).eq("id", sc.candidate_id);
    if (cErr) throw new Error("Decision saved, but the candidate status could not be updated.");
    await audit(w, context.userId, `review.${data.action}`, "scorecard", sc.id, { from: sc.reviewer_status, to: newStatus });
    return { ok: true };
  });

/* ---------------- candidate (token-based, no login) ---------------- */
const TokenSchema = z.object({ token: z.string().uuid() });
async function adminByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("interviews")
    .select("id, status, expires_at, revoked_at")
    .eq("invite_token", token)
    .maybeSingle();
  const usable = data && !data.revoked_at && (!data.expires_at || new Date(data.expires_at).getTime() > Date.now());
  return { admin: supabaseAdmin as SB, iv: usable ? ({ id: data.id, status: data.status } as { id: string; status: string }) : null };
}

/** Candidate-safe view: no notes, salary bands, scores, flags or HR controls. */
export const getCandidateSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin, iv } = await adminByToken(data.token);
    if (!iv) return null;
    const { data: row } = await admin
      .from("interviews")
      .select("id, status, current_section, experience_category, duration_minutes, started_at, state, candidates(full_name), job_roles(title)")
      .eq("id", iv.id)
      .single();
    // After the interview ends the candidate only sees a thank-you screen, not the transcript.
    const { data: msgs } =
      row.status === "in_progress"
        ? await admin.from("interview_messages").select("id, sender_type, message, sequence_number").eq("interview_id", iv.id).order("sequence_number")
        : { data: [] };
    return {
      status: row.status as string,
      section: row.current_section as string,
      category: row.experience_category as "fresher" | "experienced",
      durationMinutes: row.duration_minutes as number,
      startedAt: row.started_at as string,
      aiDone: !!row.state?.ai_marked_complete,
      candidateName: (row.candidates?.full_name as string) ?? "Candidate",
      roleTitle: (row.job_roles?.title as string) ?? "the role",
      messages: (msgs ?? []) as { id: string; sender_type: string; message: string; sequence_number: number }[],
    };
  });

export const candidateTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().uuid(), text: z.string().trim().min(1).max(4000).optional(), clientMessageId: z.string().min(6).max(80).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, iv } = await adminByToken(data.token);
    if (!iv) return { ok: false as const, error: "This interview link is invalid." };
    return turnHandler({ data: { interviewId: iv.id, text: data.text, clientMessageId: data.clientMessageId }, context: { supabase: admin, userId: null } });
  });

export const candidateFinish = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin, iv } = await adminByToken(data.token);
    if (!iv) return { ok: false as const, error: "This interview link is no longer valid." };
    const r = await evaluateHandler({ data: { interviewId: iv.id }, context: { supabase: admin, userId: null } });
    // Never leak evaluation details to the candidate.
    return r.ok ? { ok: true as const } : { ok: false as const, error: "We couldn't submit your interview just now. Your answers are saved — please try again." };
  });

/* ---------------- demo helpers (competition demo; no login wall) ---------------- */
const DEMO_EMAIL = "hr-demo@aria-hr.demo";

/** One-click HR demo sign-in: ensures a demo admin exists and returns a one-time login token. */
async function demoEnabled(a: SB) {
  const { data } = await a.from("app_settings").select("value").eq("key", "demo_enabled").maybeSingle();
  return data?.value !== false;
}

export const getDemoStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  return { enabled: await demoEnabled(a) };
});

export const demoHrSignIn = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  if (!(await demoEnabled(a))) throw new Error("Demo access has been switched off by an admin.");
  const link = async () => a.auth.admin.generateLink({ type: "magiclink", email: DEMO_EMAIL });
  let r = await link();
  if (r.error) {
    await a.auth.admin.createUser({ email: DEMO_EMAIL, email_confirm: true, user_metadata: { full_name: "HR Demo" } });
    r = await link();
  }
  const uid = r.data.user?.id;
  if (!uid || !r.data.properties?.hashed_token) throw new Error("Demo sign-in unavailable");
  await a.from("user_roles").upsert([{ user_id: uid, role: "admin" }, { user_id: uid, role: "recruiter" }, { user_id: uid, role: "reviewer" }], { onConflict: "user_id,role", ignoreDuplicates: true });
  return { tokenHash: r.data.properties.hashed_token };
});

/** Public demo presets: only candidate first names + invite tokens; no HR data. */
export const getDemoPresets = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  if (!(await demoEnabled(a))) return { enabled: false, active: [], exception: null };
  // Only synthetic demo candidates are ever listed publicly — never real invite links.
  const { data: active } = await a
    .from("interviews")
    .select("invite_token, candidates!inner(full_name, is_demo)")
    .eq("status", "in_progress")
    .eq("candidates.is_demo", true)
    .order("started_at", { ascending: false })
    .limit(3);
  const { data: done } = await a
    .from("scorecards")
    .select("id, candidates!inner(full_name, is_demo)")
    .eq("review_required", true)
    .eq("candidates.is_demo", true)
    .order("created_at", { ascending: false })
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = (c: any) => String(c?.full_name ?? "Candidate").split(" ")[0];
  return {
    enabled: true,
    active: (active ?? []).map((r) => ({ token: r.invite_token as string, name: first(r.candidates) })),
    exception: done?.[0] ? { scorecardId: done[0].id as string, name: first(done[0].candidates) } : null,
  };
});

/** Creates a brand-new demo candidate + interview and returns its invite token. */
export const createFreshDemoSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ category: z.enum(["fresher", "experienced"]) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
    if (!(await demoEnabled(a))) throw new Error("Demo access has been switched off by an admin.");
    const { data: role } = await a.from("job_roles").select("id, title").order("created_at").limit(1).maybeSingle();
    const { data: owner } = await a.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
    if (!owner) throw new Error("Sign in as HR Demo once first to set up the demo workspace.");
    const exp = data.category === "fresher";
    const { data: cand, error } = await a.from("candidates").insert({
      full_name: exp ? "Demo Fresher" : "Demo Experienced",
      email: `demo+${Date.now()}@aria-hr.demo`,
      experience_level: data.category,
      years_of_experience: exp ? 0 : 3,
      job_role_id: role?.id ?? null,
      status: "in_progress",
      is_demo: true,
      created_by: owner.user_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).select("id").single();
    if (error || !cand) throw new Error("Could not create demo candidate: " + (error?.message ?? ""));
    const { data: iv, error: e2 } = await a.from("interviews").insert({
      candidate_id: cand.id, job_role_id: role?.id ?? null, experience_category: data.category,
      interview_type: "HR round", duration_minutes: 20, role_context: "", interviewer_id: owner.user_id,
      state: { topics_covered: [], unresolved_followups: [], questions_asked: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).select("invite_token").single();
    if (e2 || !iv) throw new Error("Could not create demo interview: " + (e2?.message ?? ""));
    return { token: (iv as { invite_token: string }).invite_token };
  });

export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { base64: string; mimeType: string }) =>
    z.object({ base64: z.string().min(10).max(14_000_000), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]) }).parse(d))
  .handler(async ({ data }) => {
    const { readResumeWithAI, AIError } = await import("./ai.server");
    try {
      const r = (await readResumeWithAI(data.base64, data.mimeType)) as Partial<Record<"full_name"|"email"|"phone"|"current_company"|"current_location"|"years_of_experience"|"skills"|"summary", unknown>>;
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const yrs = Number(r.years_of_experience);
      return {
        ok: true as const,
        full_name: str(r.full_name), email: str(r.email), phone: str(r.phone),
        current_company: str(r.current_company), current_location: str(r.current_location),
        years_of_experience: Number.isFinite(yrs) ? Math.max(0, Math.min(6, yrs)) : 0,
        skills: Array.isArray(r.skills) ? r.skills.map(str).filter(Boolean).slice(0, 30) : [],
        summary: str(r.summary),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof AIError ? e.message : "Could not read the resume." };
    }
  });

