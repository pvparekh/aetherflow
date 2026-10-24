import { createClient } from "../../../utils/supabase/server";
import { createServiceClient } from "../../../utils/supabase/service";
import { NextResponse } from "next/server";

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

export function classifyImportFailure(error: unknown): FailureDetail {
  const obj =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const name =
    error instanceof Error
      ? error.name
      : typeof obj.name === "string"
        ? obj.name
        : "unknown";
  const status = typeof obj.status === "number" ? obj.status : 0;
  const code = typeof obj.code === "string" ? obj.code : "";
  const type = typeof obj.type === "string" ? obj.type : "";
  const quotaCodes = new Set([
    "insufficient_quota",
    "organization_usage_limit_exceeded",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "credit_balance_exhausted",
  ]);
  const exhausted = quotaCodes.has(code) || type === "insufficient_quota";
  const message = error instanceof Error ? error.message : "";

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

  const provider =
    /^(APIError|AuthenticationError|PermissionDeniedError|RateLimitError|NotFoundError|BadRequestError|InternalServerError|APIConnectionError|APIConnectionTimeoutError)$/.test(
      name,
    ) || exhausted || code === "invalid_api_key";
  if (provider) {
    if (status === 401 || code === "invalid_api_key")
      return {
        error:
          "The OpenAI API key configured for this deployment was rejected. Verify its Vercel Preview setting and redeploy; your review is saved.",
        status: 503,
        diagnostic,
      };
    if (status === 403)
      return {
        error:
          "The configured OpenAI project cannot access the categorization model. Check the API project's permissions; your review is saved.",
        status: 503,
        diagnostic,
      };
    if (exhausted)
      return {
        error:
          "OpenAI API credits or spending limits are exhausted. Check billing and project limits before retrying; your review is saved.",
        status: 503,
        diagnostic,
      };
    if (status === 429)
      return {
        error:
          "OpenAI is rate-limiting categorization. Your review is saved; retry after the rate limit clears.",
        status: 429,
        diagnostic,
      };
    if (status === 404)
      return {
        error:
          "The configured OpenAI categorization model was not found or is unavailable to this API project. Check model access; your review is saved.",
        status: 503,
        diagnostic,
      };
    if (status === 400)
      return {
        error:
          "OpenAI rejected the categorization request. The saved review is intact; check the model/API configuration and server diagnostics.",
        status: 503,
        diagnostic,
      };
    return {
      error:
        "The OpenAI categorization service is unavailable. Your saved review can be resumed without uploading the file again.",
      status: 503,
      diagnostic,
    };
  }

  if (
    ["PGRST202", "42P01", "42883", "42703"].includes(code)
  )
    return {
      error:
        "The configured database is missing a required import table, column or function. Verify that this deployment points to the migrated Supabase project.",
      status: 503,
      diagnostic,
    };

  if (
    message.includes("Categorization returned invalid output.")
  )
    return {
      error:
        "AI categorization returned invalid data. Your saved review is intact; retry categorization.",
      status: 503,
      diagnostic,
    };

  return {
    error:
      "Expense processing failed. Your saved review is intact. Check the server logs for this request before retrying.",
    status: 503,
    diagnostic,
  };
}

export function importFailure(error: unknown) {
  const failure = classifyImportFailure(error);
  // Deliberately log only class/status/provider code, never prompt contents,
  // API credentials, statement evidence, or provider response bodies.
  console.error("[import] operation_failed", failure.diagnostic);
  return NextResponse.json(
    { error: failure.error },
    { status: failure.status },
  );
}
