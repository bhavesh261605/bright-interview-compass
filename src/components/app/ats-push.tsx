import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Downloads an ATS-ready export; no external ATS delivery is claimed. */
export function AtsPush({ scorecardId }: { scorecardId: string }) {
  const [busy, setBusy] = useState(false);
  const push = async () => {
    setBusy(true);
    try {
      const { data: sc, error: scError } = await supabase.from("scorecards").select("*, candidates(full_name, email, phone, job_roles(title))").eq("id", scorecardId).single();
      if (scError || !sc) throw new Error("Scorecard could not be loaded.");
      const [{ data: ev, error: evError }, { data: msgs, error: msgsError }] = await Promise.all([
        supabase.from("interview_evaluations").select("*").eq("interview_id", sc.interview_id).maybeSingle(),
        supabase.from("interview_messages").select("sender_type, message, sequence_number, created_at").eq("interview_id", sc.interview_id).order("sequence_number"),
      ]);
      if (evError || msgsError) throw new Error("The full evaluation and transcript could not be loaded. Export cancelled.");
      const payload = { schema: "wae-hr.ats.v1", exported_at: new Date().toISOString(), candidate: sc.candidates, scorecard: sc, evaluation: ev, transcript: msgs ?? [] };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `ats-${(sc.candidates as { full_name: string } | null)?.full_name?.replace(/\s+/g, "_") ?? scorecardId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const { error: auditError } = await supabase.from("audit_logs").insert({ action: "ats.exported", entity_type: "scorecard", entity_id: scorecardId, metadata: { format: "json", delivery: "download" } });
      if (auditError) toast.warning("ATS export downloaded, but its audit record could not be saved.");
      else toast.success("ATS scorecard export downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ATS export failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={push} disabled={busy}><Download className="mr-1 h-3.5 w-3.5" />{busy ? "Exporting…" : "Export ATS scorecard"}</Button>
  );
}
