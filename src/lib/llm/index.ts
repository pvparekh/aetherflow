// Provider-neutral JSON completion layer.
//
// Every model call in the app goes through `completeJson`. Providers are any
// OpenAI-compatible chat-completions endpoint: local Ollama (default for
// development and evals), Cloudflare Workers AI, or OpenAI. Only base URL,
// key and model change between them. See docs/leak-finder/01-architecture.md.
//
// Rules for callers:
// - Pass a JSON Schema that is valid under OpenAI strict mode: every object
//   has `additionalProperties: false` and lists every property in `required`
//   (use a nullable type instead of an optional property).
// - Always pass `validate`. Schema-constrained decoding is not guaranteed on
//   every provider, so the parsed value is untrusted until validated.
// - This layer makes exactly one attempt. Retry, batch splitting and
//   template fallbacks are the caller's policy (the failure ladder).
import OpenAI from "openai";

export type LlmTask = "categorize" | "extract" | "narrative" | "ask" | "draft";
export type LlmProvider = "ollama" | "openai" | "cloudflare" | "custom";

export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface JsonRequest<T> {
  task: LlmTask;
  system: string;
  user: string;
  schema: JsonSchema;
  validate: (value: unknown) => T;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmResult<T> {
  value: T;
  provider: LlmProvider;
  model: string;
  latencyMs: number;
}

export interface LlmConfig {
  provider: LlmProvider;
  baseURL: string;
  apiKey: string;
  model: string;
}

/** The provider could not be reached or rejected the request. Not retryable with the same config when `permanent`. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** The provider answered but the output was not valid JSON or failed validation. Retryable. */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

const OLLAMA_DEFAULT = "http://localhost:11434/v1";

function inferProvider(baseURL: string): LlmProvider {
  if (baseURL.includes("api.openai.com")) return "openai";
  if (baseURL.includes("cloudflare.com")) return "cloudflare";
  if (baseURL.includes("11434") || baseURL.includes("ollama")) return "ollama";
  return "custom";
}

/**
 * Resolution order:
 * 1. LLM_BASE_URL / LLM_API_KEY / LLM_MODEL (+ optional LLM_MODEL_<TASK>, LLM_PROVIDER)
 * 2. Legacy: OPENAI_API_KEY alone selects OpenAI with gpt-4o-mini.
 * 3. Otherwise local Ollama with qwen3.5:9b.
 */
export function llmConfig(
  task?: LlmTask,
  env: Record<string, string | undefined> = process.env,
): LlmConfig {
  const taskModel = task ? env[`LLM_MODEL_${task.toUpperCase()}`] : undefined;
  if (env.LLM_BASE_URL) {
    const baseURL = env.LLM_BASE_URL;
    return {
      provider: (env.LLM_PROVIDER as LlmProvider) || inferProvider(baseURL),
      baseURL,
      apiKey: env.LLM_API_KEY || "not-needed",
      model: taskModel || env.LLM_MODEL || "qwen3.5:9b",
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
      model: taskModel || env.LLM_MODEL || "gpt-4o-mini",
    };
  }
  return {
    provider: "ollama",
    baseURL: OLLAMA_DEFAULT,
    apiKey: "ollama",
    model: taskModel || env.LLM_MODEL || "qwen3.5:9b",
  };
}

const clients = new Map<string, OpenAI>();
function client(config: LlmConfig): OpenAI {
  const key = `${config.baseURL}|${config.apiKey}`;
  let c = clients.get(key);
  if (!c) {
    c = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      maxRetries: 0,
    });
    clients.set(key, c);
  }
  return c;
}

/** Remove reasoning blocks and code fences some local models emit around JSON. */
export function extractJsonText(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.search(/[[{]/);
  if (start > 0) text = text.slice(start);
  return text;
}

const PERMANENT_CODES = new Set([
  "invalid_api_key",
  "billing_not_active",
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_usage_limit_exceeded",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "model_not_found",
]);

function toUnavailable(error: unknown): LlmUnavailableError {
  const e = (error ?? {}) as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  const status = typeof e.status === "number" ? e.status : undefined;
  const code = typeof e.code === "string" ? e.code : undefined;
  const permanent =
    (code !== undefined && PERMANENT_CODES.has(code)) ||
    status === 401 ||
    status === 403 ||
    status === 404;
  const label = e.name === "APIConnectionError" || e.name === "APIConnectionTimeoutError"
    ? "Model provider is not reachable"
    : "Model provider rejected the request";
  return new LlmUnavailableError(
    [label, status, code].filter(Boolean).join(": "),
    permanent,
    status,
    code,
  );
}

/**
 * The chat-completions body for a request. Exported for tests.
 *
 * Cloudflare Workers AI documents JSON mode with the bare schema under
 * `json_schema` (no OpenAI `name`/`strict` wrapper), so it gets that shape.
 */
export function requestBody<T>(request: JsonRequest<T>, config: LlmConfig): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    temperature: 0,
    seed: 7,
    max_tokens: request.maxTokens ?? 2000,
    response_format:
      config.provider === "cloudflare"
        ? { type: "json_schema", json_schema: request.schema.schema }
        : {
            type: "json_schema",
            json_schema: {
              name: request.schema.name,
              schema: request.schema.schema,
              strict: true,
            },
          },
  };
  // Qwen 3.5 and Gemma 4 think by default on Ollama; thinking consumes the
  // output budget and is unnecessary for constrained JSON.
  if (config.provider === "ollama") body.reasoning_effort = "none";
  return body;
}

/**
 * A provider that enforces the schema server-side may refuse output it cannot
 * fit ("JSON Mode couldn't be met" on Workers AI). That is bad output for this
 * request, not an outage, so callers' retry ladders should handle it.
 */
export function isSchemaRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /json mode couldn'?t be met/i.test(message);
}

export async function completeJson<T>(
  request: JsonRequest<T>,
  config: LlmConfig = llmConfig(request.task),
): Promise<LlmResult<T>> {
  const started = Date.now();
  const body = requestBody(request, config);

  let content: string | null | undefined;
  try {
    const response = await client(config).chat.completions.create(
      body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { timeout: request.timeoutMs ?? 30000 },
    );
    content = response.choices[0]?.message?.content;
  } catch (error) {
    if (isSchemaRefusal(error)) throw new LlmOutputError("Model could not produce output matching the schema");
    throw toUnavailable(error);
  }
  if (!content) throw new LlmOutputError("Model returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(content));
  } catch {
    throw new LlmOutputError("Model output was not valid JSON");
  }
  let value: T;
  try {
    value = request.validate(parsed);
  } catch (error) {
    throw new LlmOutputError(
      `Model output failed validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    value,
    provider: config.provider,
    model: config.model,
    latencyMs: Date.now() - started,
  };
}

export interface LlmStatus {
  provider: LlmProvider;
  model: string;
  reachable: boolean;
}

/** Cheap reachability probe for status displays; never throws. */
export async function llmStatus(
  config: LlmConfig = llmConfig(),
): Promise<LlmStatus> {
  try {
    await client(config).models.list({ timeout: 3000 });
    return { provider: config.provider, model: config.model, reachable: true };
  } catch {
    return { provider: config.provider, model: config.model, reachable: false };
  }
}
