// The story the demo dataset tells, declared up front.
//
// Everything a leak finder should surface in the demo is planted here, and
// the generator (generate.ts) writes exactly these charges into the data.
// Tests and `npm run eval:ci` compare the leak engine's report against this
// manifest, so it doubles as the demo's answer key.
//
// Matching is by `vendorKey(descriptor)` computed at test time, never by a
// hard-coded key, so improvements to the normaliser cannot silently break it.
import type { Cadence } from "@/lib/expense-intel/contracts";
import type { Category } from "@/lib/expense-intel/types";

export const DEMO_PERSONA = {
  label: "Freelance product designer, Brooklyn NY",
  business: "Northlight Studio",
  summary:
    "A solo product designer working from a shared studio in Brooklyn, with design tools, " +
    "a couple of client trips and the usual coffee habit.",
} as const;

/** Inclusive date range covered by the demo statements. */
export const DEMO_PERIOD = { start: "2025-11-01", end: "2026-10-31" } as const;

/** The "today" the demo is viewed from: the day after the last statement closes. */
export const DEMO_TODAY = "2026-11-01";

export const DEMO_SEED = 20261031;

export type PlantedStory = "price_increase" | "cancelled" | "annual" | "forgotten";

export interface DemoSubscription {
  /** Stable id used to tag generated rows. */
  id: string;
  vendor: string;
  /** Every raw descriptor this subscription is billed under. */
  descriptors: readonly string[];
  category: Category;
  subcategory: string;
  cadence: Extract<Cadence, "monthly" | "annual">;
  /** Monthly: day of month billed. Ignored for annual (see `dates`). */
  day: number;
  /** Amount at the start of the period. */
  amount: number;
  /** A persistent price step from `from` onwards. */
  priceChange?: { from: string; amount: number };
  /** Explicit charge dates (annual plans). */
  dates?: readonly string[];
  /** Last charge before the user cancelled. */
  lastCharge?: string;
  status: "active" | "possibly_cancelled";
  story?: PlantedStory;
}

export const DEMO_SUBSCRIPTIONS: readonly DemoSubscription[] = [
  {
    id: "adobe",
    vendor: "Adobe Creative Cloud",
    descriptors: ["ADOBE  *CREATIVE CLD 408-536-6000 CA"],
    category: "Software/SaaS",
    subcategory: "Design tools",
    cadence: "monthly",
    day: 14,
    amount: 59.99,
    priceChange: { from: "2026-06-01", amount: 69.99 },
    status: "active",
    story: "price_increase",
  },
  {
    id: "figma",
    vendor: "Figma",
    descriptors: ["FIGMA MONTHLY FIGMA.COM CA"],
    category: "Software/SaaS",
    subcategory: "Design tools",
    cadence: "monthly",
    day: 3,
    amount: 16,
    status: "active",
  },
  {
    id: "notion",
    vendor: "Notion",
    descriptors: ["NOTION LABS, INC. NOTION.SO CA"],
    category: "Software/SaaS",
    subcategory: "Productivity",
    cadence: "monthly",
    day: 21,
    amount: 12,
    status: "active",
  },
  {
    id: "google-workspace",
    vendor: "Google Workspace",
    descriptors: ["GOOGLE *GSUITE_NORTHLIGHT G.CO/HELPPAY# CA"],
    category: "Software/SaaS",
    subcategory: "Email and docs",
    cadence: "monthly",
    day: 1,
    amount: 8.4,
    status: "active",
  },
  {
    id: "chatgpt",
    vendor: "ChatGPT Plus",
    descriptors: ["OPENAI *CHATGPT SUBSCR OPENAI.COM CA"],
    category: "Software/SaaS",
    subcategory: "AI assistant",
    cadence: "monthly",
    day: 8,
    amount: 20,
    status: "active",
  },
  {
    id: "icloud",
    vendor: "iCloud+",
    descriptors: ["APPLE.COM/BILL 866-712-7753 CA"],
    category: "Software/SaaS",
    subcategory: "Cloud storage",
    cadence: "monthly",
    day: 6,
    amount: 2.99,
    status: "active",
  },
  {
    id: "squarespace",
    vendor: "Squarespace",
    descriptors: [
      "SQSP* INV148213 SQUARESPACE.COM NY",
      "SQSP* INV209977 SQUARESPACE.COM NY",
    ],
    category: "Software/SaaS",
    subcategory: "Portfolio website",
    cadence: "annual",
    day: 6,
    amount: 276,
    // The renewal is billed a week before the anniversary, which is what
    // lets two annual charges fit inside a 12-month window (358 days apart).
    dates: ["2025-11-06", "2026-10-30"],
    status: "active",
    story: "annual",
  },
  {
    id: "spotify",
    vendor: "Spotify",
    descriptors: ["SPOTIFY USA 877-778-1161 NY"],
    category: "Entertainment",
    subcategory: "Music streaming",
    cadence: "monthly",
    day: 9,
    amount: 11.99,
    status: "active",
  },
  {
    id: "netflix",
    vendor: "Netflix",
    descriptors: ["NETFLIX.COM 866-579-7172 CA"],
    category: "Entertainment",
    subcategory: "Video streaming",
    cadence: "monthly",
    day: 18,
    amount: 17.99,
    status: "active",
  },
  {
    id: "hulu",
    vendor: "Hulu",
    descriptors: ["HULU 877-824-4858 CA"],
    category: "Entertainment",
    subcategory: "Video streaming",
    cadence: "monthly",
    day: 24,
    amount: 18.99,
    lastCharge: "2026-04-24",
    status: "possibly_cancelled",
    story: "cancelled",
  },
  {
    id: "medium",
    vendor: "Medium",
    descriptors: ["MEDIUM MONTHLY SAN FRANCISCO CA"],
    category: "Entertainment",
    subcategory: "Reading",
    cadence: "monthly",
    day: 27,
    amount: 5,
    status: "active",
    story: "forgotten",
  },
  {
    id: "verizon",
    vendor: "Verizon Wireless",
    descriptors: ["VZWRLSS*APOCC VISB 800-922-0204 FL"],
    category: "Utilities",
    subcategory: "Mobile phone",
    cadence: "monthly",
    day: 22,
    amount: 91.37,
    status: "active",
  },
  {
    id: "spectrum",
    vendor: "Spectrum",
    descriptors: ["SPECTRUM 855-707-7328 NY"],
    category: "Utilities",
    subcategory: "Internet",
    cadence: "monthly",
    day: 12,
    amount: 69.99,
    status: "active",
  },
];

