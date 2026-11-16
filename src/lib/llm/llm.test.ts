import { describe, expect, it } from "vitest";
import { extractJsonText, llmConfig } from "./index";

describe("llmConfig", () => {
  it("defaults to local Ollama with qwen3.5:9b", () => {
    expect(llmConfig("categorize", {})).toEqual({
      provider: "ollama",
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
      model: "qwen3.5:9b",
    });
  });

  it("keeps the legacy OpenAI key working", () => {
    const c = llmConfig("narrative", { OPENAI_API_KEY: "k" });
    expect(c.provider).toBe("openai");
    expect(c.model).toBe("gpt-4o-mini");
  });

  it("prefers explicit LLM settings and per-task models", () => {
    const c = llmConfig("narrative", {
      OPENAI_API_KEY: "ignored",
      LLM_BASE_URL: "https://api.cloudflare.com/client/v4/accounts/x/ai/v1",
      LLM_API_KEY: "cf",
      LLM_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
      LLM_MODEL_NARRATIVE: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    });
    expect(c.provider).toBe("cloudflare");
    expect(c.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });
});

describe("extractJsonText", () => {
  it("strips reasoning blocks and code fences", () => {
    expect(
      extractJsonText('<think>hmm</think>\n```json\n{"a":1}\n```'),
    ).toBe('{"a":1}');
  });
  it("drops leading prose", () => {
    expect(extractJsonText('Sure! {"a":1}')).toBe('{"a":1}');
  });
});
