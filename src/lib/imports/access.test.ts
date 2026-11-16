import { describe, expect, it } from "vitest";
import { LlmUnavailableError, type LlmConfig } from "@/lib/llm";
import { classifyImportFailure, modelFailure } from "./access";

const OLLAMA: LlmConfig = {
  provider: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  model: "qwen3.5:9b",
};

function providerError(name: string, status: number, code?: string, type?: string) {
  return Object.assign(new Error("Provider request failed"), { name, status, code, type });
}

describe("import failure classification", () => {
  it("identifies a missing preview credential without exposing secrets", () => {
    const result = classifyImportFailure(new Error("OPENAI_API_KEY environment variable is not set"));
    expect(result.error).toContain("Vercel Preview");
    expect(result.diagnostic).toBe("openai_key_missing");
    expect(result.error).not.toContain("sk-");
  });

  it("identifies rejected API keys", () => {
    const result = classifyImportFailure(providerError("AuthenticationError", 401, "invalid_api_key"));
    expect(result.error).toContain("API key");
    expect(result.error).toContain("rejected");
  });

  it.each([
    "insufficient_quota",
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
  ])("distinguishes quota error %s from rate limiting", (code) => {
    const result = classifyImportFailure(providerError("RateLimitError", 429, code));
    expect(result.error).toContain("credits or spending limits");
  });

  it("classifies true rate limiting as retryable", () => {
    const result = classifyImportFailure(providerError("RateLimitError", 429));
    expect(result.status).toBe(429);
    expect(result.error).toContain("rate-limiting");
  });

  it("distinguishes missing RPCs from OpenAI failures", () => {
    const result = classifyImportFailure({ code: "PGRST202", message: "Missing RPC" });
    expect(result.error).toContain("database");
    expect(result.error).toContain("Supabase");
  });

  it("identifies which stage failed when the provider error is otherwise unknown", () => {
    const result = classifyImportFailure(new TypeError("private provider body"), "categorization");
    expect(result.error).toContain("AI categorization failed");
    expect(result.error).toContain("before any expenses were published");
    expect(result.error).not.toContain("private provider body");
  });

  it("separates persistence from AI categorization failures", () => {
    const result = classifyImportFailure(new Error("some private SQL text"), "publication");
    expect(result.error).toContain("database rejected");
    expect(result.error).not.toContain("private SQL text");
  });

  it("explains an inactive billing account from the model layer", () => {
    const result = classifyImportFailure(
      new LlmUnavailableError("Model provider rejected the request: 429: billing_not_active", true, 429, "billing_not_active"),
      "categorization",
    );
    expect(result.error).toContain("no active billing");
    expect(result.error).toContain("review is saved");
    expect(result.diagnostic).toBe("LlmUnavailableError:429:billing_not_active");
  });

  it("tells the user to start a local model that is not reachable", () => {
    const unreachable = new LlmUnavailableError("Model provider is not reachable", false);
    expect(modelFailure(unreachable, OLLAMA)?.message).toContain(
      "http://localhost:11434/v1 is not reachable. Start Ollama",
    );
    expect(modelFailure(unreachable, { ...OLLAMA, provider: "cloudflare" })?.message).toContain(
      "could not be reached",
    );
  });

  it("names the missing model and how to install it", () => {
    const missing = new LlmUnavailableError("Model provider rejected the request: 404", true, 404, "model_not_found");
    expect(modelFailure(missing, OLLAMA)?.message).toContain('ollama pull qwen3.5:9b');
  });

  it("does not treat database or programming errors as model failures", () => {
    expect(modelFailure(new TypeError("boom"), OLLAMA)).toBeNull();
    expect(modelFailure({ code: "42P01" }, OLLAMA)).toBeNull();
  });

  it("does not expose raw unknown error bodies", () => {
    const result = classifyImportFailure(new Error("Sensitive statement details"));
    expect(result.error).toContain("server logs");
    expect(result.error).not.toContain("Sensitive");
  });
});
