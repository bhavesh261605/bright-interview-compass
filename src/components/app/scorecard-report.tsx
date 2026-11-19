import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCircle2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EXPERIENCE, RECOMMENDATION, REVIEW_STATUS, SALARY_ALIGNMENT, formatDate, formatMoney } from "@/lib/labels";
import { Field, Pill, Section, StatusPill } from "./ui-bits";
import { NotesPanel } from "./notes-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Comp = { key: string; name: string; score: number | null; assessed: boolean; evidence: string[]; strengths: string[]; weaknesses: string[]; missing_information: string[] };
type Flag = { flag: string; evidence: string; severity: string };

const VERIFY_ITEMS = [
  { key: "notice_period", label: "Notice period" },
  { key: "availability", label: "Availability" },
  { key: "expected_salary", label: "Expected salary" },
  { key: "experience", label: "Experience claims" },
];

export function useReportData(interviewId: string) {
  return useQuery({
    queryKey: ["report", interviewId],
    queryFn: async () => {
      const [iv, msgs, ev, sc] = await Promise.all([
        supabase.from("interviews").select("*, candidates(*), job_roles(title)").eq("id", interviewId).maybeSingle(),
        supabase.from("interview_messages").select("*").eq("interview_id", interviewId).order("sequence_number"),
        supabase.from("interview_evaluations").select("*").eq("interview_id", interviewId).maybeSingle(),
        supabase.from("scorecards").select("*").eq("interview_id", interviewId).maybeSingle(),
      ]);
      const actions = sc.data
        ? (await supabase.from("review_actions").select("*").eq("scorecard_id", sc.data.id).order("created_at", { ascending: false })).data ?? []
        : [];
      return { iv: iv.data, msgs: msgs.data ?? [], ev: ev.data, sc: sc.data, actions };
    },
  });
}

