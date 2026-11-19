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
 * Calls Gemini. If a GEMINI_API_KEY secret is set, it calls Google directly
 * (model from GEMINI_MODEL or the app setting); otherwise Lovable's AI gateway.
 */
export async function callAIJson(messages: ChatMsg[], model: string): Promise<unknown> {
  const geminiKey = process.env['GEMINI_API_KEY'];
  let url: string;
  let headers: Record<string, string>;
  let useModel = model;
  if (geminiKey) {
    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    headers = { Authorization: `Bearer ${geminiKey}` };
    useModel = process.env['GEMINI_MODEL'] || model.replace(/^google\//, "");
  } else {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new AIError(500, "AI is not configured for this app.");
    url = "https://ai.gateway.lovable.dev/v1/chat/completions";
    headers = { Authorization: `Bearer ${key}`, "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" };
  }

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
