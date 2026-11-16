import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { JsonRequest } from "@/lib/llm";
import { DEFAULT_OPTIONS } from "./contract";

const completeJson = vi.hoisted(() => vi.fn());
const visualProvider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  completeJson,
}));
vi.mock("openai", () => ({
  default: class {
    responses = { create: visualProvider };
  },
}));

import { LlmOutputError, LlmUnavailableError } from "@/lib/llm";
import { parsePdfReview } from "./pdf";

// Behaves like completeJson: the caller's validator decides.
function extraction(transactions: unknown[]) {
  return async (request: JsonRequest<unknown>) => {
    try {
      return { value: request.validate({ transactions, warnings: [] }) };
    } catch (error) {
      throw new LlmOutputError(String(error));
    }
  };
}
const rows = [
  {
    description: "Figma",
    amount: 45,
    date: "2026-10-01",
    kind: "expense",
    page: 1,
    evidence: "2026-10-01 Figma $45.00",
  },
  {
    description: "Adobe",
    amount: 59.99,
    date: "2026-10-01",
    kind: "expense",
    page: 2,
    evidence: "2026-10-01 Adobe $59.99",
  },
];
const native = () => readFileSync("src/lib/imports/fixtures/native-statement.pdf");
const sparse = () => readFileSync("src/lib/imports/fixtures/sparse-statement.pdf");

describe("PDF transport and source validation (provider mocked, no OCR accuracy claim)", () => {
  beforeEach(() => {
    completeJson.mockReset();
    visualProvider.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads all native pages and keeps page evidence with every row unselected", async () => {
    completeJson.mockImplementation(extraction(rows));
    const r = await parsePdfReview(native(), "statement.pdf", DEFAULT_OPTIONS);
    expect(r.pages).toBe(2);
    expect(r.rows.map((r) => r.page)).toEqual([1, 2]);
    expect(r.rows.every((r) => !r.included)).toBe(true);
    const request = completeJson.mock.calls[0][0];
    expect(request.task).toBe("extract");
    expect(request.user).toContain("PAGE 2");
    expect(request.schema.schema.required).toEqual(["transactions", "warnings"]);
  });

  it("routes sparse/mixed pages through visual PDF input when the provider is OpenAI", async () => {
    vi.stubEnv("LLM_BASE_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    visualProvider.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({ transactions: [rows[0]], warnings: [] }),
    });
    const r = await parsePdfReview(sparse(), "scan.pdf", DEFAULT_OPTIONS);
    expect(r.method).toContain("Visual");
    expect(visualProvider.mock.calls[0][0].input[0].content[0].type).toBe("input_file");
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("asks for a CSV or text PDF when a scanned PDF meets a provider without file input", async () => {
    vi.stubEnv("LLM_BASE_URL", "http://localhost:11434/v1");
    await expect(parsePdfReview(sparse(), "scan.pdf", DEFAULT_OPTIONS)).rejects.toThrow(
      "Export a CSV from your bank or use a text PDF",
    );
    expect(visualProvider).not.toHaveBeenCalled();
  });

  it("rejects unmatched source evidence, invalid output, invalid files and invalid amounts", async () => {
    completeJson.mockImplementation(extraction([{ ...rows[0], evidence: "Invented vendor" }]));
    await expect(parsePdfReview(native(), "a.pdf", DEFAULT_OPTIONS)).rejects.toThrow("matched");
    completeJson.mockRejectedValue(new LlmOutputError("Model output was not valid JSON"));
    await expect(parsePdfReview(native(), "a.pdf", DEFAULT_OPTIONS)).rejects.toThrow(
      "invalid transaction records or stopped early",
    );
    await expect(
      parsePdfReview(Buffer.from("not a pdf"), "a.pdf", DEFAULT_OPTIONS),
    ).rejects.toThrow("valid PDF");
    completeJson.mockImplementation(extraction([{ ...rows[0], amount: 1.234 }]));
    await expect(parsePdfReview(native(), "a.pdf", DEFAULT_OPTIONS)).rejects.toThrow(
      "invalid transaction records",
    );
  });

  it("rejects a row that names a page the model was not shown", async () => {
    completeJson.mockImplementation(extraction([{ ...rows[0], page: 7 }]));
    await expect(parsePdfReview(native(), "a.pdf", DEFAULT_OPTIONS)).rejects.toThrow(
      "invalid transaction records",
    );
  });

  it("explains an unreachable model without leaking provider details", async () => {
    vi.stubEnv("LLM_BASE_URL", "http://localhost:11434/v1");
    completeJson.mockRejectedValue(new LlmUnavailableError("Model provider is not reachable", false));
    await expect(parsePdfReview(native(), "a.pdf", DEFAULT_OPTIONS)).rejects.toThrow(
      "Start Ollama (ollama serve) and retry. Nothing was imported.",
    );
  });
});
