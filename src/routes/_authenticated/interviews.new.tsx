import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchJobRoles } from "@/lib/queries";
import { createInterview } from "@/lib/interview.functions";
import { FOCUS } from "@/lib/interview-prompts";
import { EXPERIENCE, formatMoney } from "@/lib/labels";
import { Field, PageHeader, Section } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/interviews/new")({
  validateSearch: z.object({ candidateId: z.string().optional() }),
  head: () => ({ meta: [{ title: "Interview setup — WAE HR" }, { name: "description", content: "Configure an AI HR interview." }, { property: "og:title", content: "Interview setup — WAE HR" }, { property: "og:description", content: "Configure an AI HR interview." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Setup,
});

function Setup() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const [candidateId, setCandidateId] = useState(search.candidateId ?? "");
  const [jobRoleId, setJobRoleId] = useState("");
  const [category, setCategory] = useState<"fresher" | "experienced">("fresher");
  const [type, setType] = useState("HR Round");
  const [duration, setDuration] = useState("30");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = useQuery({
    queryKey: ["candidates-min"],
    queryFn: async () => (await supabase.from("candidates").select("id, full_name").order("full_name")).data ?? [],
  });
  const roles = useQuery({ queryKey: ["job_roles"], queryFn: fetchJobRoles });
  const cand = useQuery({
    queryKey: ["candidate-setup", candidateId],
    enabled: !!candidateId,
    queryFn: async () => (await supabase.from("candidates").select("*").eq("id", candidateId).maybeSingle()).data,
  });
  useEffect(() => {
    if (cand.data) {
      setCategory(cand.data.experience_level as "fresher" | "experienced");
      if (cand.data.job_role_id) setJobRoleId(cand.data.job_role_id);
    }
  }, [cand.data]);
  useEffect(() => {
    const r = roles.data?.find((x) => x.id === jobRoleId);
    if (r?.description && !context) setContext(r.description);
  }, [jobRoleId, roles.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (!candidateId) { toast.error("Select a candidate"); return; }
    if (!context.trim()) { toast.error("Add a job description or role context"); return; }
    setBusy(true);
    try {
      const r = await createInterview({
        data: { candidateId, jobRoleId: jobRoleId || null, experienceCategory: category, interviewType: type, durationMinutes: Number(duration), roleContext: context },
      });
      if (r.resumed) toast.info("Resuming the interview already in progress.");
      nav({ to: "/interviews/$interviewId", params: { interviewId: r.interviewId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start interview");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Interview setup" description="Review the candidate, then configure the AI interviewer." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="surface space-y-4 p-5 lg:col-span-3">
          <div className="space-y-1.5">
            <Label>Candidate *</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger><SelectValue placeholder="Select candidate" /></SelectTrigger>
              <SelectContent>{(candidates.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Job role</Label>
              <Select value={jobRoleId} onValueChange={setJobRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Experience category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as "fresher" | "experienced")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresher">A. Fresher</SelectItem>
                  <SelectItem value="experienced">B. Experienced (0–6 years)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interview type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["15", "20", "30", "45", "60"].map((d) => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Job description / role context *</Label>
            <Textarea rows={6} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Responsibilities, must-haves, team context…" />
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="eyebrow mb-1">Question focus — {EXPERIENCE[category]}</div>
            <p className="text-muted-foreground">{FOCUS[category].join(" · ")}</p>
          </div>
          <Button className="w-full" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start AI interview"}</Button>
        </div>
        <Section title="Candidate review" className="lg:col-span-2">
          {!cand.data ? <p className="text-sm text-muted-foreground">Select a candidate to review their details.</p> : (
            <dl className="grid gap-3">
              <Field label="Name" value={cand.data.full_name} />
              <Field label="Experience" value={`${EXPERIENCE[cand.data.experience_level]}${cand.data.experience_level === "experienced" ? ` · ${cand.data.years_of_experience} yrs` : ""}`} />
              <Field label="Current company" value={cand.data.current_company} />
              <Field label="Skills (claimed)" value={cand.data.skills?.join(", ") || "—"} />
              <Field label="Notice period" value={cand.data.notice_period_days != null ? `${cand.data.notice_period_days} days` : "Not recorded"} />
              <Field label="Expected compensation" value={formatMoney(cand.data.expected_compensation)} />
              <Field label="Recruiter notes" value={cand.data.recruiter_notes} />
            </dl>
          )}
        </Section>
      </div>
    </div>
  );
}
