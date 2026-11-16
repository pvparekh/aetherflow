// Cancel guide: how to stop common subscriptions. Isomorphic data.
//
// `cancelUrl` is set only when the page was fetched on `checkedOn` and
// confirmed to be the vendor's own cancellation, account or help page.
// Otherwise it is null and the steps describe where to look. No affiliate,
// aggregator or third-party "how to cancel" sites.
//
// `patterns` match against `vendorKey` (lowercase, alphanumeric, single
// spaces), e.g. "netflix", "google youtubepremium", "hbo max".

export interface CancelGuideEntry {
  id: string;
  /** Display name, also used to spot other vendors named in drafts. */
  name: string;
  patterns: RegExp[];
  steps: string[];
  cancelUrl: string | null;
  checkedOn: string;
}

const CHECKED_ON = "2026-11-15";
const APP_STORE_STEP = "If you subscribed through the Apple App Store or Google Play, cancel it there instead.";

function entry(
  id: string,
  name: string,
  patterns: RegExp[],
  cancelUrl: string | null,
  steps: string[],
): CancelGuideEntry {
  return { id, name, patterns, steps, cancelUrl, checkedOn: CHECKED_ON };
}

export const CANCEL_GUIDE: CancelGuideEntry[] = [
  // Streaming video and music
  entry("netflix", "Netflix", [/^netflix/], "https://help.netflix.com/en/node/407", [
    "Sign in at netflix.com and open your membership page.",
    "Select Cancel, then Finish Cancellation.",
    "You can keep watching until the end of the period you paid for.",
  ]),
  entry("hulu", "Hulu", [/^hulu/], null, [
    "Sign in at hulu.com and open your Account page.",
    "Find your subscription and choose to cancel it.",
    "If Hulu is billed by a partner or bundle, cancel through that partner.",
  ]),
  entry("disney-plus", "Disney+", [/^disney ?plus/, /^disney\b.*\bplus\b/], null, [
    "Sign in to Disney+ in a web browser and open Account.",
    "Select your subscription and choose Cancel Subscription.",
    APP_STORE_STEP,
  ]),
  entry("hbo-max", "HBO Max", [/^hbo ?max/, /^max ?com\b/, /^hbo\b/], "https://help.hbomax.com/us/Answer/Detail/000002526", [
    "Sign in at hbomax.com and open Subscription.",
    "Check who bills you; if it is a partner, cancel through them.",
    "Choose Cancel Your Subscription and note the end date shown.",
  ]),
  entry("paramount-plus", "Paramount+", [/^paramount/], null, [
    "Sign in at paramountplus.com and open your Account page.",
    "Choose Cancel Subscription.",
    APP_STORE_STEP,
  ]),
  entry("peacock", "Peacock", [/^peacock/], "https://www.peacocktv.com/help/article/cancellation", [
    "Sign in at peacocktv.com and open the Subscriptions tab.",
    "Choose Cancel All Subscriptions to end your plan and add-ons.",
    "If you are billed through Apple, Google, Roku or Amazon, cancel with them.",
  ]),
  entry("youtube", "YouTube Premium", [/youtube ?(premium|music|tv)/, /^youtube/], "https://support.google.com/youtube/answer/6308278", [
    "In YouTube, open your profile picture and go to Paid memberships.",
    "Choose the membership and continue to cancel.",
    "Confirm the cancellation.",
  ]),
  entry("spotify", "Spotify", [/^spotify/], "https://support.spotify.com/us/article/cancel-premium/", [
    "Sign in to your Spotify account page and open Manage your plan.",
    "Select Cancel subscription.",
    "Premium stays active until your next billing date, then moves to the free plan.",
  ]),
  entry("apple", "Apple", [/^apple\b/, /^apple ?com\b/, /^itunes/], "https://support.apple.com/en-us/118428", [
    "On your iPhone, open Settings and tap your name.",
    "Tap Subscriptions and choose the one to end.",
    "Tap Cancel Subscription.",
  ]),
  entry("amazon-prime", "Amazon Prime", [/amazon ?prime|^prime ?video|^amzn ?prime/], null, [
    "Sign in to amazon.com and open Your Memberships and Subscriptions.",
    "Choose your Prime membership and select the option to end it.",
    "Follow the prompts until Amazon confirms the end date.",
  ]),
  entry("audible", "Audible", [/^audible/], "https://www.audible.com/help/article/cancel-membership", [
    "Sign in at audible.com and open Account Details.",
    "Choose to cancel your membership and follow the prompts.",
    APP_STORE_STEP,
  ]),
  entry("siriusxm", "SiriusXM", [/^sirius/], "https://www.siriusxm.com/help/manage-or-cancel-service", [
    "Sign in to the SiriusXM Online Account Center and open Subscriptions.",
    "Choose to cancel, or use SiriusXM's online chat.",
    "Cancel at least 24 hours before your renewal date.",
  ]),

  // News
  entry("nytimes", "The New York Times", [/new york times|^nytimes|^nyt\b/], null, [
    "Sign in at nytimes.com and open Account.",
    "Find your subscription and choose to cancel it.",
    APP_STORE_STEP,
  ]),
  entry("wsj", "The Wall Street Journal", [/wall street journal|^wsj\b|^dow jones/], null, [
    "Sign in to the WSJ Customer Center.",
    "Open your subscription and look for the cancel option, or contact customer service.",
    APP_STORE_STEP,
  ]),
  entry("washington-post", "The Washington Post", [/washington ?post|^wapo\b/], null, [
    "Sign in at washingtonpost.com and open your subscription settings.",
    "Choose to cancel your subscription.",
    "If you subscribed through Apple, Amazon or Google, cancel with them.",
  ]),
  entry("linkedin", "LinkedIn Premium", [/^linkedin/], "https://www.linkedin.com/help/linkedin/answer/a545578", [
    "On LinkedIn, open the Me menu and choose Premium features.",
    "Select Manage subscription and cancel it.",
    "Cancel at least a day before your next billing date.",
  ]),

  // Fitness, wellbeing and learning
  entry("peloton", "Peloton", [/^peloton/], null, [
    "Sign in to your Peloton account in a web browser and open Subscriptions.",
    "Choose your membership, then Manage and cancel.",
    APP_STORE_STEP,
  ]),
  entry("strava", "Strava", [/^strava/], "https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription", [
    "Sign in at strava.com and open Settings, then My Account.",
    "Choose Cancel Subscription.",
    APP_STORE_STEP,
  ]),
  entry("headspace", "Headspace", [/^headspace/], null, [
    "Sign in at headspace.com in a web browser, not the app.",
    "Open your subscription settings and choose Cancel Membership.",
    APP_STORE_STEP,
  ]),
  entry("duolingo", "Duolingo", [/^duolingo/], null, [
    "Open your Duolingo account settings and find your Super subscription.",
    "Choose to cancel the subscription.",
    APP_STORE_STEP,
  ]),

  // Cloud storage and productivity suites
  entry("google-one", "Google One", [/google ?one|googleone|google storage/], "https://support.google.com/googleone/answer/9056360", [
    "Open Google One on the web or in the app and go to Settings.",
    "Choose Cancel membership and confirm.",
    "Your storage and benefits stay until the end of the billing cycle.",
  ]),
  entry("google-workspace", "Google Workspace", [/google ?workspace|gsuite|g suite/], "https://knowledge.workspace.google.com/admin/billing/cancel-google-workspace", [
    "Sign in to the Google Admin console as an administrator.",
    "Go to Billing, then Subscriptions, and select the subscription.",
    "Download any data you need first; cancelling deletes Workspace data.",
  ]),
  entry("microsoft-365", "Microsoft 365", [/^microsoft|^msft|^office ?365/], "https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-a-microsoft-365-subscription", [
    "Sign in to your Microsoft account and open Services and subscriptions.",
    "Find the subscription, choose Manage, then Cancel.",
    "If you bought it from Apple, Google or a retailer, cancel with them.",
  ]),
  entry("dropbox", "Dropbox", [/^dropbox/], "https://help.dropbox.com/plans/downgrade-dropbox-individual-plans", [
    "Sign in at dropbox.com, open your avatar menu and choose Manage account.",
    "Click Cancel plan and follow the prompts.",
    "Your account moves to the free Basic plan at the end of the billing cycle.",
  ]),
  entry("1password", "1Password", [/^1 ?password/], "https://support.1password.com/manage-subscription/", [
    "Sign in at 1password.com and open Billing.",
    "Choose the cancel option (you may need to scroll).",
    APP_STORE_STEP,
  ]),
  entry("grammarly", "Grammarly", [/^grammarly/], "https://support.grammarly.com/hc/en-us/articles/115000090172-How-do-I-cancel-my-subscription", [
    "Sign in at account.grammarly.com and open Subscription.",
    "Click Cancel Subscription and confirm.",
    APP_STORE_STEP,
  ]),

  // Design and creative tools
  entry("adobe", "Adobe", [/^adobe/], null, [
    "Sign in to your Adobe account and open Plans and payment.",
    "Choose Manage plan, then Cancel plan, and follow the prompts.",
    "Cancelling within 14 days of purchase may be refundable; check Adobe's terms.",
  ]),
  entry("figma", "Figma", [/^figma/], "https://help.figma.com/hc/en-us/articles/360046216313-Upgrade-or-downgrade-your-plan", [
    "As a team admin, open Admin, then Settings, then Plan.",
    "Choose to cancel or downgrade the plan.",
    "Paid features stay until the end of the billing period.",
  ]),
  entry("canva", "Canva", [/^canva/], null, [
    "Sign in to Canva and open Settings, then Billing.",
    "Choose Cancel plan on your subscription and confirm.",
    APP_STORE_STEP,
  ]),
  entry("midjourney", "Midjourney", [/^midjourney/], null, [
    "Sign in at midjourney.com and open Manage Subscription.",
    "Choose Cancel Plan.",
    "Your plan stays active until the end of the billing cycle.",
  ]),

  // Collaboration and communication
  entry("notion", "Notion", [/^notion/], "https://www.notion.com/help/upgrade-or-downgrade-your-plan", [
    "In Notion, open Settings, then Billing.",
    "Choose Change plan and pick the free plan.",
    "Paid features stay until the end of your billing cycle.",
  ]),
  entry("slack", "Slack", [/^slack/], "https://slack.com/help/articles/48764458651795-Change-or-cancel-your-paid-Slack-plan", [
    "As a workspace owner, open Manage billing.",
    "On the Overview tab, choose Change plan details, then Downgrade to Free.",
    "Choose whether the change applies now or at renewal.",
  ]),
  entry("zoom", "Zoom", [/^zoom/], "https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0066687", [
    "Sign in to the Zoom web portal and open Plans and Billing.",
    "Find the plan and click Cancel Plan, then confirm.",
    "Cancel any add-ons first.",
  ]),
  entry("calendly", "Calendly", [/^calendly/], "https://calendly.com/help/how-to-cancel-your-calendly-subscription", [
    "Open Calendly's Billing page in the Admin Center.",
    "Choose Change plan and switch to the Free plan.",
    "Paid features stay until the end of the billing cycle.",
  ]),
  entry("mailchimp", "Mailchimp", [/^mailchimp|^intuit mailchimp/], "https://mailchimp.com/help/change-or-pause-your-pricing-plan/", [
    "In Mailchimp, open Account and Billing.",
    "Choose to downgrade, pause or close your plan.",
    "Annual plans may need a request to Mailchimp.",
  ]),

  // Developer tools, hosting and websites
  entry("github", "GitHub", [/^github/], "https://docs.github.com/en/billing/managing-the-plan-for-your-github-account/downgrading-your-accounts-plan", [
    "On GitHub, open Settings, then Billing and plans.",
    "Choose to downgrade the plan or cancel the paid product.",
    "The change takes effect at the end of the billing cycle.",
  ]),
  entry("squarespace", "Squarespace", [/^squarespace|^sqsp/], "https://support.squarespace.com/hc/en-us/articles/205810508-Cancel-your-website-subscription", [
    "Open the site's Billing panel in Squarespace.",
    "Click the subscription, then Cancel subscription, and confirm.",
    "Domains and other add-ons are cancelled separately.",
  ]),
  entry("wix", "Wix", [/^wix/], "https://support.wix.com/en/article/canceling-a-wix-premium-plan", [
    "In your Wix account, open Premium Subscriptions.",
    "Click More Actions next to the plan, then Cancel Plan.",
    "Domains, email and apps are cancelled separately.",
  ]),
  entry("shopify", "Shopify", [/^shopify/], "https://help.shopify.com/en/manual/your-account/manage-orgs-and-stores/manage-pricing-plan/deactivate-store", [
    "In your Shopify admin, go to Settings, then Plan.",
    "Click Cancel plan and follow the prompts.",
    "Third-party apps billed outside Shopify are cancelled separately.",
  ]),
  entry("godaddy", "GoDaddy", [/^godaddy|^dnh ?godaddy/], "https://www.godaddy.com/help/turn-off-auto-renew-20008", [
    "Sign in to GoDaddy and open Renewals and Billing.",
    "Choose Manage Subscriptions and select the product.",
    "Choose Cancel Plan or turn off auto-renew, then confirm.",
  ]),

  // AI assistants
  entry("openai", "ChatGPT", [/^openai|^chatgpt/], null, [
    "Sign in at chatgpt.com and open Settings.",
    "Find your plan and choose to cancel it.",
    APP_STORE_STEP,
  ]),
  entry("claude", "Claude", [/^anthropic|^claude ?ai|^claude\b/], "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription", [
    "Sign in to Claude on the web and open Settings, then Billing.",
    "Click Cancel.",
    APP_STORE_STEP,
  ]),
];

/** Every guide vendor name: drafts and narratives must not name these unless they are the subject. */
export const GUIDE_VENDOR_NAMES: string[] = CANCEL_GUIDE.map((e) => e.name);

export function findGuideEntry(vendorKey: string): CancelGuideEntry | null {
  const key = vendorKey.toLowerCase().trim();
  if (!key) return null;
  return CANCEL_GUIDE.find((e) => e.patterns.some((p) => p.test(key))) ?? null;
}
