// "Ask your spending": the grounded tool-use pipeline. Server-side.
//
//   question (untrusted)
//     -> screenQuestion          code: decline obvious advice requests, no model call
//     -> translateQuestion       MODEL: emits a query, nothing else
//     -> parseTranslation        code: schema validation (the trust boundary)
//     -> runQuery                code: pure executor computes every number
//     -> templateAnswer          code: answer text copied from computed rows
//
// The model never produces a number shown to the user. Declined questions
// stop before the executor runs.
import type { LeakReport, Txn } from "../contracts";
import { DECLINE_MESSAGES, templateAnswer } from "./answer";
import { runQuery } from "./execute";
import { screenQuestion } from "./scope";
import { buildTranslatorContext, translateQuestion } from "./translate";
import type { AskAnswer, AskResult, DeclineReason } from "./types";

export type AskResponse =
  | { kind: "answer"; answer: AskAnswer; result: AskResult }
  | { kind: "declined"; reason: DeclineReason; answer: AskAnswer };

export interface AskOptions {
  /** ISO date that "last month" and similar resolve against. */
  today: string;
  /** Leak engine output for `recurringOnly`; see RunOptions.report. */
  report?: LeakReport | null;
}

function decline(reason: DeclineReason): AskResponse {
  return { kind: "declined", reason, answer: { text: DECLINE_MESSAGES[reason], source: "template" } };
}

export async function askSpending(
  question: string,
  txns: Txn[],
  options: AskOptions,
): Promise<AskResponse> {
  const screened = screenQuestion(question);
  if (screened) return decline(screened);
  if (txns.length === 0) return decline("no_data");

  const outcome = await translateQuestion(question, buildTranslatorContext(txns, options.today));
  if (outcome.kind === "declined") return decline(outcome.reason);

  const result = runQuery(txns, outcome.query, options);
  // Model phrasing would go here: give it `result.rows` only, check the text
  // with workstream C's checkFaithfulness, and keep templateAnswer on failure.
  return { kind: "answer", answer: templateAnswer(result), result };
}
