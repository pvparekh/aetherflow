// Shared policy for model-written text: generate, check faithfulness, allow
// one regeneration with the problems fed back, then give up so the caller
// can use its template. A provider outage is not retried.
import { completeJson, LlmUnavailableError, type JsonRequest } from "@/lib/llm";
import type { FaithfulnessResult } from "./faithfulness";

export const MAX_ATTEMPTS = 2;

export interface CheckedRequest<T> extends Omit<JsonRequest<T>, "user"> {
  /** Builds the user message; `feedback` lists problems with the previous attempt. */
  user: (feedback: string[]) => string;
  check: (value: T) => FaithfulnessResult;
}

export type CheckedOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; reason: "unavailable" | "unfaithful" | "invalid"; attempts: number };

export async function generateChecked<T>(request: CheckedRequest<T>): Promise<CheckedOutcome<T>> {
  const { user, check, ...rest } = request;
  let feedback: string[] = [];
  let reason: "unfaithful" | "invalid" = "invalid";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let value: T;
    try {
      ({ value } = await completeJson({ ...rest, user: user(feedback) }));
    } catch (error) {
      if (error instanceof LlmUnavailableError) return { ok: false, reason: "unavailable", attempts: attempt };
      reason = "invalid";
      feedback = ["The previous answer did not match the required JSON format."];
      continue;
    }
    const verdict = check(value);
    if (verdict.ok) return { ok: true, value, attempts: attempt };
    reason = "unfaithful";
    feedback = verdict.problems;
  }
  return { ok: false, reason, attempts: MAX_ATTEMPTS };
}

export function feedbackBlock(feedback: string[]): string {
  if (feedback.length === 0) return "";
  return [
    "",
    "Your previous answer was rejected for these reasons. Fix them and use only the figures and names supplied:",
    ...feedback.map((p) => `- ${p}`),
  ].join("\n");
}
