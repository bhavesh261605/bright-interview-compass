// Browser helper: plays Aria's ElevenLabs voice, falling back to the browser voice if it fails.
let current: HTMLAudioElement | null = null;
let seq = 0;

export function stopAria() {
  seq++;
  if (current) { current.pause(); current.src = ""; current = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function browserSpeak(text: string, done: () => void) {
  if (!("speechSynthesis" in window)) { done(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-IN"; u.rate = 1.1;
  u.onend = done; u.onerror = done;
  window.speechSynthesis.speak(u);
}

export async function speakAria(token: string, text: string, done: () => void = () => {}) {
  stopAria();
  const my = seq;
  let finished = false;
  const end = () => { if (!finished && my === seq) { finished = true; done(); } };
  try {
    const r = await fetch("/api/public/aria-voice", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, text }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    if (my !== seq) return;
    const audio = new Audio(URL.createObjectURL(blob));
    current = audio;
    audio.onended = end;
    audio.onerror = () => { if (my === seq) browserSpeak(text, end); };
    await audio.play();
  } catch {
    if (my === seq) browserSpeak(text, end);
  }
}
