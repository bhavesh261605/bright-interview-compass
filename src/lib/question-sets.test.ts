import { describe, expect, it } from "vitest";
import { getTurnPolicy, isOrderedTurn, QUESTION_SETS, SECTIONS } from "./interview-prompts";
import { findProhibitedTopic } from "./guardrails";

describe("question sets", () => {
  it("verifies background and availability before assessment, STAR projects and salary", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(["introduction", "background", "availability", "motivation", "collaboration", "competency", "projects", "salary", "closing"]);
  });
  it("cannot skip availability or jump back to earlier questions", () => {
    expect(isOrderedTurn(getTurnPolicy("background", 1), { section: "motivation", interview_complete: false })).toBe(false);
    expect(isOrderedTurn(getTurnPolicy("salary", 1), { section: "projects", interview_complete: false })).toBe(false);
    expect(isOrderedTurn(getTurnPolicy("background", 1), { section: "availability", interview_complete: false })).toBe(true);
  });
  it("does not complete before closing has been answered", () => {
    expect(isOrderedTurn(getTurnPolicy("salary", 1), { section: "closing", interview_complete: true })).toBe(false);
    expect(isOrderedTurn(getTurnPolicy("closing", 0), { section: "closing", interview_complete: true })).toBe(false);
    expect(isOrderedTurn(getTurnPolicy("closing", 1), { section: "closing", interview_complete: true })).toBe(true);
  });
  it("moves forward after a question and two follow-ups", () => {
    expect(getTurnPolicy("projects", 3).allowedSections).toEqual(["salary"]);
  });
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
