import { describe, expect, it } from "vitest";
import { computeSalaryAlignment, salaryNeedsHumanReview } from "./salary";
import { findProhibitedTopic } from "./guardrails";
import { passThroughRate } from "./labels";

const band = { minimum_salary: 400000, maximum_salary: 600000 };

describe("salary alignment", () => {
  it("within band", () => expect(computeSalaryAlignment(500000, band)).toBe("within_band"));
  it("band edges are within", () => {
    expect(computeSalaryAlignment(400000, band)).toBe("within_band");
    expect(computeSalaryAlignment(600000, band)).toBe("within_band");
  });
  it("below band", () => expect(computeSalaryAlignment(399999, band)).toBe("below_band"));
  it("above band", () => expect(computeSalaryAlignment(700000, band)).toBe("above_band"));
  it("no band configured", () => expect(computeSalaryAlignment(500000, null)).toBe("band_not_configured"));
  it("unknown expectation needs review", () => expect(computeSalaryAlignment(null, band)).toBe("pending_review"));
  it("out-of-band requires human review", () => {
    expect(salaryNeedsHumanReview("above_band")).toBe(true);
    expect(salaryNeedsHumanReview("below_band")).toBe(true);
    expect(salaryNeedsHumanReview("within_band")).toBe(false);
  });
});

describe("prohibited question filter", () => {
  it("blocks age", () => expect(findProhibitedTopic("How old are you?")).toBe("age"));
  it("blocks religion", () => expect(findProhibitedTopic("What is your religion?")).toBe("religion"));
  it("blocks marital status", () => expect(findProhibitedTopic("Are you married?")).toBe("marital status"));
  it("blocks family status", () => expect(findProhibitedTopic("Do you have children?")).toBe("family status"));
  it("allows job questions", () => expect(findProhibitedTopic("Tell me about a project you led and your personal contribution.")).toBeNull());
});

describe("pass-through rate", () => {
  it("uses only recorded outcomes", () => expect(passThroughRate(["progressed", "not_progressed", null, "progressed"])).toBeCloseTo(66.67, 1));
  it("is null without outcomes", () => expect(passThroughRate([null, undefined])).toBeNull());
});
