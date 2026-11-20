import { describe, expect, it } from "vitest";
import { extractJsonText, isSchemaRefusal, llmConfig, requestBody, type LlmConfig } from "./index";

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

describe("requestBody", () => {
  const request = {
    task: "categorize" as const,
    system: "s",
    user: "u",
    schema: { name: "items", schema: { type: "object" } },
    validate: (v: unknown) => v,
  };
  const config = (provider: LlmConfig["provider"]): LlmConfig => ({ provider, baseURL: "x", apiKey: "k", model: "m" });

  it("uses OpenAI's strict json_schema wrapper by default", () => {
    expect(requestBody(request, config("openai")).response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "items", schema: { type: "object" }, strict: true },
    });
  });
  it("sends the bare schema to Cloudflare Workers AI", () => {
    expect(requestBody(request, config("cloudflare")).response_format).toEqual({
      type: "json_schema",
      json_schema: { type: "object" },
    });
  });
  it("turns off thinking only on Ollama", () => {
    expect(requestBody(request, config("ollama")).reasoning_effort).toBe("none");
    expect(requestBody(request, config("cloudflare")).reasoning_effort).toBeUndefined();
  });
  it("treats a schema refusal as bad output, not an outage", () => {
    expect(isSchemaRefusal(new Error("400 JSON Mode couldn't be met"))).toBe(true);
    expect(isSchemaRefusal(new Error("401 Unauthorized"))).toBe(false);
  });
});
