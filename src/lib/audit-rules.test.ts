import { describe, expect, it } from "vitest";
import { findProhibitedTopic } from "./guardrails";
import { normaliseCompetencies, quoteInTranscript } from "./evaluation";
import { EVALUATION_COMPETENCIES } from "./interview-prompts";

describe("prohibited questions (audit cases)", () => {
  it("blocks DOB", () => expect(findProhibitedTopic("What is your DOB?")).toBe("age"));
  it("blocks son or daughter", () => expect(findProhibitedTopic("Do you have a son or daughter?")).toBe("family status"));
  it("allows stakeholder engagement", () =>
    expect(findProhibitedTopic("How did you keep stakeholders engaged during the project?")).toBeNull());
  it("still blocks engagement status", () => expect(findProhibitedTopic("Are you engaged?")).toBe("marital status"));
});

describe("evaluation normalisation", () => {
  it("returns every required competency", () => {
    const out = normaliseCompetencies([]);
    expect(out.map((c) => c.key)).toEqual(EVALUATION_COMPETENCIES.map((c) => c.key));
    expect(out.every((c) => !c.assessed && c.score === null)).toBe(true);
  });
  it("drops a score that has no evidence", () => {
    const out = normaliseCompetencies([
      { key: "communication", name: "C", score: 4, assessed: true, evidence: [], strengths: [], weaknesses: [], missing_information: [] },
    ]);
    expect(out.find((c) => c.key === "communication")?.score).toBeNull();
  });
  it("keeps an evidenced score", () => {
    const out = normaliseCompetencies([
      { key: "communication", name: "C", score: 4, assessed: true, evidence: ["I led the demo"], strengths: [], weaknesses: [], missing_information: [] },
    ]);
    expect(out.find((c) => c.key === "communication")?.score).toBe(4);
  });
});

describe("red flag quotes", () => {
  const said = "I built the whole checkout service alone, nobody else helped me at all.";
  it("matches a real quote", () => expect(quoteInTranscript('"nobody else helped me at all"', said)).toBe(true));
  it("rejects an invented quote", () => expect(quoteInTranscript("I lied on my resume", said)).toBe(false));
});
