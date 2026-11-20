import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScorecardReport } from "@/components/app/scorecard-report";
import { AtsPush } from "@/components/app/ats-push";
import { ReviewActions } from "@/components/app/review-actions";
import { Empty, Loading, PageHeader, Section } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/scorecards/$scorecardId")({
  head: () => ({ meta: [{ title: "Scorecard — WAE HR" }, { name: "description", content: "Detailed HR scorecard report." }, { property: "og:title", content: "Scorecard — WAE HR" }, { property: "og:description", content: "Detailed HR scorecard report." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ScorecardDetail,
});

function ScorecardDetail() {
  const { scorecardId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scorecard", scorecardId],
    queryFn: async () => (await supabase.from("scorecards").select("*, candidates(full_name)").eq("id", scorecardId).maybeSingle()).data,
  });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Empty title="Scorecard not found or access denied." />;
  const sc = q.data;
  const setOutcome = async (v: string) => {
    const val = v === "none" ? null : v;
    const { error } = await supabase.from("scorecards").update({ final_round_outcome: val }).eq("id", sc.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "scorecard.final_round_outcome", entity_type: "scorecard", entity_id: sc.id, metadata: { outcome: val } });
    qc.invalidateQueries();
    toast.success("Final-round outcome recorded");
  };
  const exportPdf = async () => {
    await supabase.from("audit_logs").insert({ action: "scorecard.exported", entity_type: "scorecard", entity_id: sc.id });
    window.print();
  };
  return (
    <div className="print-area">
      <PageHeader
        title={`Scorecard — ${(sc.candidates as { full_name: string } | null)?.full_name}`}
        description="Confidential. AI recommendation is advisory; humans make hiring decisions."
        actions={<div className="no-print flex gap-2"><AtsPush scorecardId={sc.id} /><Button variant="outline" className="no-print" onClick={exportPdf}><Printer className="mr-1 h-4 w-4" />Export PDF</Button></div>}
      />
      <div className="no-print mb-4 grid gap-4 lg:grid-cols-2">
        <Section title="Human review">
          <ReviewActions scorecardId={sc.id} />
        </Section>
        <Section title="Final-round outcome (for pass-through rate)">
          <Select value={sc.final_round_outcome ?? "none"} onValueChange={setOutcome}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not recorded</SelectItem>
              <SelectItem value="progressed">Progressed to final round</SelectItem>
              <SelectItem value="not_progressed">Did not progress</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      </div>
      <ScorecardReport interviewId={sc.interview_id} />
    </div>
  );
}
