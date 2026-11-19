import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recordReview } from "@/lib/interview.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReviewActions({ scorecardId }: { scorecardId: string }) {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  if (!roles.includes("reviewer") && !roles.includes("admin"))
    return <p className="text-sm text-muted-foreground">Only reviewers or admins can record decisions.</p>;
  const act = async (action: "approve" | "reject" | "request_info" | "return") => {
    setBusy(true);
    try {
      await recordReview({ data: { scorecardId, action, comments } });
      toast.success("Decision recorded");
      setComments("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record decision");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Textarea rows={2} placeholder="Reviewer notes (saved to audit trail)…" value={comments} onChange={(e) => setComments(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => act("approve")}>Approve recommendation</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("reject")}>Reject recommendation</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("request_info")}>Request more info</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("return")}>Return for further review</Button>
      </div>
      <p className="text-xs text-muted-foreground">Approving a recommendation does not approve any salary offer.</p>
    </div>
  );
}
