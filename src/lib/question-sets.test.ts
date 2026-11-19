import { describe, expect, it } from "vitest";
import { QUESTION_SETS, SECTIONS } from "./interview-prompts";
import { findProhibitedTopic } from "./guardrails";

describe("question sets", () => {
  it("freshers and experienced candidates get different questions", () => {
    expect(QUESTION_SETS.fresher.background).not.toEqual(QUESTION_SETS.experienced.background);
    expect(QUESTION_SETS.fresher.projects).not.toEqual(QUESTION_SETS.experienced.projects);
  });
  it("every section has questions for both categories", () => {
    for (const s of SECTIONS) {
      expect(QUESTION_SETS.fresher[s.key].length).toBeGreaterThan(0);
      expect(QUESTION_SETS.experienced[s.key].length).toBeGreaterThan(0);
    }
  });
  it("project questions are STAR-style", () => {
    expect(QUESTION_SETS.fresher.projects.join(" ")).toMatch(/situation.*task.*action.*result/i);
    expect(QUESTION_SETS.experienced.projects.join(" ")).toMatch(/situation.*task.*action.*result/i);
  });
  it("no bank question touches a prohibited topic", () => {
    for (const cat of ["fresher", "experienced"] as const)
      for (const qs of Object.values(QUESTION_SETS[cat])) for (const q of qs) expect(findProhibitedTopic(q)).toBeNull();
  });
});
