import waeLogo from "@/assets/wae_logo.png.asset.json";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Mic, MicOff, RefreshCw, Volume2, VolumeX, Send, ShieldCheck, User } from "lucide-react";
import { candidateFinish, candidateTurn, getCandidateSession } from "@/lib/interview.functions";
import { SECTIONS } from "@/lib/interview-prompts";
import { newClientId } from "@/lib/queries";
import { ViewSwitcher } from "@/components/app/view-switcher";
import { Loading } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/interview/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your interview — WAE HR" },
      { name: "description", content: "Private HR interview room. No account needed." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Your interview — WAE HR" },
      { property: "og:description", content: "Private HR interview room. No account needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidateRoom,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any;

function CandidateRoom() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; message: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const spokenRef = useRef<string | null>(null);
  const recRef = useRef<SpeechRec>(null);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const key = ["candidate-session", token];
  const s = useQuery({ queryKey: key, queryFn: () => getCandidateSession({ data: { token } }) });

  const turn = async (payload: { text?: string; clientMessageId?: string }) => {
    setThinking(true);
    setError(null);
    try {
      const r = await candidateTurn({ data: { token, ...payload } });
      if (!r.ok) setError(r.error);
      await qc.invalidateQueries({ queryKey: key });
      if (r.ok) setPending(null);
    } catch {
      setError("Connection problem. Your answer is kept — press Retry.");
    } finally {
      setThinking(false);
    }
  };

  useEffect(() => {
    if (!confirmed || started.current || !s.data || s.data.status !== "in_progress") return;
    started.current = true;
    const last = s.data.messages.at(-1);
    if (!last || last.sender_type === "candidate") void turn({});
  }, [confirmed, s.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [s.data, pending, thinking]);

  // Aria reads each new question aloud (browser voice) for a true voice-room experience.
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => {
    if (!ttsSupported || !confirmed) return;
    const last = s.data?.messages.at(-1);
    if (!last || last.sender_type !== "ai" || spokenRef.current === last.id) return;
    const first = spokenRef.current === null && s.data!.messages.length > 1;
    spokenRef.current = last.id;
    if (!voiceOn || first) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(last.message);
    u.lang = "en-IN";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }, [s.data, confirmed, voiceOn, ttsSupported]);
  useEffect(() => () => { if (ttsSupported) window.speechSynthesis.cancel(); }, [ttsSupported]);

  const speechSupported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    if (ttsSupported) window.speechSynthesis.cancel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.continuous = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((r: any) => r[0].transcript).join(" "); // eslint-disable-line @typescript-eslint/no-explicit-any
      setText((p) => (p ? p + " " : "") + t.trim());
    };
    rec.onend = () => setListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setListening(false);
      const code = e?.error as string | undefined;
      setMicError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings, or type your answer."
          : code === "audio-capture"
            ? "No microphone was found. Please type your answer."
            : code === "no-speech"
              ? "We didn't hear anything. Try again or type your answer."
              : "Dictation stopped unexpectedly. You can type your answer instead.",
      );
    };
    recRef.current = rec;
    setMicError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setMicError("Dictation couldn't start. Please type your answer.");
    }
  };
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* already stopped */ } }, []);

  if (s.isLoading) return <Loading />;
  const d = s.data;

  const shell = (body: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <img src={waeLogo.url} alt="WAE logo" className="h-8 w-auto rounded bg-card px-1" />
        <span className="font-semibold">WAE HR · Interview</span>
        <div className="ml-auto flex items-center gap-2">
          {ttsSupported && (
            <Button type="button" size="sm" variant={voiceOn ? "default" : "outline"} aria-label={voiceOn ? "Turn Aria's voice off" : "Turn Aria's voice on"}
              onClick={() => { if (voiceOn) window.speechSynthesis.cancel(); setVoiceOn(!voiceOn); }}>
              {voiceOn ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}{voiceOn ? "Voice on" : "Voice off"}
            </Button>
          )}
          <ViewSwitcher />
        </div>
      </header>
      {body}
    </div>
  );

  if (!d) return shell(<Center title="This interview link is invalid or has expired." text="Please check the link from your recruiter." />);
  if (d.status !== "in_progress")
    return shell(<Center icon title="Thank you — your interview is complete." text="Your responses have been saved. A recruiter will be in touch about next steps." />);

  if (!confirmed)
    return shell(
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="surface w-full max-w-md p-6">
          <div className="eyebrow">Interview invitation</div>
          <h1 className="mt-1 text-xl font-semibold">Hi {d.candidateName.split(" ")[0]}, welcome.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This is a text HR interview for <b className="text-foreground">{d.roleTitle}</b>, about {d.durationMinutes} minutes. Aria, an AI interviewer, will ask one question at a time and read it aloud. You can type or answer with the microphone.
          </p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li>• Every answer is saved instantly — you can close and resume with this link.</li>
            <li>• You won't be asked about age, religion, marital or family status.</li>
            <li>• A human recruiter makes all decisions.</li>
          </ul>
          <Button className="mt-5 w-full" onClick={() => setConfirmed(true)}>I'm {d.candidateName.split(" ")[0]} — start interview</Button>
        </div>
      </div>,
    );

  const list = [...d.messages];
  const pendingSaved = !!pending && d.messages.some((m) => m.id === pending.id || (m as { client_message_id?: string }).client_message_id === pending.id);
  if (pending && !pendingSaved && thinking) list.push({ id: pending.id, sender_type: "candidate", message: pending.message, sequence_number: 1e9 });
  const awaitingAI = !thinking && d.messages.at(-1)?.sender_type === "candidate";
  const idx = Math.max(0, SECTIONS.findIndex((x) => x.key === d.section));

  const send = async () => {
    const t = text.trim();
    if (!t || thinking) return;
    if (listening) recRef.current?.stop();
    const cid = newClientId();
    setPending({ id: cid, message: t });
    setText("");
    await turn({ text: t, clientMessageId: cid });
  };
  // The server de-duplicates by client message ID, so resending a pending answer is always safe.
  const retry = () => (pending ? turn({ text: pending.message, clientMessageId: pending.id }) : turn({}));
  const finish = async () => {
    if (listening) recRef.current?.stop();
    setFinishing(true);
    setFinishError(null);
    try {
      const r = await candidateFinish({ data: { token } });
      if (!r.ok) setFinishError(r.error);
    } catch {
      setFinishError("Connection problem — your answers are saved. Please try submitting again.");
    }
    await qc.invalidateQueries({ queryKey: key });
    setFinishing(false);
  };
  const unsent = !!pending && !thinking;

  return shell(
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col p-3 sm:p-4" style={{ height: "calc(100vh - 3.5rem)" }}>
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">{SECTIONS[idx]?.label}</span>
        <Progress value={((idx + 1) / SECTIONS.length) * 100} className="h-1.5" />
        <span className={cn("flex items-center gap-1 whitespace-nowrap", unsent && "text-destructive")} aria-live="polite">
          <ShieldCheck className="h-3.5 w-3.5" />{thinking ? "Saving…" : unsent ? "Not sent" : "All answers saved"}
        </span>
      </div>
      <div className="surface flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {list.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.sender_type === "candidate" && "flex-row-reverse")}>
              <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", m.sender_type === "ai" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {m.sender_type === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className={cn("max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed", m.sender_type === "ai" ? "bg-muted" : "bg-primary text-primary-foreground")}>{m.message}</div>
            </div>
          ))}
          {thinking && (
            <div className="flex items-center gap-3" aria-live="polite">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
              <div className="flex gap-1 rounded-lg bg-muted px-3.5 py-3" aria-label="Aria is typing">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          {(error || awaitingAI || unsent) && !thinking && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span className="flex-1">{error ?? (unsent ? `Your last answer wasn't sent: “${pending!.message.slice(0, 60)}${pending!.message.length > 60 ? "…" : ""}”` : "Aria hasn't replied yet.")}</span>
              <Button size="sm" variant="outline" onClick={() => void retry()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>
            </div>
          )}
          {d.aiDone && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              <span>That's all the questions. Submit when you're ready.</span>
              <Button size="sm" onClick={finish} disabled={finishing}>{finishing ? "Submitting…" : finishError ? "Try again" : "Submit interview"}</Button>
            </div>
          )}
          {finishError && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{finishError}</div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={thinking || finishing} className="resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={listening ? "Listening… speak your answer" : "Type your answer (Enter to send)"} />
            <div className="flex flex-col gap-1.5 self-end">
              {speechSupported && (
                <Button type="button" variant={listening ? "destructive" : "outline"} size="icon" onClick={toggleMic} aria-label={listening ? "Stop dictation" : "Speak answer"}>
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button size="icon" onClick={() => void send()} disabled={!text.trim() || thinking} aria-label="Send"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
          {micError && <p role="status" className="mt-2 text-xs text-destructive">{micError}</p>}
          {!d.aiDone && <button className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { if (window.confirm("End the interview now? You won't be able to answer more questions.")) void finish(); }} disabled={finishing}>{finishing ? "Submitting…" : "End interview early"}</button>}
        </div>
      </div>
    </div>,
  );
}

function Center({ title, text, icon }: { title: string; text: string; icon?: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="surface max-w-md p-6">
        {icon && <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />}
        <h1 className="font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
