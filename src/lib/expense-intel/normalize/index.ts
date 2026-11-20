// Vendor normalisation. Isomorphic: no server-only imports (used by the
// browser demo too).
//
// `vendorKey` is the identity used for caching, rules, recurring detection
// and duplicate detection. Two raw descriptors for the same merchant must map
// to the same key; different merchants must not. Its signature is a contract
// shared across workstreams; improve the implementation, keep the signature.
//
// Pipeline: strip bank and processor prefixes → known alias? → otherwise strip
// ids, store numbers, trailing location and legal suffixes, then tidy casing.

// Text banks and payment processors print before the merchant name. Applied
// repeatedly, so "POS PURCHASE SQ *BLUE BOTTLE" loses both prefixes.
const PREFIXES = [
  /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/, // leading posting date
  /^(?:recurring\s+)?(?:purchase|payment)\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s+/i,
  /^recurring\s+(?:debit\s+)?(?:purchase|payment)\s+/i,
  /^pos\s+(?:debit|purchase|pur)\s+/i,
  /^(?:debit|credit|check)\s*card\s+(?:purchase|debit)\s+/i,
  /^visa\s+(?:purchase|debit)\s+/i,
  /^checkcard\s+\d*\s*/i,
  /^dbt\s+crd\s+\d*\s*/i,
  /^ach\s+(?:debit|pmt|payment)\s+/i,
  /^online\s+(?:payment|pmt)\s+(?:to\s+)?/i,
  /^sq\s*\*\s*/i, // Square
  /^tst\s*\*\s*/i, // Toast
  /^paypal\s*\*\s*/i,
  /^pp\s*\*\s*/i, // PayPal
  /^sp\s+\*?\s*/i, // Shopify
  /^bt\s*\*\s*/i, // Braintree
  /^dd\s*\*\s*/i, // DoorDash storefronts
  /^in\s*\*\s*/i, // Intuit payments
  /^fs\s*\*\s*/i, // FastSpring
  /^wpy\s*\*\s*/i, // WePay
  /^paddle\.net\s*\*\s*/i,
  /^sumup\s*\*\s*/i,
  /^zettle_?\s*\*\s*/i,
];

