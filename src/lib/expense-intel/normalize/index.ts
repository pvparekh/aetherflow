// Vendor normalisation. Isomorphic: no server-only imports (used by the
// browser demo too).
//
// `vendorKey` is the identity used for caching, rules, recurring detection
// and duplicate detection. Two raw descriptors for the same merchant must map
// to the same key; different merchants must not. Its signature is a contract
// shared across workstreams; improve the implementation, keep the signature.
//
// Baseline implementation (phase 0). Workstream A extends the prefix and
// alias tables and adds tests from the golden set.

// Payment-processor prefixes printed before the merchant name.
const PROCESSOR_PREFIXES = [
  /^sq\s*\*\s*/i, // Square
  /^tst\s*\*\s*/i, // Toast
  /^paypal\s*\*\s*/i,
  /^pp\s*\*\s*/i,
  /^sp\s+\*?\s*/i, // Shopify
  /^bt\s*\*\s*/i, // Braintree
  /^dd\s*\*\s*/i, // DoorDash
  /^pos\s+(debit|purchase)\s+/i,
  /^(debit|credit)\s+card\s+purchase\s+/i,
  /^checkcard\s+\d*\s*/i,
  /^purchase\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s+/i,
];

// Known aliases: cleaned-prefix -> canonical display name.
const ALIASES: [RegExp, string][] = [
  [/^amzn\s*mktp|^amazon\s*mktpl|^amazon\.com|^amzn\.com|^amazon\b/i, "Amazon"],
  [/^google\s*\*?\s*cloud|^gcp\b/i, "Google Cloud"],
  [/^google\s*\*?\s*(gsuite|workspace)/i, "Google Workspace"],
  [/^aws\b|^amazon\s*web\s*services/i, "Amazon Web Services"],
  [/^uber\s*\*?\s*eats/i, "Uber Eats"],
  [/^uber\b/i, "Uber"],
  [/^lyft\b/i, "Lyft"],
  [/^netflix/i, "Netflix"],
  [/^spotify/i, "Spotify"],
  [/^apple\.com\/bill|^apple\s*com\s*bill/i, "Apple"],
  [/^openai|^chatgpt/i, "OpenAI"],
  [/^adobe/i, "Adobe"],
  [/^figma/i, "Figma"],
  [/^slack/i, "Slack"],
  [/^notion/i, "Notion"],
  [/^github/i, "GitHub"],
  [/^microsoft|^msft/i, "Microsoft"],
  [/^zoom\.us|^zoom\b/i, "Zoom"],
  [/^dropbox/i, "Dropbox"],
  [/^starbucks/i, "Starbucks"],
];

function stripNoise(raw: string): string {
  let s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  for (const prefix of PROCESSOR_PREFIXES) s = s.replace(prefix, "");
  return s
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ") // phone numbers
    .replace(/#\s*\d+/g, " ") // store numbers
    .replace(/\b[A-Z]{2}\s*$/g, " ") // trailing state code
    .replace(/\*(?=[A-Z0-9]*\d)[A-Z0-9]{4,}\b/gi, " ") // reference ids like *2K4AB91
    .replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,}\b/g, " ") // bare ids like 4H7KQ
    .replace(/\b\d{2,}\b/g, " ") // remaining digit runs
    .replace(/[^\p{L}\p{N}&'. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(\p{L})(\p{L}*)/gu, (_, a: string, b: string) => a.toUpperCase() + b);
}

/** Canonical human-readable merchant name. */
export function displayVendor(raw: string): string {
  const cleaned = stripNoise(raw);
  for (const [pattern, name] of ALIASES) if (pattern.test(cleaned)) return name;
  if (!cleaned) return raw.trim().slice(0, 80) || "Unknown";
  const isShouting = cleaned === cleaned.toUpperCase();
  return (isShouting ? titleCase(cleaned) : cleaned).slice(0, 80);
}

/** Stable identity for a merchant: lowercase, alphanumeric, single-spaced. */
export function vendorKey(raw: string): string {
  return displayVendor(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
