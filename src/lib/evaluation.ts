import { EVALUATION_COMPETENCIES } from "./interview-prompts";

/* ---------------- evaluation normalisers (pure) ---------------- */
type Comp = { key: string; name: string; score: number | null; assessed: boolean; evidence: string[]; strengths: string[]; weaknesses: string[]; missing_information: string[] };

/** Returns exactly one entry per required competency; a score without evidence is treated as not assessed. */
export function normaliseCompetencies(input: Comp[]): Comp[] {
  return EVALUATION_COMPETENCIES.map(({ key, name }) => {
    const c = input.find((x) => x.key === key);
    if (!c) return { key, name, score: null, assessed: false, evidence: [], strengths: [], weaknesses: [], missing_information: ["Not evaluated"] };
    const evidence = c.evidence.map((e) => e.trim()).filter(Boolean);
    const ok = c.assessed && c.score != null && evidence.length > 0;
    return { ...c, key, name: c.name || name, evidence, score: ok ? Math.round(c.score as number) : null, assessed: ok };
  });
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9₹ ]+/g, " ").replace(/\s+/g, " ").trim();
/** True when a red-flag quote (or its first 6 words) actually appears in what the candidate said. */
export function quoteInTranscript(quote: string, candidateText: string): boolean {
  const q = norm(quote.replace(/^["'“”]+|["'“”]+$/g, ""));
  const t = norm(candidateText);
  if (!q) return false;
  if (t.includes(q)) return true;
  const head = q.split(" ").slice(0, 6).join(" ");
  return head.split(" ").length >= 4 && t.includes(head);
}
