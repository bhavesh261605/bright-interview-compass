import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CANDIDATE_STATUS, EXPERIENCE, INTERVIEW_STATUS, RECOMMENDATION, SALARY_ALIGNMENT, formatDate, formatMoney } from "@/lib/labels";
import { validateSalary } from "@/lib/interview.functions";
import { Empty, Field, Loading, PageHeader, Section, StatusPill } from "@/components/app/ui-bits";
import { NotesPanel } from "@/components/app/notes-panel";
import { CandidateForm } from "@/components/app/candidate-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/candidates/$candidateId")({
  head: () => ({ meta: [{ title: "Candidate — WAE HR" }, { name: "description", content: "Candidate profile and interview history." }] }),
  component: CandidateDetail,
});

function CandidateDetail() {
  const { candidateId } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const q = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: async () => {
      const [c, i, s] = await Promise.all([
        supabase.from("candidates").select("*, job_roles(title)").eq("id", candidateId).maybeSingle(),
        supabase.from("interviews").select("*").eq("candidate_id", candidateId).order("started_at", { ascending: false }),
        supabase.from("scorecards").select("*").eq("candidate_id", candidateId).order("created_at", { ascending: false }),
      ]);
      return { c: c.data, interviews: i.data ?? [], scorecards: s.data ?? [] };
    },
  });
  const c = q.data?.c;
  const salary = useQuery({
    queryKey: ["salary-check", c?.job_role_id, c?.expected_compensation],
    enabled: !!c?.job_role_id,
    queryFn: () => validateSalary({ data: { jobRoleId: c!.job_role_id!, expected: c!.expected_compensation != null ? Number(c!.expected_compensation) : null } }),
  });

  if (q.isLoading) return <Loading />;
  if (!c) return <Empty title="Candidate not found or you don't have access." />;

  const download = async () => {
    if (!c.resume_path) return;
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(c.resume_path, 60);
    if (error) { toast.error("Could not open resume"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const setStatus = async (v: string) => {
    const { error } = await supabase.from("candidates").update({ status: v }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "candidate.status_changed", entity_type: "candidate", entity_id: c.id, metadata: { from: c.status, to: v } });
    qc.invalidateQueries();
  };
  const active = q.data!.interviews.find((i) => i.status === "in_progress");

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.full_name}
        description={`${(c.job_roles as { title: string } | null)?.title ?? "No role"} · ${EXPERIENCE[c.experience_level]}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
            {active ? (
              <Button asChild><Link to="/interviews/$interviewId" params={{ interviewId: active.id }}><PlayCircle className="mr-1 h-4 w-4" />Resume interview</Link></Button>
            ) : (
              <Button asChild><Link to="/interviews/new" search={{ candidateId: c.id }}><PlayCircle className="mr-1 h-4 w-4" />Start interview</Link></Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Profile overview">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Email" value={c.email} />
              <Field label="Phone" value={c.phone} />
              <Field label="Years of experience" value={c.experience_level === "fresher" ? "Fresher" : c.years_of_experience} />
              <Field label="Current company" value={c.current_company} />
              <Field label="Location" value={c.current_location} />
              <Field label="Skills (claimed)" value={c.skills?.length ? c.skills.join(", ") : "—"} />
            </dl>
          </Section>
          <Section title="HR information">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Notice period" value={c.notice_period_days != null ? `${c.notice_period_days} days` : "—"} />
              <Field label="Earliest joining" value={formatDate(c.earliest_joining_date)} />
              <Field label="Availability" value={c.availability} />
              <Field label="Current compensation" value={formatMoney(c.current_compensation)} />
              <Field label="Expected compensation" value={formatMoney(c.expected_compensation, salary.data?.band?.currency)} />
              <Field
                label="Salary alignment"
                value={
                  <span className="flex flex-col gap-1">
                    <StatusPill map={SALARY_ALIGNMENT} value={c.job_role_id ? salary.data?.alignment : "band_not_configured"} />
                    {salary.data?.band && <span className="text-xs text-muted-foreground">Band {formatMoney(salary.data.band.min, salary.data.band.currency)} – {formatMoney(salary.data.band.max, salary.data.band.currency)}</span>}
                  </span>
                }
              />
            </dl>
          </Section>
          <Section title="Interview history">
            {q.data!.interviews.length === 0 ? <Empty title="No interviews yet" /> : (
              <ul className="divide-y">
                {q.data!.interviews.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                    <Link
                      to={i.status === "in_progress" ? "/interviews/$interviewId" : "/interview-summary/$interviewId"}
                      params={{ interviewId: i.id }}
                      className="font-medium hover:text-primary"
                    >
                      {i.interview_type} · {formatDate(i.started_at)}
                    </Link>
                    <StatusPill map={INTERVIEW_STATUS} value={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Scorecards">
            {q.data!.scorecards.length === 0 ? <Empty title="No scorecards yet" /> : (
              <ul className="divide-y">
                {q.data!.scorecards.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to="/scorecards/$scorecardId" params={{ scorecardId: s.id }} className="font-medium hover:text-primary">{formatDate(s.created_at)}</Link>
                    <StatusPill map={RECOMMENDATION} value={s.final_recommendation} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Application status">
            <Select value={c.status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CANDIDATE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </Section>
          <Section title="Resume">
            {c.resume_path ? (
              <Button variant="outline" className="w-full" onClick={download}><Download className="mr-1 h-4 w-4" />Open resume (private link)</Button>
            ) : <p className="text-sm text-muted-foreground">No resume uploaded.</p>}
            <p className="mt-2 text-xs text-muted-foreground">Automatic resume parsing isn't enabled; profile details are entered by the recruiter.</p>
          </Section>
          <Section title="Profile notes">
            <p className="whitespace-pre-wrap text-sm">{c.recruiter_notes || <span className="text-muted-foreground">None</span>}</p>
          </Section>
          <Section title="Recruiter & reviewer notes"><NotesPanel candidateId={c.id} /></Section>
        </div>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit candidate</DialogTitle></DialogHeader>
          <CandidateForm initial={c} onSaved={() => { setEditing(false); qc.invalidateQueries(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
