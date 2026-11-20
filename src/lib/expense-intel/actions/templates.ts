// Template drafts: the fallback when the model is unavailable or unfaithful,
// and the drafts the demo shows with no model. Isomorphic.
//
// Tone rules shared with the model prompt: polite and honest, no threats, no
// invented competitor offers, no promise that anything will be saved.
import type { Draft, PriceChange, RecurringStream } from "../contracts";
import { formatDate, formatUsd } from "../ai/format";
import type { CancelGuideEntry } from "./cancel-guide";
import { cadenceWords, cancellationFactSheet, negotiationFactSheet } from "./facts";

const SIGN_OFF = "Thank you,\n[Your name]\n[Email address on the account]";

function genericCancelSteps(stream: RecurringStream): string[] {
  return [
    `Find a recent receipt from ${stream.vendor} to see which account and email address it bills.`,
    "Sign in to that account and look for Billing, Subscription or Membership settings.",
    "If you subscribed through the Apple App Store or Google Play, cancel it there instead.",
    "If there is no cancel option, send the message below to their support team.",
  ];
}

function confirmStep(stream: RecurringStream): string {
  return stream.status === "active"
    ? `Keep the confirmation, and check that no new charge appears after ${formatDate(stream.nextExpectedDate)}.`
    : "Keep the confirmation, and check your next statement to make sure the charge has stopped.";
}

export function cancellationBody(stream: RecurringStream): string {
  return [
    `Hello ${stream.vendor} support,`,
    `Please cancel my ${stream.vendor} subscription and stop all future charges. My most recent charge was ${formatUsd(stream.lastAmount)} on ${formatDate(stream.lastDate)}.`,
    "Please confirm by email once the cancellation is complete, and let me know the date my access ends.",
    SIGN_OFF,
  ].join("\n\n");
}

export function templateCancellation(stream: RecurringStream, guide: CancelGuideEntry | null): Draft {
  return {
    kind: "cancel",
    vendor: stream.vendor,
    // With a guide entry the user cancels in the vendor's own settings; the
    // message is there if they need support. Without one, email is the route.
    channel: guide ? "web_form" : "email",
    subject: `Cancel my ${stream.vendor} subscription`,
    body: cancellationBody(stream),
    cancelUrl: guide?.cancelUrl ?? null,
    steps: [...(guide?.steps ?? genericCancelSteps(stream)), confirmStep(stream)],
    facts: cancellationFactSheet(stream, guide?.name).facts,
    source: "template",
  };
}

function priceLine(stream: RecurringStream, change: PriceChange | null): string {
  if (change && change.newAmount > change.previousAmount) {
    return `My price went up from ${formatUsd(change.previousAmount)} to ${formatUsd(change.newAmount)} on ${formatDate(change.changedOn)}, which adds ${formatUsd(change.annualImpact)} a year.`;
  }
  return `I pay ${formatUsd(stream.lastAmount)} ${cadenceWords(stream.cadence)}, which comes to ${formatUsd(stream.annualCost)} a year.`;
}

export function negotiationBody(stream: RecurringStream, change: PriceChange | null): string {
  return [
    `Hi, I'm calling about my ${stream.vendor} account. [Have the account email or number ready.]`,
    priceLine(stream, change),
    "I'd like to keep the service if the price works for me. Are there any current promotions, loyalty discounts or lower-priced plans you can offer?",
    "If they offer something: Thank you. Could you confirm the new price, how long it lasts, and whether anything else on my plan changes? Could you send that to me in writing?",
    "If they can't: I understand. Could you tell me which plans are available and what they cost, so I can decide what works best?",
    "Thanks for your help.",
  ].join("\n\n");
}

export function negotiationSteps(stream: RecurringStream): string[] {
  return [
    "Before calling, check what comparable services charge yourself, so you can mention it honestly if it is relevant.",
    "Decide beforehand whether you would cancel if no better price is available.",
    `Contact ${stream.vendor} customer support by phone or chat and ask for the billing or retention team.`,
    "Be polite and specific, and read your figures from the facts list.",
    "Ask for any agreed change in writing, and check your next statement.",
  ];
}

export function templateNegotiation(
  stream: RecurringStream,
  change: PriceChange | null,
  guide: CancelGuideEntry | null = null,
): Draft {
  return {
    kind: "negotiate",
    vendor: stream.vendor,
    channel: "phone_script",
    subject: null,
    body: negotiationBody(stream, change),
    cancelUrl: guide?.cancelUrl ?? null,
    steps: negotiationSteps(stream),
    facts: negotiationFactSheet(stream, change, guide?.name).facts,
    source: "template",
  };
}
