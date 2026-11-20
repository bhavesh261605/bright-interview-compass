import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EXPERIENCE, INTERVIEW_STATUS, formatDate } from "@/lib/labels";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { CandidateLink } from "@/components/app/candidate-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/interviews/")({
  head: () => ({ meta: [{ title: "Interviews — WAE HR" }, { name: "description", content: "All AI-led HR interviews." }, { property: "og:title", content: "Interviews — WAE HR" }, { property: "og:description", content: "All AI-led HR interviews." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Interviews,
});

function Interviews() {
  const q = useQuery({
    queryKey: ["interviews"],
    queryFn: async () => {
      const { data } = await supabase.from("interviews").select("*, candidates(full_name), job_roles(title)").order("started_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Interviews" description="Live and completed HR rounds." actions={<Button asChild><Link to="/interviews/new" search={{}}>New interview</Link></Button>} />
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty title="No interviews yet">Start one from a candidate's profile.</Empty> : (
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Role</TableHead><TableHead>Category</TableHead><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Candidate view</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data!.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link to={i.status === "in_progress" ? "/interviews/$interviewId" : "/interview-summary/$interviewId"} params={{ interviewId: i.id }} className="font-medium hover:text-primary">
                      {(i.candidates as { full_name: string } | null)?.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>{(i.job_roles as { title: string } | null)?.title ?? "—"}</TableCell>
                  <TableCell>{EXPERIENCE[i.experience_category]}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(i.started_at)}</TableCell>
                  <TableCell><StatusPill map={INTERVIEW_STATUS} value={i.status} /></TableCell>
                  <TableCell>{i.status === "in_progress" ? <CandidateLink compact token={i.invite_token} /> : <span className="text-xs text-muted-foreground">Closed</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
