import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RECOMMENDATION, REVIEW_STATUS, SALARY_ALIGNMENT, formatDate, formatMoney } from "@/lib/labels";
import { Empty, Loading, PageHeader, Pill, StatusPill } from "@/components/app/ui-bits";
import { AtsPush } from "@/components/app/ats-push";
import { Transcript } from "@/components/app/transcript";
import { ReviewActions } from "@/components/app/review-actions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/review-queue")({
  head: () => ({ meta: [{ title: "Review queue — Aria HR" }, { name: "description", content: "Cases that need a human decision." }] }),
  component: ReviewQueue,
});

function ReviewQueue() {
  const [tab, setTab] = useState("open");
  const q = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorecards")
        .select("*, candidates(full_name, job_roles(title)), interviews(started_at, interview_evaluations(red_flags))")
        .eq("review_required", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const rows = (q.data ?? []).filter((s) => (tab === "open" ? ["pending", "returned", "info_requested"].includes(s.reviewer_status) : ["approved", "rejected"].includes(s.reviewer_status)));
  return (
    <div>
      <PageHeader title="Review queue" description="Out-of-band salaries, red flags, missing evidence and evaluation failures." />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="closed">Decided</TabsTrigger></TabsList>
      </Tabs>
      {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty title="Nothing here" /> : (
        <div className="space-y-4">
          {rows.map((s) => {
            const c = s.candidates as { full_name: string; job_roles: { title: string } | null } | null;
            const iv = s.interviews as { started_at: string; interview_evaluations: { red_flags: { flag: string; evidence: string }[] } | null } | null;
            const flags = iv?.interview_evaluations?.red_flags ?? [];
            return (
              <div key={s.id} className="surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to="/scorecards/$scorecardId" params={{ scorecardId: s.id }} className="font-semibold hover:text-primary">{c?.full_name}</Link>
                    <div className="text-xs text-muted-foreground">{c?.job_roles?.title ?? "No role"} · Interviewed {formatDate(iv?.started_at)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill map={RECOMMENDATION} value={s.final_recommendation} />
                    <StatusPill map={REVIEW_STATUS} value={s.reviewer_status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{s.review_reasons.map((r) => <Pill key={r} tone="warning">{r}</Pill>)}</div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <div className="eyebrow mb-1">Salary</div>
                    <StatusPill map={SALARY_ALIGNMENT} value={s.salary_alignment} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      Expected {formatMoney(s.expected_salary, s.salary_currency ?? "INR")}
                      {s.band_min != null && ` · Band ${formatMoney(s.band_min, s.salary_currency ?? "INR")}–${formatMoney(s.band_max, s.salary_currency ?? "INR")}`}
                    </span>
                  </div>
                  {flags.length > 0 && (
                    <div>
                      <div className="eyebrow mb-1">Evidence</div>
                      {flags.map((f, i) => (
                        <p key={i} className="text-xs"><b>Red flag — {f.flag}:</b> <i className="text-muted-foreground">“{f.evidence}”</i></p>
                      ))}
                    </div>
                  )}
                </div>
                <details className="mt-3 rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Full interview transcript</summary>
                  <div className="mt-3"><Transcript interviewId={s.interview_id} /></div>
                </details>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AtsPush scorecardId={s.id} />
                  <Link to="/scorecards/$scorecardId" params={{ scorecardId: s.id }} className="inline-flex items-center rounded-md border px-3 text-sm hover:bg-muted">Open scorecard</Link>
                </div>
                {tab === "open" && <div className="mt-4 border-t pt-4"><ReviewActions scorecardId={s.id} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
