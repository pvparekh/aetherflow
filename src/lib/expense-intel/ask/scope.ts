// Code-side scope screen, run before the model. Isomorphic.
//
// It catches only unambiguous advice requests so they are declined without a
// model call. Everything else goes to the translator, which classifies scope
// itself. This is a courtesy filter, not the security boundary: the
// boundary is that the model can only emit a schema-validated AskQuery.
import type { DeclineReason } from "./types";

const ADVICE_PATTERNS = [
  /\b(invest(ing|ment)?s?|stocks?|crypto(currency)?|bitcoin|etf|401k|ira|retire(ment)?)\b/i,
  /\btax (advice|returns?)\b/i,
  /\b(file|filing|owe)\b.*\btax(es)?\b|\btax(es)?\b.*\b(file|filing|owe)\b/i,
  /\b(deduct(ions?|ible)?|write[- ]?offs?)\b/i,
  /\b(legal|lawyer|attorney|sue|lawsuit)\b/i,
];

export function screenQuestion(question: string): DeclineReason | null {
  return ADVICE_PATTERNS.some((p) => p.test(question)) ? "advice" : null;
}
