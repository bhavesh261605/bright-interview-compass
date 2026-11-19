import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RECOMMENDATION, REVIEW_STATUS, SALARY_ALIGNMENT, formatDate } from "@/lib/labels";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/scorecards/")({
  head: () => ({ meta: [{ title: "Scorecards — Aria HR" }, { name: "description", content: "HR interview scorecards." }] }),
  component: Scorecards,
});

function Scorecards() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["scorecards"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorecards")
        .select("*, candidates(full_name, job_roles(title)), interviews(started_at, interview_evaluations(competency_scores))")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const rows = (list.data ?? []).filter((s) => {
    const c = s.candidates as { full_name: string; job_roles: { title: string } | null } | null;
    const t = q.toLowerCase();
    return !t || c?.full_name.toLowerCase().includes(t) || c?.job_roles?.title.toLowerCase().includes(t);
  });
  return (
    <div>
      <PageHeader title="Scorecards" description="Evidence-backed HR scorecards. Recommendations are advisory." />
      <Input className="mb-4 max-w-sm" placeholder="Search candidate or role…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.isLoading ? <Loading /> : rows.length === 0 ? <Empty title="No scorecards yet">They appear after an interview is evaluated.</Empty> : (
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Role</TableHead><TableHead>Interview</TableHead><TableHead>Overall</TableHead><TableHead>Recommendation</TableHead><TableHead>Salary</TableHead><TableHead>Review</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((s) => {
                const c = s.candidates as { full_name: string; job_roles: { title: string } | null } | null;
                const iv = s.interviews as { started_at: string; interview_evaluations: { competency_scores: { score: number | null }[] } | null } | null;
                const scores = (iv?.interview_evaluations?.competency_scores ?? []).map((x) => x.score).filter((x): x is number => x != null);
                const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
                return (
                  <TableRow key={s.id}>
                    <TableCell><Link to="/scorecards/$scorecardId" params={{ scorecardId: s.id }} className="font-medium hover:text-primary">{c?.full_name}</Link></TableCell>
                    <TableCell>{c?.job_roles?.title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(iv?.started_at)}</TableCell>
                    <TableCell className="tabular">{avg}{avg !== "—" && <span className="text-muted-foreground"> / 5</span>}</TableCell>
                    <TableCell><StatusPill map={RECOMMENDATION} value={s.final_recommendation} /></TableCell>
                    <TableCell><StatusPill map={SALARY_ALIGNMENT} value={s.salary_alignment} /></TableCell>
                    <TableCell><StatusPill map={REVIEW_STATUS} value={s.reviewer_status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
