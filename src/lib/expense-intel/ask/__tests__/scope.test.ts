import { expect, it } from "vitest";
import { screenQuestion } from "../scope";

it.each([
  "Which of these can I deduct on my taxes?",
  "Is my laptop a write-off?",
  "Should I invest the money I save?",
  "When should I file my taxes?",
  "Can I sue Delta for this charge?",
])("declines advice: %s", (question) => {
  expect(screenQuestion(question)).toBe("advice");
});

it.each([
  "How much did I spend on software last month?",
  "What did I pay for tax software this year?",
  "List my Uber rides over $30",
  "Which subscriptions went up in price?",
])("leaves spending questions to the translator: %s", (question) => {
  expect(screenQuestion(question)).toBeNull();
});
