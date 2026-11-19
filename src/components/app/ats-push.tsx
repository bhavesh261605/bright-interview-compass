import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Exports the scorecard + transcript as an ATS-ready JSON payload and logs the push. */
export function AtsPush({ scorecardId }: { scorecardId: string }) {
  const [busy, setBusy] = useState(false);
  const push = async () => {
    setBusy(true);
    try {
      const { data: sc } = await supabase.from("scorecards").select("*, candidates(full_name, email, phone, job_roles(title))").eq("id", scorecardId).single();
      if (!sc) throw new Error("not found");
      const [{ data: ev }, { data: msgs }] = await Promise.all([
        supabase.from("interview_evaluations").select("*").eq("interview_id", sc.interview_id).maybeSingle(),
        supabase.from("interview_messages").select("sender_type, message, sequence_number, created_at").eq("interview_id", sc.interview_id).order("sequence_number"),
      ]);
      const payload = { schema: "aria-hr.ats.v1", exported_at: new Date().toISOString(), candidate: sc.candidates, scorecard: sc, evaluation: ev, transcript: msgs ?? [] };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ats-${(sc.candidates as { full_name: string } | null)?.full_name?.replace(/\s+/g, "_") ?? scorecardId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      await supabase.from("audit_logs").insert({ action: "ats.pushed", entity_type: "scorecard", entity_id: scorecardId, metadata: { format: "json" } });
      toast.success("Pushed to ATS (JSON export downloaded)");
    } catch {
      toast.error("ATS push failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={push} disabled={busy}><Send className="mr-1 h-3.5 w-3.5" />{busy ? "Pushing…" : "Push to ATS"}</Button>
  );
}
