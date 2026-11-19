import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { endAndEvaluate } from "@/lib/interview.functions";
import { INTERVIEW_STATUS } from "@/lib/labels";
import { ScorecardReport, useReportData } from "@/components/app/scorecard-report";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/interview-summary/$interviewId")({
  head: () => ({ meta: [{ title: "Interview summary — WAE HR" }, { name: "description", content: "Interview transcript, notes and scorecard." }] }),
  component: Summary,
});

function Summary() {
  const { interviewId } = Route.useParams();
  const qc = useQueryClient();
  const q = useReportData(interviewId);
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Loading />;
  if (!q.data?.iv) return <Empty title="Interview not found." />;
  const { iv, sc } = q.data;
  const evaluate = async () => {
    setBusy(true);
    const r = await endAndEvaluate({ data: { interviewId } }).catch(() => ({ ok: false as const, error: "Connection problem. Try again." }));
    if (!r.ok) toast.error(r.error);
    else toast.success("Evaluation saved.");
    await qc.invalidateQueries();
    setBusy(false);
  };
  return (
    <div>
      <PageHeader
        title="Interview summary"
        description={(iv.candidates as { full_name: string } | null)?.full_name}
        actions={
          <>
            <StatusPill map={INTERVIEW_STATUS} value={iv.status} />
            {iv.status === "in_progress" && <Button asChild><Link to="/interviews/$interviewId" params={{ interviewId }}>Back to interview</Link></Button>}
            {(iv.status === "completed" || iv.status === "evaluation_failed") && (
              <Button onClick={evaluate} disabled={busy}><RefreshCw className="mr-1 h-4 w-4" />{busy ? "Evaluating…" : iv.status === "evaluation_failed" ? "Retry evaluation" : "Run evaluation"}</Button>
            )}
            {sc && <Button variant="outline" asChild><Link to="/scorecards/$scorecardId" params={{ scorecardId: sc.id }}>Open scorecard</Link></Button>}
          </>
        }
      />
      {iv.status === "evaluation_failed" && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          The AI evaluation failed and was sent to the review queue. The transcript is safe — you can retry.
        </div>
      )}
      <ScorecardReport interviewId={interviewId} />
    </div>
  );
}
