import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  parseAnnotationPatch,
  parseBudgetInput,
  parseNote,
  parseTags,
} from "./validate";

describe("parseBudgetInput", () => {
  it("accepts a canonical category and rounds the target to cents", () => {
    expect(
      parseBudgetInput({ category: "Software/SaaS", monthly_target: 49.999 }),
    ).toEqual({
      ok: true,
      value: { category: "Software/SaaS", monthly_target: 50 },
    });
  });

  it.each([
    [{ category: "Groceries", monthly_target: 100 }, "Choose a valid category"],
    [{ monthly_target: 100 }, "Choose a valid category"],
    [{ category: "Misc", monthly_target: "100" }, "Monthly target must be a number"],
    [{ category: "Misc", monthly_target: Number.NaN }, "Monthly target must be a number"],
    [{ category: "Misc", monthly_target: 0 }, "Monthly target must be more than zero"],
    [{ category: "Misc", monthly_target: 0.004 }, "Monthly target must be more than zero"],
    [{ category: "Misc", monthly_target: -5 }, "Monthly target must be more than zero"],
    [{ category: "Misc", monthly_target: 1e12 }, "Monthly target must be at most 10,000,000"],
    [null, "Choose a valid category"],
    [["Misc", 10], "Choose a valid category"],
  ])("rejects %j", (body, error) => {
    expect(parseBudgetInput(body)).toEqual({ ok: false, error });
  });
});

describe("parseTags", () => {
  it("trims, lowercases, collapses spaces and dedupes in first-seen order", () => {
    expect(
      parseTags(["  Client A ", "client   a", "Tax-2026", "TRAVEL", "travel"]),
    ).toEqual({ ok: true, value: ["client a", "tax-2026", "travel"] });
  });

  it("accepts an empty list (clears tags) and non-English letters", () => {
    expect(parseTags([])).toEqual({ ok: true, value: [] });
    expect(parseTags(["Café", "réunion"])).toEqual({
      ok: true,
      value: ["café", "réunion"],
    });
  });

  it("allows exactly 10 tags of 24 characters", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(24, "x"));
    expect(parseTags(tags)).toEqual({ ok: true, value: tags });
  });

  it("counts the limit after deduplication", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag ${i}`);
    expect(parseTags([...tags, "TAG 0"]).ok).toBe(true);
  });

  it.each([
    ["not a list", "Tags must be a list"],
    [[1], "Each tag must be text"],
    [["ok", "   "], "Tags cannot be empty"],
    [["x".repeat(25)], "Tags can be at most 24 characters"],
    [["tax_2026"], "Tags can contain only letters, numbers, spaces and hyphens"],
    [["#urgent"], "Tags can contain only letters, numbers, spaces and hyphens"],
    [["<script>"], "Tags can contain only letters, numbers, spaces and hyphens"],
    [Array.from({ length: 11 }, (_, i) => `t${i}`), "Use at most 10 tags"],
  ])("rejects %j", (input, error) => {
    expect(parseTags(input)).toEqual({ ok: false, error });
  });
});

describe("parseNote", () => {
  it("trims, and clears on null or blank", () => {
    expect(parseNote("  Lunch with client  ")).toEqual({
      ok: true,
      value: "Lunch with client",
    });
    expect(parseNote(null)).toEqual({ ok: true, value: null });
    expect(parseNote("   ")).toEqual({ ok: true, value: null });
  });

  it("allows 500 characters and rejects 501", () => {
    expect(parseNote("n".repeat(MAX_NOTE_LENGTH)).ok).toBe(true);
    expect(parseNote("n".repeat(MAX_NOTE_LENGTH + 1))).toEqual({
      ok: false,
      error: "Notes can be at most 500 characters",
    });
  });

  it("rejects non-text", () => {
    expect(parseNote(42)).toEqual({ ok: false, error: "Note must be text" });
  });
});

describe("parseAnnotationPatch", () => {
  it("keeps only the fields that were sent", () => {
    expect(parseAnnotationPatch({ tags: ["A"] })).toEqual({
      ok: true,
      value: { tags: ["a"] },
    });
    expect(parseAnnotationPatch({ note: null })).toEqual({
      ok: true,
      value: { note: null },
    });
    expect(parseAnnotationPatch({ tags: [], note: "x", other: 1 })).toEqual({
      ok: true,
      value: { tags: [], note: "x" },
    });
  });

  it("requires at least one field and reports the first invalid one", () => {
    expect(parseAnnotationPatch({})).toEqual({
      ok: false,
      error: "Send tags or a note to update",
    });
    expect(parseAnnotationPatch(undefined).ok).toBe(false);
    expect(parseAnnotationPatch({ tags: "a", note: "ok" })).toEqual({
      ok: false,
      error: "Tags must be a list",
    });
  });
});