export interface PlantedPriceChange {
  subscriptionId: string;
  previousAmount: number;
  newAmount: number;
  changedOn: string;
}

export interface PlantedDuplicate {
  id: string;
  vendor: string;
  descriptor: string;
  category: Category;
  amount: number;
  dates: readonly string[];
  explanation: string;
}

export interface PlantedUnusual {
  id: string;
  vendor: string;
  descriptor: string;
  category: Category;
  subcategory: string;
  amount: number;
  date: string;
  /** Which history a sensible detector compares it against. */
  baseline: "vendor" | "category";
  explanation: string;
}

export interface PlantedNegative {
  vendor: string;
  descriptors: readonly string[];
  /** What it must not be reported as. */
  mustNotBe: "subscription";
  explanation: string;
}

export interface DemoPlanted {
  today: string;
  subscriptions: readonly DemoSubscription[];
  priceChanges: readonly PlantedPriceChange[];
  duplicates: readonly PlantedDuplicate[];
  unusual: readonly PlantedUnusual[];
  negatives: readonly PlantedNegative[];
}

export const DEMO_GROCERY_DESCRIPTORS = [
  "TRADER JOE'S #544 QPS BROOKLYN NY",
  "KEY FOOD 1756 BROOKLYN NY",
  "WHOLEFDS PSL 10237 BROOKLYN NY",
] as const;

export const DEMO_RENT_DESCRIPTOR_PREFIX = "ZELLE PAYMENT TO PROSPECT STUDIO HOLDINGS LLC CONF#";

export const DEMO_COWORKING_DESCRIPTOR = "WEWORK ON DEMAND 646-389-3922 NY";

/** The demo's answer key. */
export const DEMO_PLANTED: DemoPlanted = {
  today: DEMO_TODAY,
  subscriptions: DEMO_SUBSCRIPTIONS,
  priceChanges: [
    {
      subscriptionId: "adobe",
      previousAmount: 59.99,
      newAmount: 69.99,
      changedOn: "2026-06-14",
    },
  ],
  duplicates: [
    {
      id: "robertas-double-charge",
      vendor: "Roberta's",
      descriptor: "TST* ROBERTAS PIZZA BROOKLYN NY",
      category: "Food/Dining",
      amount: 74.32,
      dates: ["2026-05-15", "2026-05-16"],
      explanation: "One dinner charged twice: the second charge posted the next day.",
    },
  ],
  unusual: [
    {
      id: "uber-surge",
      vendor: "Uber",
      descriptor: "UBER   *TRIP HELP.UBER.COM CA",
      category: "Travel/Transport",
      subcategory: "Rideshare",
      amount: 187.45,
      date: "2026-07-19",
      baseline: "vendor",
      explanation: "A late-night ride at several times the usual Uber fare.",
    },
    {
      id: "four-horsemen-dinner",
      vendor: "The Four Horsemen",
      descriptor: "TST* THE FOUR HORSEMEN BROOKLYN NY",
      category: "Food/Dining",
      subcategory: "Client dinner",
      amount: 486.2,
      date: "2026-09-25",
      baseline: "category",
      explanation: "A one-off restaurant bill far above any other meal in the year.",
    },
  ],
  negatives: [
    {
      vendor: "Groceries",
      descriptors: DEMO_GROCERY_DESCRIPTORS,
      mustNotBe: "subscription",
      explanation: "Bought every few days at varying amounts: frequent, but not a subscription.",
    },
    {
      vendor: "Studio rent",
      descriptors: [DEMO_RENT_DESCRIPTOR_PREFIX],
      mustNotBe: "subscription",
      explanation:
        "A monthly transfer to a landlord, paid on varying days and twice split in two. " +
        "A bill, not a subscription to cancel.",
    },
    {
      vendor: "WeWork On Demand",
      descriptors: [DEMO_COWORKING_DESCRIPTOR],
      mustNotBe: "subscription",
      explanation: "Same-price day passes bought on irregular days when the studio is busy.",
    },
  ],
};
