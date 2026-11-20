import { createClient } from "../../../utils/supabase/server";
import { createServiceClient } from "../../../utils/supabase/service";
import { NextResponse } from "next/server";
import { llmConfig, LlmUnavailableError, type LlmConfig } from "@/lib/llm";

export async function importAccess() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  return user ? { user, db: createServiceClient() } : null;
}

type FailureDetail = {
  error: string;
  status: number;
  diagnostic: string;
};

export type ModelFailure = { message: string; status: number };

const QUOTA_CODES = new Set([
  "insufficient_quota",
  "organization_usage_limit_exceeded",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "credit_balance_exhausted",
]);

// OpenAI SDK error classes, still thrown by features not yet moved to @/lib/llm.
const SDK_ERROR_NAMES =
  /^(APIError|AuthenticationError|PermissionDeniedError|RateLimitError|NotFoundError|BadRequestError|InternalServerError|APIConnectionError|APIConnectionTimeoutError)$/;

function errorFields(error: unknown) {
  const obj =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof obj.name === "string"
          ? obj.name
          : "unknown",
    status: typeof obj.status === "number" ? obj.status : 0,
    code: typeof obj.code === "string" ? obj.code : "",
    type: typeof obj.type === "string" ? obj.type : "",
    message: error instanceof Error ? error.message : "",
  };
}

function unreachableMessage(config: LlmConfig): string {
  return config.provider === "ollama"
    ? `The local model server at ${config.baseURL} is not reachable. Start Ollama (ollama serve) and retry.`
    : "The model provider could not be reached. Retry shortly.";
}

function missingModelMessage(config: LlmConfig): string {
  return config.provider === "ollama"
    ? `The model "${config.model}" is not installed in Ollama. Run "ollama pull ${config.model}" and retry.`
    : `The model "${config.model}" is not available from the configured provider. Check LLM_MODEL and model access.`;
}

/**
 * Plain-English explanation of a model-provider failure, or null when the
 * error did not come from a model provider. Callers add what is safe ("your
 * review is saved", "nothing was imported").
 */
export function modelFailure(
  error: unknown,
  config: LlmConfig = llmConfig(),
): ModelFailure | null {
  const { name, status, code, type } = errorFields(error);
  const exhausted = QUOTA_CODES.has(code) || type === "insufficient_quota";
  const fromProvider =
    error instanceof LlmUnavailableError ||
    SDK_ERROR_NAMES.test(name) ||
    exhausted ||
    code === "invalid_api_key";
  if (!fromProvider) return null;

  const unreachable =
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    (error instanceof LlmUnavailableError && !status && !code);
  if (unreachable) return { message: unreachableMessage(config), status: 503 };
  if (code === "billing_not_active")
    return {
      message:
        "The model provider account has no active billing. Activate billing, or point LLM_BASE_URL at another provider such as a local Ollama.",
      status: 503,
    };
  if (status === 401 || code === "invalid_api_key")
    return {
      message:
        "The model provider rejected the configured API key. Check LLM_API_KEY (or OPENAI_API_KEY) for this deployment.",
      status: 503,
    };
  if (exhausted)
    return {
      message:
        "Model provider credits or spending limits are exhausted. Check billing and project limits before retrying.",
      status: 503,
    };
  if (status === 403)
    return {
      message:
        "The model provider denied access to the configured model. Check the API project's permissions.",
      status: 503,
    };
  if (status === 404 || code === "model_not_found")
    return { message: missingModelMessage(config), status: 503 };
  if (status === 429)
    return {
      message:
        "The model provider is rate-limiting requests. Retry after the rate limit clears.",
      status: 429,
    };
  if (status === 400)
    return {
      message: `The model provider rejected the request for model "${config.model}". Check LLM_MODEL and LLM_BASE_URL for this deployment; your review is unchanged.`,
      status: 503,
    };
  return {
    message: "The model provider is unavailable. Retry shortly.",
    status: 503,
  };
}

const PHASE_MESSAGES: Record<string, string> = {
  claim: "The saved import could not start processing. Review its state and retry.",
  rules:
    "Your merchant rules and category history could not be loaded. Your review is saved; retry.",
  categorization:
    "AI categorization failed before any expenses were published. Your review is saved. Check the model provider settings, then retry.",
  publication:
    "The database rejected the reviewed expense publication. No complete report was published. Your review is saved.",
  statistics:
    "Expense rows were saved, but statistical computation failed. Resume the saved import to finish safely.",
  vendors:
    "Expense statistics were saved, but vendor analysis failed. Resume to complete the report.",
  finalization:
    "The expense report could not be finalized. Your import progress is saved and can be resumed.",
};

export function classifyImportFailure(error: unknown, phase?: string): FailureDetail {
  const { name, status, code, message } = errorFields(error);
  const diagnostic = [name, status || null, code || null]
    .filter((v) => v !== null)
    .join(":")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 100);

  if (message.includes("OPENAI_API_KEY environment variable is not set")) {
    return {
      error:
        "AI categorization is not configured for this deployment. Set OPENAI_API_KEY in the Vercel Preview environment and redeploy, then resume your saved review.",
      status: 503,
      diagnostic: "openai_key_missing",
    };
  }

  const provider = modelFailure(error);
  if (provider)
    return {
      error: `${provider.message} Your review is saved.`,
      status: provider.status,
      diagnostic,
    };

  if (["PGRST202", "42P01", "42883", "42703"].includes(code))
    return {
      error:
        "The configured database is missing a required import table, column or function. Verify that this deployment points to the migrated Supabase project.",
      status: 503,
      diagnostic,
    };

  return {
    error:
      (phase && PHASE_MESSAGES[phase]) ||
      "Expense processing failed. Your saved review is intact. Check the server logs for this request before retrying.",
    status: 503,
    diagnostic,
  };
}

export function importFailure(error: unknown, phase?: string) {
  const failure = classifyImportFailure(error, phase);
  // Deliberately log only class/status/provider code, never prompt contents,
  // API credentials, statement evidence, or provider response bodies.
  console.error("[import] operation_failed", failure.diagnostic);
  return NextResponse.json(
    { error: failure.error },
    { status: failure.status },
  );
}
