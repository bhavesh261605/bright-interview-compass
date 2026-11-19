import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Pill } from "./ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/labels";

export function NotesPanel({ candidateId, interviewId, noteType = "recruiter" }: { candidateId: string; interviewId?: string; noteType?: "recruiter" | "reviewer" }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const notes = useQuery({
    queryKey: ["notes", candidateId],
    queryFn: async () => {
      const { data } = await supabase.from("reviewer_notes").select("*").eq("candidate_id", candidateId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const add = async () => {
    if (!text.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("reviewer_notes").insert({
      candidate_id: candidateId,
      interview_id: interviewId ?? null,
      note: text.trim(),
      note_type: noteType,
      reviewer_id: u.user!.id,
    });
    if (error) { toast.error(error.message); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["notes", candidateId] });
  };
  return (
    <div className="space-y-3">
      <Textarea rows={3} placeholder="Add a private note (confidential)…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end"><Button size="sm" onClick={add}>Add note</Button></div>
      <ul className="space-y-2">
        {(notes.data ?? []).map((n) => (
          <li key={n.id} className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <Pill tone={n.note_type === "reviewer" ? "info" : "primary"}>{n.note_type === "reviewer" ? "Reviewer note" : "Recruiter note"}</Pill>
              <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{n.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
