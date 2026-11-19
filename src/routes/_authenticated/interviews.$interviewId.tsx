import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Bot, Clock, RefreshCw, Send, ShieldCheck, Square, User, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { endAndEvaluate, interviewTurn } from "@/lib/interview.functions";
import { SECTIONS } from "@/lib/interview-prompts";
import { EXPERIENCE } from "@/lib/labels";
import { newClientId } from "@/lib/queries";
import { Empty, Loading } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/interviews/$interviewId")({
  head: () => ({ meta: [{ title: "Live interview — Aria HR" }, { name: "description", content: "AI-led HR interview room." }] }),
  component: LiveInterview,
});

type Msg = { id: string; sender_type: string; message: string; sequence_number: number; pending?: boolean };

function LiveInterview() {
  const { interviewId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<Msg | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(Date.now());
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const iv = useQuery({
    queryKey: ["interview", interviewId],
    queryFn: async () => (await supabase.from("interviews").select("*, candidates(full_name), job_roles(title)").eq("id", interviewId).maybeSingle()).data,
  });
  const msgs = useQuery({
    queryKey: ["messages", interviewId],
    queryFn: async () => ((await supabase.from("interview_messages").select("*").eq("interview_id", interviewId).order("sequence_number")).data ?? []) as Msg[],
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const runTurn = async (payload: { text?: string; clientMessageId?: string }) => {
    setThinking(true);
    setError(null);
    try {
      const r = await interviewTurn({ data: { interviewId, ...payload } });
      if (!r.ok) setError(r.error);
      await Promise.all([qc.invalidateQueries({ queryKey: ["messages", interviewId] }), qc.invalidateQueries({ queryKey: ["interview", interviewId] })]);
      if (r.ok) setPending(null);
    } catch {
      setError("Connection problem. Your answer is kept — press Retry.");
    } finally {
      setThinking(false);
    }
  };

  // First turn: AI introduction (guarded against double-run)
  useEffect(() => {
    if (started.current || !msgs.data || !iv.data) return;
    if (iv.data.status !== "in_progress") return;
    const last = msgs.data.at(-1);
    if (!last || last.sender_type === "candidate") {
      started.current = true;
      void runTurn({});
    } else started.current = true;
  }, [msgs.data, iv.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.data, pending, thinking]);

  if (iv.isLoading || msgs.isLoading) return <Loading />;
  if (!iv.data) return <Empty title="Interview not found." />;
  const data = iv.data;

  if (data.status !== "in_progress")
    return (
      <Empty title="This interview has ended.">
        <Link className="text-primary" to="/interview-summary/$interviewId" params={{ interviewId }}>View summary</Link>
      </Empty>
    );

  const list: Msg[] = [...(msgs.data ?? [])];
  const lastCand = [...list].reverse().find((m) => m.sender_type === "candidate");
  if (pending && lastCand?.message !== pending.message) list.push(pending);
  const last = (msgs.data ?? []).at(-1);
  const awaitingAI = !thinking && last?.sender_type === "candidate";
  const sectionIdx = Math.max(0, SECTIONS.findIndex((s) => s.key === data.current_section));
  const elapsedS = Math.floor((now - new Date(data.started_at).getTime()) / 1000);
  const totalS = data.duration_minutes * 60;
  const aiDone = (data.state as { ai_marked_complete?: boolean })?.ai_marked_complete;

  const send = async () => {
    const t = text.trim();
    if (!t || thinking) return;
    const cid = newClientId();
    setPending({ id: cid, sender_type: "candidate", message: t, sequence_number: 1e9, pending: true });
    setText("");
    await runTurn({ text: t, clientMessageId: cid });
  };
  const retry = async () => {
    if (pending && !(msgs.data ?? []).some((m) => m.message === pending.message && m.sender_type === "candidate")) {
      await runTurn({ text: pending.message, clientMessageId: pending.id });
    } else await runTurn({});
  };
  const finish = async () => {
    setEnding(true);
    try {
      const r = await endAndEvaluate({ data: { interviewId } });
      if (!r.ok) toast.error(r.error);
      else toast.success("Interview evaluated and saved.");
      qc.invalidateQueries();
      nav({ to: "/interview-summary/$interviewId", params: { interviewId } });
    } catch {
      toast.error("Could not end the interview. Your transcript is safe — try again.");
      setEnding(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="grid h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[1fr_280px]">
      <div className="surface flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{(data.candidates as { full_name: string } | null)?.full_name}</div>
            <div className="text-xs text-muted-foreground">{(data.job_roles as { title: string } | null)?.title ?? data.interview_type} · {EXPERIENCE[data.experience_category]}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("flex items-center gap-1 text-xs tabular", elapsedS > totalS ? "text-destructive" : "text-muted-foreground")}>
              <Clock className="h-3.5 w-3.5" />{fmt(elapsedS)} / {data.duration_minutes}:00
            </span>
            <Button size="sm" variant="outline" onClick={() => setConfirmEnd(true)} disabled={ending}>
              <Square className="mr-1 h-3.5 w-3.5" />{ending ? "Evaluating…" : "End interview"}
            </Button>
          </div>
        </div>
        {!online && (
          <div className="flex items-center gap-2 bg-warning/12 px-4 py-2 text-xs text-warning"><WifiOff className="h-3.5 w-3.5" />You're offline. Messages will be sent when you reconnect.</div>
        )}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {list.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.sender_type === "candidate" && "flex-row-reverse")}>
              <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", m.sender_type === "ai" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {m.sender_type === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className={cn("max-w-[75%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed", m.sender_type === "ai" ? "bg-muted" : "bg-primary text-primary-foreground", m.pending && "opacity-70")}>
                {m.message}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex gap-3">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
              <div className="rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">Aria is thinking…</div>
            </div>
          )}
          {(error || awaitingAI) && !thinking && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="flex-1">{error ?? "The interviewer hasn't replied yet."}</span>
              <Button size="sm" variant="outline" onClick={retry}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>
            </div>
          )}
          {aiDone && (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              The interviewer has wrapped up. Click <b>End interview</b> to generate the scorecard.
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Type the candidate's response… (Enter to send, Shift+Enter for new line)"
              disabled={thinking || ending}
              className="resize-none"
            />
            <Button onClick={send} disabled={!text.trim() || thinking || ending || !online} className="self-end" aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden space-y-4 lg:block">
        <div className="surface p-4">
          <div className="eyebrow">Progress</div>
          <Progress value={((sectionIdx + 1) / SECTIONS.length) * 100} className="mt-2" />
          <ol className="mt-3 space-y-1.5 text-sm">
            {SECTIONS.map((s, i) => (
              <li key={s.key} className={cn("flex items-center gap-2", i === sectionIdx ? "font-medium text-primary" : i < sectionIdx ? "text-muted-foreground line-through decoration-border" : "text-muted-foreground")}>
                <span className="w-4 text-xs tabular">{i + 1}</span>{s.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="surface p-4 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-1 font-medium text-foreground"><ShieldCheck className="h-3.5 w-3.5" />Guardrails active</div>
          No questions on age, religion, marital or family status. Salary is never promised or negotiated. Every message is saved instantly.
        </div>
      </aside>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End and evaluate this interview?</AlertDialogTitle>
            <AlertDialogDescription>The conversation will close and a separate evaluation will generate the scorecard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue interview</AlertDialogCancel>
            <AlertDialogAction onClick={finish}>End & evaluate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
