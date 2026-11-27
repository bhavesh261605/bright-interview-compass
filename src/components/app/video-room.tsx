import { useEffect, useRef, useState } from "react";
import { Bot, Camera, CameraOff, CheckCircle2, Loader2, Mic, MessageSquare, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Msg = { id: string; sender_type: string; message: string };
type Phase = "speaking" | "listening" | "thinking" | "idle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any;

/**
 * Hands-free video interview: the candidate's camera shows on screen, Aria speaks each
 * question aloud, then the mic opens automatically and live captions show what was heard.
 * Answers go through the same onSend path as the text chat, so all HR rules still apply.
 */
// Prefer a natural-sounding English voice (Google/Microsoft neural voices) when the browser has one.
function pickVoice(): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return all.find((v) => v.lang === "en-IN" && /google|natural|neural/i.test(v.name))
    ?? all.find((v) => /natural|neural/i.test(v.name))
    ?? all.find((v) => /google/i.test(v.name))
    ?? all.find((v) => v.lang === "en-IN");
}

export function VideoRoom(props: {
  messages: Msg[];
  thinking: boolean;
  aiDone: boolean;
  error: string | null;
  finishing: boolean;
  onSend: (text: string) => Promise<void>;
  onRetry: () => void;
  onFinish: () => void;
  onSwitchToChat: () => void;
}) {
  const { messages, thinking, aiDone, onSend } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<SpeechRec>(null);
  const spokenRef = useRef<string | null>(null);
  const finalRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<() => void>(() => {});
  const SILENCE_MS = 1600;
  const [camOn, setCamOn] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [caption, setCaption] = useState("");
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const W = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
  const Rec = (W["SpeechRecognition"] ?? W["webkitSpeechRecognition"]) as (new () => SpeechRec) | undefined;
  const tts = typeof window !== "undefined" && "speechSynthesis" in window;

  // Camera
  useEffect(() => {
    let cancelled = false;
    if (!camOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamError(null);
      })
      .catch(() => { setCamError("Camera access was blocked or no camera was found. You can continue with voice only."); setCamOn(false); });
    return () => { cancelled = true; };
  }, [camOn]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { recRef.current?.abort?.(); } catch { /* stopped */ }
    if (tts) window.speechSynthesis.cancel();
  }, [tts]);

  const clearSilence = () => { if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; } };
  const stopListening = () => { clearSilence(); try { recRef.current?.stop(); } catch { /* stopped */ } };

  const startListening = () => {
    if (!Rec) { setEditing(true); setPhase("idle"); return; }
    stopListening();
    finalRef.current = "";
    setCaption(""); setInterim(""); setMicError(null);
    const rec = new Rec();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = (finalRef.current + " " + r[0].transcript).trim();
        else live += r[0].transcript;
      }
      setCaption(finalRef.current);
      setInterim(live);
      // Candidate paused long enough: treat the answer as finished and send it.
      clearSilence();
      if ((finalRef.current + live).trim()) silenceRef.current = setTimeout(() => submitRef.current(), SILENCE_MS);
    };
    rec.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const code = e?.error as string | undefined;
      if (code === "no-speech" || code === "aborted") return;
      setMicError(code === "not-allowed" || code === "service-not-allowed"
        ? "Microphone access was blocked. Allow it in your browser, or type your answer."
        : "The microphone stopped. Press 'Answer again' or type your answer.");
    };
    recRef.current = rec;
    try { rec.start(); setPhase("listening"); } catch { setMicError("The microphone couldn't start. Please type your answer."); }
  };

  const lastAi = [...messages].reverse().find((m) => m.sender_type === "ai");

  // When a new question arrives: speak it, then open the mic.
  useEffect(() => {
    if (thinking) { setPhase("thinking"); return; }
    const last = messages.at(-1);
    if (!last || last.sender_type !== "ai") { setPhase("idle"); return; }
    if (spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    if (aiDone) { setPhase("idle"); if (tts) speak(last.message, () => {}); return; }
    if (!tts) { startListening(); return; }
    setPhase("speaking");
    speak(last.message, () => startListening());
  }, [messages, thinking, aiDone]); // eslint-disable-line react-hooks/exhaustive-deps

  function speak(text: string, after: () => void) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1.15;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = after;
    u.onerror = after;
    window.speechSynthesis.speak(u);
  }

  const answer = (caption + " " + interim).trim();
  const submit = async () => {
    const t = (finalRef.current + " " + (editing ? "" : interim)).trim() || answer;
    if (!t || thinking) return;
    stopListening();
    setPhase("thinking");
    setCaption(""); setInterim(""); setEditing(false);
    finalRef.current = "";
    await onSend(t);
  };
  submitRef.current = () => {
    if (editing) return;
    const t = (finalRef.current + " " + interim).trim();
    // Voice command: "repeat the question" replays Aria instead of sending an answer.
    if (isRepeatRequest(t)) { finalRef.current = ""; setCaption(""); setInterim(""); replay(); return; }
    void submit();
  };
  const isRepeatRequest = (t: string) =>
    t.length < 60 && /\b(repeat|say (that|it) again|pardon|come again|didn'?t (hear|catch|get)|once more)\b/i.test(t);
  const replay = () => {
    if (!lastAi || !tts) return;
    stopListening();
    setPhase("speaking");
    speak(lastAi.message, () => startListening());
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl content-start items-start gap-4 p-3 sm:p-4 lg:grid-cols-2">
      {/* Candidate camera */}
      <div className="surface relative flex aspect-video items-center justify-center overflow-hidden bg-foreground/90 lg:aspect-[4/3]">
        {camOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-background/80">
            <CameraOff className="h-8 w-8" /><span className="text-sm">{camError ?? "Camera is off"}</span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            phase === "listening" ? "bg-destructive text-destructive-foreground" : "bg-background/80 text-foreground")}>
            <Mic className={cn("h-3.5 w-3.5", phase === "listening" && "animate-pulse")} />
            {phase === "listening" ? "Listening" : "Mic paused"}
          </span>
        </div>
        <Button size="sm" variant="secondary" className="absolute right-3 top-3" onClick={() => setCamOn(!camOn)}
          aria-label={camOn ? "Turn camera off" : "Turn camera on"}>
          {camOn ? <CameraOff className="mr-1 h-4 w-4" /> : <Camera className="mr-1 h-4 w-4" />}{camOn ? "Camera off" : "Camera on"}
        </Button>
      </div>

      {/* Aria + captions */}
      <div className="surface flex flex-col p-5">
        <div className="flex items-center gap-3">
          <div className={cn("grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary", phase === "speaking" && "ring-4 ring-primary/30 animate-pulse")}>
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Aria</div>
            <div className="text-xs text-muted-foreground" aria-live="polite">
              {phase === "speaking" ? "Speaking…" : phase === "thinking" ? "Thinking…" : phase === "listening" ? "Your turn — speak, then pause and Aria will reply" : aiDone ? "Interview finished" : "Waiting"}
            </div>
          </div>
          {phase === "thinking" && <Loader2 className="ml-auto h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <p className="mt-4 min-h-[4rem] text-lg leading-relaxed">{lastAi?.message ?? "Getting your first question ready…"}</p>

        {!aiDone && (
          <div className="mt-4 rounded-lg border bg-muted/40 p-3">
            <div className="eyebrow mb-1">Your answer {phase === "listening" && "· live captions"}</div>
            {editing ? (
              <Textarea rows={4} value={caption} onChange={(e) => { setCaption(e.target.value); finalRef.current = e.target.value; setInterim(""); }} placeholder="Type or edit your answer" />
            ) : (
              <p className="min-h-[4rem] text-sm">{caption}{interim && <span className="text-muted-foreground"> {interim}</span>}
                {!answer && <span className="text-muted-foreground">{phase === "listening" ? "Start speaking — pause when you\u2019re done. Say \u201crepeat the question\u201d to hear it again." : "…"}</span>}</p>
            )}
          </div>
        )}

        {micError && <p role="status" className="mt-2 text-xs text-destructive">{micError}</p>}
        {props.error && !thinking && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span className="flex-1">{props.error}</span>
            <Button size="sm" variant="outline" onClick={props.onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>
          </div>
        )}

        {aiDone ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />That's all the questions.</span>
            <Button size="sm" onClick={props.onFinish} disabled={props.finishing}>{props.finishing ? "Submitting…" : "Submit interview"}</Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {editing && <Button onClick={() => void submit()} disabled={!answer || thinking}><Send className="mr-1 h-4 w-4" />Send answer</Button>}
            <Button variant="outline" onClick={startListening} disabled={thinking || phase === "speaking"}><Mic className="mr-1 h-4 w-4" />Answer again</Button>
            <Button variant="ghost" onClick={() => { stopListening(); setEditing(!editing); }}>{editing ? "Use voice" : "Edit / type"}</Button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <button className="flex items-center gap-1 hover:text-foreground" onClick={() => { stopListening(); if (tts) window.speechSynthesis.cancel(); props.onSwitchToChat(); }}>
            <MessageSquare className="h-3.5 w-3.5" />Switch to text chat
          </button>
          {!aiDone && <button className="hover:text-foreground" disabled={props.finishing}
            onClick={() => { if (window.confirm("End the interview now? You won't be able to answer more questions.")) { stopListening(); props.onFinish(); } }}>End interview early</button>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Your video is only shown to you on this screen — it isn't recorded or uploaded. Only your spoken answers are saved as text.</p>
      </div>
    </div>
  );
}
