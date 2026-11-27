// Browser helper: plays Aria's ElevenLabs voice, falling back to the browser voice if it fails.
// A watchdog always calls `done` so the interview can never get stuck on "Aria is speaking".
let current: HTMLAudioElement | null = null;
let seq = 0;

export function stopAria() {
  seq++;
  if (current) { current.pause(); current.src = ""; current = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function browserSpeak(text: string, done: () => void) {
  if (!("speechSynthesis" in window)) { done(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-IN"; u.rate = 1.1;
  u.onend = done; u.onerror = done;
  window.speechSynthesis.speak(u);
}

export async function speakAria(token: string, text: string, done: () => void = () => {}) {
  stopAria();
  const my = seq;
  let finished = false;
  // Roughly 2.6 words/sec plus slack for loading audio.
  const words = text.split(/\s+/).length;
  let watchdog = setTimeout(() => end(), 8000 + words * 450);
  const end = () => {
    clearTimeout(watchdog);
    if (!finished && my === seq) { finished = true; done(); }
  };
  const fallback = () => { if (my === seq && !finished) browserSpeak(text, end); };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch("/api/public/aria-voice", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, text }), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    clearTimeout(t);
    if (my !== seq) return;
    const audio = new Audio(URL.createObjectURL(blob));
    current = audio;
    audio.onended = end;
    audio.onerror = fallback;
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) { clearTimeout(watchdog); watchdog = setTimeout(() => end(), audio.duration * 1000 + 2500); }
    };
    // play() can be blocked by the browser's autoplay rules; then use the browser voice.
    await audio.play();
  } catch {
    fallback();
  }
}
