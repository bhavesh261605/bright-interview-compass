export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export class AIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function stripFences(s: string) {
  const t = s.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m?.[1]) return m[1];
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  return first >= 0 && last > first ? t.slice(first, last + 1) : t;
}

/**
 * Calls Google Gemini directly with the GEMINI_API_KEY secret
 * (model from GEMINI_MODEL or the app setting).
 */
export async function callAIJson(messages: ChatMsg[], model: string): Promise<unknown> {
  const geminiKey = process.env['GEMINI_API_KEY'];
  if (!geminiKey) throw new AIError(500, "GEMINI_API_KEY is not configured for this app.");
  const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  const headers: Record<string, string> = { Authorization: `Bearer ${geminiKey}`, "x-goog-api-key": geminiKey };
  const useModel = process.env['GEMINI_MODEL'] || model.replace(/^google\//, "");

  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, messages, response_format: { type: "json_object" } }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string };
      detail = j.error?.message || j.message || "";
    } catch {
      /* ignore */
    }
    if (res.status === 429) throw new AIError(429, "The AI is busy right now. Please wait a moment and retry.");
    if (res.status === 402) throw new AIError(402, detail || "AI credits are exhausted. Add credits to continue.");
    if (res.status === 401 || res.status === 403)
      throw new AIError(res.status, detail || "The AI key was rejected. Check the AI configuration.");
    throw new AIError(res.status, "The AI service failed to respond. Please retry.");
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AIError(502, "The AI returned an empty response.");
  try {
    return JSON.parse(stripFences(content));
  } catch {
    throw new AIError(502, "invalid_json");
  }
}