export function ScorecardReport({ interviewId }: { interviewId: string }) {
  const qc = useQueryClient();
  const q = useReportData(interviewId);
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(q.data?.sc?.ai_notes ?? ""); }, [q.data?.sc?.ai_notes]);
  if (!q.data?.iv) return null;
  const { iv, msgs, ev, sc, actions } = q.data;
  const cand = iv.candidates as Record<string, unknown> & { id: string; full_name: string; email: string; experience_level: string; years_of_experience: number; skills: string[] | null; current_company: string | null; notice_period_days: number | null; availability: string | null };
  const comps = (ev?.competency_scores ?? []) as Comp[];
  const flags = (ev?.red_flags ?? []) as Flag[];
  const details = (ev?.details ?? {}) as {
    overall_assessment?: string; project_assessment?: string; communication_assessment?: string; motivation_assessment?: string;
    notice_period?: string | null; availability?: string | null; expected_salary_text?: string | null;
    suggested_follow_up_questions?: string[]; recommendation_rationale?: string;
  };
  const verified = (sc?.verified_items ?? {}) as Record<string, boolean>;

  const saveNotes = async () => {
    if (!sc) return;
    const { error } = await supabase.from("scorecards").update({ ai_notes: notes, updated_at: new Date().toISOString() }).eq("id", sc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("HR notes saved");
    qc.invalidateQueries({ queryKey: ["report", interviewId] });
  };
  const toggleVerify = async (k: string, v: boolean) => {
    if (!sc) return;
    await supabase.from("scorecards").update({ verified_items: { ...verified, [k]: v } }).eq("id", sc.id);
    await supabase.from("audit_logs").insert({ action: "scorecard.verified_item", entity_type: "scorecard", entity_id: sc.id, metadata: { item: k, verified: v } });
    qc.invalidateQueries({ queryKey: ["report", interviewId] });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* LEFT */}
      <div className="space-y-4">
        <Section title="Candidate">
          <dl className="grid gap-3">
            <Field label="Name" value={cand.full_name} />
            <Field label="Email" value={cand.email} />
            <Field label="Experience" value={`${EXPERIENCE[cand.experience_level]}${cand.experience_level === "experienced" ? ` · ${cand.years_of_experience} yrs` : ""}`} />
            <Field label="Current company" value={cand.current_company} />
            <Field label="Skills (claimed, unverified)" value={cand.skills?.join(", ") || "—"} />
          </dl>
        </Section>
        <Section title="Interview details">
          <dl className="grid gap-3">
            <Field label="Role" value={(iv.job_roles as { title: string } | null)?.title ?? "—"} />
            <Field label="Type" value={`${iv.interview_type} · ${iv.duration_minutes} min`} />
            <Field label="Date" value={formatDate(iv.started_at)} />
            <Field label="Messages" value={msgs.length} />
          </dl>
        </Section>
        {sc && (
          <Section title="Verified information" className="no-print">
            <div className="space-y-2">
              {VERIFY_ITEMS.map((v) => (
                <label key={v.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!verified[v.key]} onCheckedChange={(c) => toggleVerify(v.key, !!c)} />
                  {v.label}
                  {verified[v.key] && <Pill tone="success"><CheckCircle2 className="h-3 w-3" />Verified</Pill>}
                </label>
              ))}
            </div>
          </Section>
        )}
        <Section title="Private notes" className="no-print"><NotesPanel candidateId={cand.id} interviewId={iv.id} /></Section>
      </div>

      {/* RIGHT */}
      <div className="space-y-4">
        {sc && (
          <div className="surface grid gap-4 p-4 sm:grid-cols-3">
            <Field label="AI recommendation (advisory)" value={<StatusPill map={RECOMMENDATION} value={sc.final_recommendation} />} />
            <Field
              label="Salary alignment"
              value={
                <span className="flex flex-col gap-1">
                  <StatusPill map={SALARY_ALIGNMENT} value={sc.salary_alignment} />
                  <span className="text-xs text-muted-foreground">
                    Expected {formatMoney(sc.expected_salary, sc.salary_currency ?? "INR")}
                    {sc.band_min != null && ` · Band ${formatMoney(sc.band_min, sc.salary_currency ?? "INR")}–${formatMoney(sc.band_max, sc.salary_currency ?? "INR")}`}
                  </span>
                </span>
              }
            />
            <Field label="Human review" value={<StatusPill map={REVIEW_STATUS} value={sc.reviewer_status} />} />
            {sc.review_reasons.length > 0 && (
              <div className="sm:col-span-3">
                <div className="eyebrow mb-1">Why it needs a human</div>
                <div className="flex flex-wrap gap-1.5">{sc.review_reasons.map((r) => <Pill key={r} tone="warning">{r}</Pill>)}</div>
              </div>
            )}
          </div>
        )}

        {ev && (
          <>
            <Section title="AI summary" actions={<Pill tone="primary"><Bot className="h-3 w-3" />AI-generated observation</Pill>}>
              <p className="text-sm leading-relaxed">{ev.summary}</p>
              {details.overall_assessment ? <p className="mt-2 text-sm text-muted-foreground">{String(details.overall_assessment)}</p> : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <List title="Strengths" items={ev.strengths as string[]} />
                <List title="Areas of concern" items={ev.weaknesses as string[]} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Project / experience" value={String(details.project_assessment ?? "—")} />
                <Field label="Communication" value={String(details.communication_assessment ?? "—")} />
                <Field label="Motivation" value={String(details.motivation_assessment ?? "—")} />
                <Field label="Notice period (stated)" value={String(details.notice_period ?? (cand.notice_period_days != null ? `${cand.notice_period_days} days (recorded)` : "—"))} />
                <Field label="Availability (stated)" value={String(details.availability ?? cand.availability ?? "—")} />
                <Field label="Expected salary (stated)" value={String(details.expected_salary_text ?? "—")} />
              </div>
            </Section>

            <Section title="Competency scores">
              <div className="space-y-3">
                {comps.map((c) => (
                  <div key={c.key} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.assessed && c.score != null ? (
                        <span className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => <span key={n} className={cn("h-2 w-5 rounded-sm", n <= c.score! ? "bg-primary" : "bg-muted")} />)}
                          <span className="ml-1 text-sm font-semibold tabular">{c.score}/5</span>
                        </span>
                      ) : <Pill>Not assessed</Pill>}
                    </div>
                    {c.evidence?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {c.evidence.map((e, i) => (
                          <blockquote key={i} className="border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground"><User className="mr-1 inline h-3 w-3" />“{e}”</blockquote>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                      {c.strengths?.length > 0 && <div><span className="font-medium text-success">+ </span>{c.strengths.join("; ")}</div>}
                      {c.weaknesses?.length > 0 && <div><span className="font-medium text-destructive">− </span>{c.weaknesses.join("; ")}</div>}
                      {c.missing_information?.length > 0 && <div className="text-muted-foreground">Missing: {c.missing_information.join("; ")}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">1 poor · 2 limited · 3 adequate · 4 strong · 5 excellent evidence. Scores are advisory; no hiring threshold is applied.</p>
            </Section>

            <Section title={`Red flags (${flags.length})`}>
              {flags.length === 0 ? <p className="text-sm text-muted-foreground">No evidence-backed red flags.</p> : (
                <ul className="space-y-2">
                  {flags.map((f, i) => (
                    <li key={i} className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />{f.flag}<Pill tone={f.severity === "high" ? "danger" : "warning"}>{f.severity}</Pill></div>
                      <blockquote className="mt-1 border-l-2 border-destructive/40 pl-2 text-xs italic text-muted-foreground">“{f.evidence}”</blockquote>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Section title="Missing information"><List items={ev.missing_information as string[]} /></Section>
              <Section title="Suggested follow-up questions"><List items={(details.suggested_follow_up_questions as string[]) ?? []} /></Section>
            </div>
            {details.recommendation_rationale ? (
              <Section title="Recommendation rationale"><p className="text-sm">{String(details.recommendation_rationale)}</p></Section>
            ) : null}
          </>
        )}

        {sc && (
          <Section title="Structured HR notes" actions={<Pill tone="primary"><Bot className="h-3 w-3" />AI draft · editable</Pill>}>
            <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} className="no-print" />
            <p className="hidden whitespace-pre-wrap text-sm print:block">{notes}</p>
            <div className="no-print mt-2 flex justify-end"><Button size="sm" variant="outline" onClick={saveNotes}>Save notes</Button></div>
          </Section>
        )}

        {actions.length > 0 && (
          <Section title="Human reviewer decisions">
            <ul className="space-y-2 text-sm">
              {actions.map((a) => (
                <li key={a.id} className="rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <StatusPill map={REVIEW_STATUS} value={a.new_status} />
                    <span className="text-xs text-muted-foreground">from {REVIEW_STATUS[a.previous_status ?? ""]?.label ?? a.previous_status} · {new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  {a.comments && <p className="mt-1">{a.comments}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Approving a recommendation is not an approved salary offer.</p>
          </Section>
        )}

        <Section title="Transcript" actions={<Pill><User className="h-3 w-3" />Candidate statements</Pill>}>
          <div className="max-h-[480px] space-y-3 overflow-y-auto print:max-h-none">
            {msgs.map((m) => (
              <div key={m.id} className="text-sm">
                <span className={cn("eyebrow mr-2", m.sender_type === "ai" ? "text-primary" : "")}>{m.sender_type === "ai" ? "Interviewer" : "Candidate"}</span>
                <span className="whitespace-pre-wrap">{m.message}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function List({ title, items }: { title?: string; items: string[] }) {
  return (
    <div>
      {title && <div className="eyebrow mb-1">{title}</div>}
      {items?.length ? <ul className="list-disc space-y-1 pl-4 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-muted-foreground">None</p>}
    </div>
  );
}
