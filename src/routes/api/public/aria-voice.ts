import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Aria's ElevenLabs voice (Sarah: warm, clear, professional). Turbo model for low latency.
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const Body = z.object({ token: z.string().min(8).max(200), text: z.string().min(1).max(1500) });

export const Route = createFileRoute("/api/public/aria-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const key = process.env["ELEVENLABS_API_KEY"];
        if (!key) return new Response("Voice not configured", { status: 503 });
        // Only callers holding a live interview link may use the voice.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: iv } = await supabaseAdmin
          .from("interviews").select("id, expires_at, revoked_at")
          .eq("invite_token", parsed.data.token).maybeSingle();
        const ok = iv && !iv.revoked_at && (!iv.expires_at || new Date(iv.expires_at).getTime() > Date.now());
        if (!ok) return new Response("Forbidden", { status: 403 });
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: parsed.data.text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.08 },
          }),
        });
        if (!r.ok || !r.body) {
          console.error(`ElevenLabs TTS failed [${r.status}]: ${await r.text().catch(() => "")}`);
          return new Response("Voice unavailable", { status: 502 });
        }
        return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
      },
    },
  },
});