// Known merchants, tested against the prefix-stripped descriptor. Order
// matters: specific entries (Amazon Prime, Uber Eats) precede general ones.
const ALIASES: [RegExp, string][] = [
  [/^aws\b|^amazon\s*web\s*services/i, "Amazon Web Services"],
  [/^(?:amazon|amzn)\s*prime|^prime\s*video/i, "Amazon Prime"],
  [/^kindle\s*(?:svcs|unltd|unlimited)/i, "Kindle"],
  [/^amzn|^amazon/i, "Amazon"],
  [/^audible/i, "Audible"],
  [/^google\s*\*?\s*(?:cloud|gcp)|^gcp\b/i, "Google Cloud"],
  [/^google\s*\*?\s*(?:g\s*suite|workspace)/i, "Google Workspace"],
  [/^google\s*\*?\s*ad(?:s|ws)(?![a-z])/i, "Google Ads"],
  [/^google\s*\*?\s*(?:google\s*)?(?:storage|one\b)/i, "Google One"],
  [/^(?:google\s*\*?\s*)?youtube\s*tv/i, "YouTube TV"],
  [/^(?:google\s*\*?\s*)?youtube/i, "YouTube"],
  [/^apple\.com|^apple\s*com\s*bill|^itunes/i, "Apple"],
  [/^netflix/i, "Netflix"],
  [/^hulu/i, "Hulu"],
  [/^disney\s*(?:plus|\+)|^disneyplus/i, "Disney+"],
  [/^hbo\s*max|^hbomax|^max\.com/i, "Max"],
  [/^paramount\s*(?:plus|\+)/i, "Paramount+"],
  [/^peacock/i, "Peacock"],
  [/^spotify/i, "Spotify"],
  [/^sirius\s*xm/i, "SiriusXM"],
  [/^openai|^chatgpt/i, "OpenAI"],
  [/^anthropic|^claude\.ai/i, "Anthropic"],
  [/^adobe/i, "Adobe"],
  [/^figma/i, "Figma"],
  [/^canva/i, "Canva"],
  [/^slack/i, "Slack"],
  [/^notion/i, "Notion"],
  [/^github/i, "GitHub"],
  [/^atlassian|^jira\b|^confluence\b/i, "Atlassian"],
  [/^microsoft|^msft\b|^ms\s*\*/i, "Microsoft"],
  [/^zoom\.us|^zoom\b/i, "Zoom"],
  [/^dropbox/i, "Dropbox"],
  [/^vercel/i, "Vercel"],
  [/^heroku/i, "Heroku"],
  [/^digital\s*ocean/i, "DigitalOcean"],
  [/^cloudflare/i, "Cloudflare"],
  [/^sqsp\b|^squarespace/i, "Squarespace"],
  [/^(?:dnh\s*\*?\s*)?godaddy/i, "GoDaddy"],
  [/^namecheap/i, "Namecheap"],
  [/^shopify/i, "Shopify"],
  [/^(?:intuit\s*\*?\s*)?mailchimp/i, "Mailchimp"],
  [/^(?:intuit\s*\*?\s*)?(?:quickbooks|qbooks)/i, "QuickBooks"],
  [/^hubspot/i, "HubSpot"],
  [/^calendly/i, "Calendly"],
  [/^grammarly/i, "Grammarly"],
  [/^linkedin|^lnkd\.in/i, "LinkedIn"],
  [/^facebk|^facebook|^meta\s*(?:ads|platforms)/i, "Meta Ads"],
  [/^uber\s*\*?\s*eats/i, "Uber Eats"],
  [/^uber\b/i, "Uber"],
  [/^lyft\b/i, "Lyft"],
  [/^doordash/i, "DoorDash"],
  [/^grubhub/i, "Grubhub"],
  [/instacar/i, "Instacart"],
  [/^airbnb/i, "Airbnb"],
  [/^booking\.com/i, "Booking.com"],
  [/^hotels\.com/i, "Hotels.com"],
  [/^expedia/i, "Expedia"],
  [/^marriott/i, "Marriott"],
  [/^hilton/i, "Hilton"],
  [/^hyatt/i, "Hyatt"],
  [/^delta\s*(?:air|\d)/i, "Delta Air Lines"],
  [/^united\s*(?:airlines|air\b|\d)/i, "United Airlines"],
  [/^american\s*air/i, "American Airlines"],
  [/^southwest\s*(?:air|\d)|^southwes\b/i, "Southwest Airlines"],
  [/^jetblue/i, "JetBlue"],
  [/^alaska\s*air/i, "Alaska Airlines"],
  [/^amtrak/i, "Amtrak"],
  [/^shell\b/i, "Shell"],
  [/^chevron/i, "Chevron"],
  [/^exxon/i, "Exxon"],
  [/^costco/i, "Costco"],
  [/^wal-?mart|^wm\s*supercenter/i, "Walmart"],
  [/^target\b/i, "Target"],
  [/^whole\s*foods|^wholefds/i, "Whole Foods"],
  [/^trader\s*joe/i, "Trader Joe's"],
  [/^safeway/i, "Safeway"],
  [/^kroger/i, "Kroger"],
  [/^cvs\b/i, "CVS"],
  [/^walgreens/i, "Walgreens"],
  [/^(?:the\s*)?home\s*depot/i, "The Home Depot"],
  [/^lowe'?s\b/i, "Lowe's"],
  [/^best\s*buy/i, "Best Buy"],
  [/^staples/i, "Staples"],
  [/^office\s*depot|^officemax/i, "Office Depot"],
  [/^fedex/i, "FedEx"],
  [/^ups\b/i, "UPS"],
  [/^usps/i, "USPS"],
  [/^comcast|^xfinity/i, "Xfinity"],
  [/^verizon|^vzwrlss/i, "Verizon"],
  [/^at\s*&\s*t\b|^att\s*\*/i, "AT&T"],
  [/^t-?mobile/i, "T-Mobile"],
  [/^spectrum\b|^charter\s*comm/i, "Spectrum"],
  [/^pg\s*&\s*e\b|^pgande\b|^pacific\s*gas/i, "PG&E"],
  [/^con\s*ed/i, "Con Edison"],
  [/^chipotle/i, "Chipotle"],
  [/^mcdonald/i, "McDonald's"],
  [/^starbucks/i, "Starbucks"],
  [/^dunkin/i, "Dunkin'"],
  [/^peloton/i, "Peloton"],
  [/^7-?\s*eleven/i, "7-Eleven"],
  [/^24\s*hour\s*fitness/i, "24 Hour Fitness"],
  [/^planet\s*fitness/i, "Planet Fitness"],
  [/^wework/i, "WeWork"],
];

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

// Cities commonly printed before the state code. Matched only when a state
// code was found, so a merchant named "Boston Market" keeps its name.
const CITIES = [
  "san francisco", "south san francisco", "los angeles", "new york", "brooklyn",
  "queens", "bronx", "manhattan", "san diego", "san jose", "oakland", "berkeley",
  "palo alto", "mountain view", "sunnyvale", "santa clara", "menlo park",
  "redwood city", "sacramento", "seattle", "bellevue", "redmond", "portland",
  "boston", "cambridge", "chicago", "austin", "dallas", "houston",
  "san antonio", "fort worth", "denver", "boulder", "phoenix", "scottsdale",
  "las vegas", "salt lake city", "miami", "orlando", "tampa", "atlanta",
  "nashville", "charlotte", "raleigh", "washington", "arlington",
  "philadelphia", "pittsburgh", "baltimore", "detroit", "minneapolis",
  "st louis", "kansas city", "columbus", "cleveland", "indianapolis",
  "milwaukee", "new orleans", "honolulu", "anchorage", "jersey city",
  "newark", "hoboken", "irvine", "santa monica", "pasadena", "long beach",
];
const TRAILING_CITY = new RegExp(
  `\\s(?:${[...CITIES].sort((a, b) => b.length - a.length).join("|")})$`,
  "i",
);

const TRAILING_NOISE = /\s+(?:pending|recurring|autopay|auto pay|preauth|usa)$/i;
const LEGAL_SUFFIX = /\s+(?:inc|llc|ltd|corp|co)\.?$/i;
const SMALL_WORDS = new Set(["of", "and", "the", "at", "by", "for", "on"]);

function stripPrefixes(raw: string): string {
  let s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      const next = s.replace(prefix, "");
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  return s;
}

function knownAlias(descriptor: string): string | null {
  for (const [pattern, name] of ALIASES) if (pattern.test(descriptor)) return name;
  return null;
}

// Web addresses after the merchant name ("UBER *TRIP HELP.UBER.COM") are
// support links, not part of the name. The first word is kept: it may be
// the merchant itself ("NETFLIX.COM").
function dropTrailingDomains(s: string): string {
  const [first, ...rest] = s.split(" ");
  const kept = rest.filter(
    (word) => !/^(?:https?:\/\/|www\.)|\.(?:com|net|org|io|co|us)\b/i.test(word),
  );
  return [first, ...kept].join(" ");
}

function stripIdentifiers(s: string): string {
  return s
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ") // phone numbers
    .replace(/#\s*\d+/g, " ") // store numbers
    .replace(/\*(?=[A-Z0-9]*\d)[A-Z0-9]{4,}\b/gi, " ") // reference ids like *2K4AB91
    .replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,}\b/g, " ") // bare ids like 4H7KQ
    .replace(/\b\d{2,}\b/g, " ") // store numbers, zip codes, dates
    .replace(/[^\p{L}\p{N}&'. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "BLUE BOTTLE SAN FRANCISCO CA" → "BLUE BOTTLE". State codes are only
// recognised in upper case, as banks print them, so "Figma Co" is untouched
// by this step.
function stripLocation(s: string): string {
  const words = s.split(" ");
  const last = words[words.length - 1];
  if (words.length < 2 || !US_STATES.has(last)) return s;
  const withoutState = words.slice(0, -1).join(" ");
  const withoutCity = withoutState.replace(TRAILING_CITY, "");
  return withoutCity || withoutState;
}

// Removes repeated trailing matches but never empties the name.
function stripTrailing(s: string, pattern: RegExp): string {
  let current = s;
  let next = current.replace(pattern, "");
  while (next && next !== current) {
    current = next;
    next = current.replace(pattern, "");
  }
  return current;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/(?<=\s)(\p{L}+)/gu, (word: string) =>
      SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word,
    );
}

function cleanName(descriptor: string): string {
  let s = dropTrailingDomains(descriptor);
  s = stripIdentifiers(s);
  s = stripTrailing(s, TRAILING_NOISE);
  s = stripLocation(s);
  s = stripTrailing(s, LEGAL_SUFFIX);
  return s.replace(/^[.&' ]+|[.&' ]+$/g, "").trim();
}

/** Canonical human-readable merchant name. */
export function displayVendor(raw: string): string {
  const descriptor = stripPrefixes(raw);
  const alias = knownAlias(descriptor);
  if (alias) return alias;
  const cleaned = cleanName(descriptor);
  if (!cleaned) return raw.trim().slice(0, 80) || "Unknown";
  const isShouting = cleaned === cleaned.toUpperCase();
  return (isShouting ? titleCase(cleaned) : cleaned).slice(0, 80);
}

/** Stable identity for a merchant: lowercase, alphanumeric, single-spaced. */
export function vendorKey(raw: string): string {
  return displayVendor(raw)
    .toLowerCase()
    .replace(/(\p{L}) s\b/gu, "$1s") // "joe s" (apostrophe dropped by the bank) → "joes"
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
