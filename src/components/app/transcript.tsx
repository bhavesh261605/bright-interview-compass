import { useQuery } from "@tanstack/react-query";
import { Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function Transcript({ interviewId }: { interviewId: string }) {
  const q = useQuery({
    queryKey: ["messages", interviewId],
    queryFn: async () => (await supabase.from("interview_messages").select("id, sender_type, message, section").eq("interview_id", interviewId).order("sequence_number")).data ?? [],
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading transcript…</p>;
  if (!q.data?.length) return <p className="text-xs text-muted-foreground">No messages recorded.</p>;
  return (
    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {q.data.map((m) => (
        <div key={m.id} className="flex gap-2 text-sm">
          <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", m.sender_type === "ai" ? "bg-primary/10 text-primary" : "bg-muted")}>
            {m.sender_type === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
          </span>
          <p className="whitespace-pre-wrap leading-relaxed"><b className="text-xs text-muted-foreground">{m.sender_type === "ai" ? "Aria" : "Candidate"}: </b>{m.message}</p>
        </div>
      ))}
    </div>
  );
}
