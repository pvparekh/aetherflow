// Deterministic generator for the demo dataset: 12 months of card activity for
// one persona (see planted.ts). Isomorphic and dependency-free.
//
// Shape of the data:
// - Subscriptions, the duplicate, the unusual charges and the negatives come
//   from planted.ts, so the answer key and the data cannot drift apart.
// - Everyday spending comes from "habits": per-day probabilities that depend
//   on the weekday (coffee on workdays, restaurants on Fridays and Saturdays,
//   big grocery runs at weekends), with amounts drawn from merchant-specific
//   ranges.
// - A collision guard keeps accidental duplicates out: no unplanted row shares
//   a merchant and amount with another row within 3 days. Real statements do
//   contain such pairs, but here the only one should be the planted one.
import { vendorKey } from "@/lib/expense-intel/normalize";
import type { Category } from "@/lib/expense-intel/types";
import { createRng, type Rng } from "./prng";
import {
  DEMO_COWORKING_DESCRIPTOR,
  DEMO_GROCERY_DESCRIPTORS,
  DEMO_PERIOD,
  DEMO_PLANTED,
  DEMO_RENT_DESCRIPTOR_PREFIX,
  DEMO_SEED,
  DEMO_SUBSCRIPTIONS,
  type DemoSubscription,
} from "./planted";

/** One generated statement row, before it becomes a LineItem or Txn. */
export interface DemoRow {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Raw bank descriptor, as printed on the statement. */
  descriptor: string;
  amount: number;
  category: Category;
  subcategory: string;
  /** Planted-story tag, e.g. "subscription:adobe", "duplicate:…", "negative:rent". */
  tag: string | null;
}

interface Draft extends Omit<DemoRow, "id"> {
  /** Draws a fresh amount when the first one collides with a recent identical charge. */
  reroll?: () => number;
}

// ---------------------------------------------------------------------------
// Dates (UTC, ISO strings)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
function weekday(date: string): number {
  return new Date(toTime(date)).getUTCDay();
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function eachMonth(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); ) {
    out.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }
  return out;
}

const isWeekend = (date: string) => weekday(date) === 0 || weekday(date) === 6;
const month = (date: string) => Number(date.slice(5, 7));

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

const NYC_SALES_TAX = 0.08875;

const cents = (value: number) => Math.round(value * 100) / 100;
const withTax = (value: number) => cents(value * (1 + NYC_SALES_TAX));
/** Restaurant bill: food plus tax plus an 18 to 22% tip. */
const withTaxAndTip = (rng: Rng, food: number) =>
  cents(food * (1 + NYC_SALES_TAX + rng.int(18, 22) / 100));

// ---------------------------------------------------------------------------
// Everyday habits
// ---------------------------------------------------------------------------

interface Merchant {
  descriptor: (rng: Rng) => string;
  weight: number;
  amount: (rng: Rng, date: string) => number;
  category: Category;
  subcategory: string;
}

interface Habit {
  name: string;
  /** Probability of at least one purchase on this day. */
  chance: (date: string) => number;
  merchants: readonly Merchant[];
}

const fixed = (descriptor: string) => () => descriptor;

const COFFEE: Habit = {
  name: "coffee",
  chance: (d) => (isWeekend(d) ? 0.16 : 0.27),
  merchants: [
    {
      descriptor: fixed("SQ *DEVOCION BROOKLYN NY"),
      weight: 4,
      amount: (rng) => withTax(rng.money(4.5, 6.5) + (rng.chance(0.35) ? rng.money(3.5, 5.75) : 0)),
      category: "Food/Dining",
      subcategory: "Coffee",
    },
    {
      descriptor: fixed("SQ *BLUE BOTTLE 0423 NEW YORK NY"),
      weight: 2,
      amount: (rng) => withTax(rng.money(5, 7.25) + (rng.chance(0.3) ? rng.money(4, 6) : 0)),
      category: "Food/Dining",
      subcategory: "Coffee",
    },
    {
      descriptor: fixed("SQ *PARTNERS COFFEE BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTax(rng.money(4.25, 6.25) + (rng.chance(0.3) ? rng.money(3.75, 5.5) : 0)),
      category: "Food/Dining",
      subcategory: "Coffee",
    },
    {
      descriptor: fixed("STARBUCKS STORE 07541 BROOKLYN NY"),
      weight: 1,
      amount: (rng) => withTax(rng.money(4.45, 7.95)),
      category: "Food/Dining",
      subcategory: "Coffee",
    },
  ],
};

const GROCERIES: Habit = {
  name: "groceries",
  chance: (d) => (weekday(d) === 6 || weekday(d) === 0 ? 0.32 : 0.09),
  merchants: [
    {
      descriptor: fixed(DEMO_GROCERY_DESCRIPTORS[0]),
      weight: 5,
      amount: (rng, d) => (isWeekend(d) ? rng.skewedMoney(38, 142) : rng.skewedMoney(14, 64)),
      category: "Food/Dining",
      subcategory: "Groceries",
    },
    {
      descriptor: fixed(DEMO_GROCERY_DESCRIPTORS[1]),
      weight: 3,
      amount: (rng) => rng.skewedMoney(6.5, 48),
      category: "Food/Dining",
      subcategory: "Groceries",
    },
    {
      descriptor: fixed(DEMO_GROCERY_DESCRIPTORS[2]),
      weight: 2,
      amount: (rng) => rng.skewedMoney(24, 158),
      category: "Food/Dining",
      subcategory: "Groceries",
    },
  ],
};

const LUNCH: Habit = {
  name: "lunch",
  chance: (d) => (isWeekend(d) ? 0 : 0.11),
  merchants: [
    {
      descriptor: fixed("SWEETGREEN PARK SLOPE BROOKLYN NY"),
      weight: 3,
      amount: (rng) => withTax(rng.money(13.95, 18.45)),
      category: "Food/Dining",
      subcategory: "Lunch",
    },
    {
      descriptor: fixed("CHIPOTLE 3157 BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTax(rng.money(11.25, 16.8)),
      category: "Food/Dining",
      subcategory: "Lunch",
    },
    {
      descriptor: fixed("TST* JOE'S PIZZA BROADWAY NEW YORK NY"),
      weight: 1,
      amount: (rng) => withTax(rng.int(2, 3) * 4 + rng.money(0, 3.5)),
      category: "Food/Dining",
      subcategory: "Lunch",
    },
    {
      descriptor: fixed("SQ *BKLYN LARDER BROOKLYN NY"),
      weight: 1,
      amount: (rng) => withTax(rng.money(12, 21)),
      category: "Food/Dining",
      subcategory: "Lunch",
    },
  ],
};

const DINNER_OUT: Habit = {
  name: "dinner-out",
  chance: (d) => [0.2, 0.04, 0.05, 0.07, 0.1, 0.3, 0.32][weekday(d)],
  merchants: [
    {
      descriptor: fixed("TST* ROBERTAS PIZZA BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTaxAndTip(rng, rng.money(32, 68)),
      category: "Food/Dining",
      subcategory: "Restaurants",
    },
    {
      descriptor: fixed("TST* FIVE LEAVES BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTaxAndTip(rng, rng.money(28, 64)),
      category: "Food/Dining",
      subcategory: "Restaurants",
    },
    {
      descriptor: fixed("SQ *TACOMBI PARK SLOPE BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTaxAndTip(rng, rng.money(22, 48)),
      category: "Food/Dining",
      subcategory: "Restaurants",
    },
    {
      descriptor: fixed("TST* WIN SON BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTaxAndTip(rng, rng.money(30, 72)),
      category: "Food/Dining",
      subcategory: "Restaurants",
    },
    {
      descriptor: fixed("TST* MISS ADA BROOKLYN NY"),
      weight: 1,
      amount: (rng) => withTaxAndTip(rng, rng.money(48, 88)),
      category: "Food/Dining",
      subcategory: "Restaurants",
    },
    {
      descriptor: fixed("BARCADE BROOKLYN BROOKLYN NY"),
      weight: 2,
      amount: (rng) => withTaxAndTip(rng, rng.money(14, 42)),
      category: "Food/Dining",
      subcategory: "Bars",
    },
  ],
};

const DELIVERY: Habit = {
  name: "delivery",
  chance: (d) => (weekday(d) === 0 ? 0.12 : 0.05),
  merchants: [
    {
      descriptor: fixed("DD *DOORDASH SWEETCHICK 855-973-1040 CA"),
      weight: 2,
      amount: (rng) => rng.money(24, 46),
      category: "Food/Dining",
      subcategory: "Food delivery",
    },
    {
      descriptor: fixed("UBER   *EATS HELP.UBER.COM CA"),
      weight: 3,
      amount: (rng) => rng.money(18, 44),
      category: "Food/Dining",
      subcategory: "Food delivery",
    },
    {
      descriptor: fixed("SEAMLSS*PIZZA MOTO 800-905-9322 NY"),
      weight: 1,
      amount: (rng) => rng.money(26, 41),
      category: "Food/Dining",
      subcategory: "Food delivery",
    },
  ],
};

const RIDES: Habit = {
  name: "rides",
  chance: (d) => [0.05, 0.03, 0.03, 0.04, 0.05, 0.11, 0.1][weekday(d)],
  merchants: [
    {
      descriptor: fixed(DEMO_PLANTED.unusual[0].descriptor),
      weight: 3,
      amount: (rng) => rng.skewedMoney(11.5, 38.9),
      category: "Travel/Transport",
      subcategory: "Rideshare",
    },
  ],
};

const SUBWAY: Habit = {
  name: "subway",
  chance: (d) => (isWeekend(d) ? 0.08 : 0.07),
  merchants: [
    {
      descriptor: fixed("MTA*NYCT PAYGO NEW YORK NY"),
      weight: 1,
      // OMNY taps are batched by the bank into one daily charge.
      amount: (rng) => cents(2.9 * rng.int(1, 4)),
      category: "Travel/Transport",
      subcategory: "Subway",
    },
  ],
};

const BIKE: Habit = {
  name: "bike-share",
  chance: (d) => (month(d) >= 4 && month(d) <= 10 ? (isWeekend(d) ? 0.12 : 0.05) : 0.01),
  merchants: [
    {
      descriptor: fixed("LYFT   *CITIBIKE 855-245-3311 NY"),
      weight: 1,
      // Unlock fee plus per-minute e-bike pricing.
      amount: (rng) => cents(4.79 + 0.26 * rng.int(4, 28)),
      category: "Travel/Transport",
      subcategory: "Bike share",
    },
  ],
};

const SUPPLIES: Habit = {
  name: "supplies",
  chance: () => 0.075,
  merchants: [
    {
      descriptor: (rng) => `AMZN Mktp US*${rng.ref(9)}`,
      weight: 5,
      amount: (rng) => rng.skewedMoney(9.99, 84.5),
      category: "Office/Supplies",
      subcategory: "Online order",
    },
    {
      descriptor: (rng) => `Amazon.com*${rng.ref(9)} Amzn.com/bill WA`,
      weight: 2,
      amount: (rng) => rng.skewedMoney(12.49, 64),
      category: "Office/Supplies",
      subcategory: "Online order",
    },
    {
      descriptor: fixed("BLICK ART 0410 NEW YORK NY"),
      weight: 1.5,
      amount: (rng) => withTax(rng.money(16, 78)),
      category: "Office/Supplies",
      subcategory: "Art supplies",
    },
    {
      descriptor: fixed("FEDEX OFFIC52300005231 BROOKLYN NY"),
      weight: 1,
      amount: (rng) => withTax(rng.money(9, 58)),
      category: "Office/Supplies",
      subcategory: "Printing",
    },
    {
      descriptor: fixed("USPS PO 3528900456 BROOKLYN NY"),
      weight: 1,
      amount: (rng) => rng.money(6.8, 31.5),
      category: "Office/Supplies",
      subcategory: "Shipping",
    },
    {
      descriptor: fixed("STAPLES 01478 BROOKLYN NY"),
      weight: 0.7,
      amount: (rng) => withTax(rng.money(8, 46)),
      category: "Office/Supplies",
      subcategory: "Office supplies",
    },
  ],
};

const PHARMACY: Habit = {
  name: "pharmacy",
  chance: () => 0.04,
  merchants: [
    {
      descriptor: fixed("CVS/PHARMACY #02217 BROOKLYN NY"),
      weight: 2,
      amount: (rng) => rng.skewedMoney(5.49, 42),
      category: "Misc",
      subcategory: "Pharmacy",
    },
    {
      descriptor: fixed("DUANE READE #14402 NEW YORK NY"),
      weight: 1,
      amount: (rng) => rng.skewedMoney(3.99, 27),
      category: "Misc",
      subcategory: "Pharmacy",
    },
  ],
};

const NIGHT_OUT: Habit = {
  name: "night-out",
  chance: (d) => (weekday(d) === 5 || weekday(d) === 6 ? 0.05 : 0.008),
  merchants: [
    {
      descriptor: fixed("NITEHAWK CINEMA PROSPECT P BROOKLYN NY"),
      weight: 3,
      amount: (rng) => cents(2 * 19 + (rng.chance(0.6) ? rng.money(12, 34) : 0)),
      category: "Entertainment",
      subcategory: "Cinema",
    },
    {
      descriptor: fixed("BKLYN ACADEMY OF MUSIC BROOKLYN NY"),
      weight: 1,
      amount: (rng) => cents(2 * rng.int(35, 65)),
      category: "Entertainment",
      subcategory: "Performances",
    },
    {
      descriptor: fixed("BROOKLYN BOWL BROOKLYN NY"),
      weight: 1,
      amount: (rng) => withTax(rng.money(28, 66)),
      category: "Entertainment",
      subcategory: "Night out",
    },
  ],
};

const HABITS: readonly Habit[] = [
  COFFEE,
  GROCERIES,
  LUNCH,
  DINNER_OUT,
  DELIVERY,
  RIDES,
  SUBWAY,
  BIKE,
  SUPPLIES,
  PHARMACY,
  NIGHT_OUT,
];

function habitRows(rng: Rng, days: readonly string[], skip: ReadonlySet<string>): Draft[] {
  const out: Draft[] = [];
  for (const date of days) {
    if (skip.has(date)) continue;
    for (const habit of HABITS) {
      if (!rng.chance(habit.chance(date))) continue;
      const merchant = rng.weighted(habit.merchants.map((m) => [m, m.weight] as const));
      out.push({
        date,
        descriptor: merchant.descriptor(rng),
        amount: merchant.amount(rng, date),
        category: merchant.category,
        subcategory: merchant.subcategory,
        tag: null,
        reroll: () => merchant.amount(rng, date),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Planted stories
// ---------------------------------------------------------------------------

function subscriptionCharges(sub: DemoSubscription): Draft[] {
  const base = {
    category: sub.category,
    subcategory: sub.subcategory,
    tag: `subscription:${sub.id}`,
  };
  if (sub.dates) {
    return sub.dates.map((date, i) => ({
      ...base,
      date,
      descriptor: sub.descriptors[i % sub.descriptors.length],
      amount: sub.amount,
    }));
  }
  const out: Draft[] = [];
  for (const m of eachMonth(DEMO_PERIOD.start, DEMO_PERIOD.end)) {
    const date = `${m}-${String(sub.day).padStart(2, "0")}`;
    if (date < DEMO_PERIOD.start || date > DEMO_PERIOD.end) continue;
    if (sub.lastCharge && date > sub.lastCharge) continue;
    const amount =
      sub.priceChange && date >= sub.priceChange.from ? sub.priceChange.amount : sub.amount;
    out.push({ ...base, date, descriptor: sub.descriptors[0], amount });
  }
  return out;
}

/**
 * Studio rent by Zelle: due on the 1st, usually paid within the first few
 * days, and twice paid in two parts. A monthly bill that repeats, but not a
 * subscription.
 */
function rentPayments(rng: Rng): Draft[] {
  const RENT = 1450;
  const splits: Record<string, readonly [number, number, number]> = {
    // month: [first part, day of first part, day of second part]
    "2026-02": [1000, 2, 13],
    "2026-08": [725, 3, 17],
  };
  const out: Draft[] = [];
  const pay = (date: string, amount: number) =>
    out.push({
      date,
      // Zelle confirmation numbers: a bank prefix plus a unique reference.
      descriptor: `${DEMO_RENT_DESCRIPTOR_PREFIX} JPM${rng.ref(8)}`,
      amount,
      category: "Misc",
      subcategory: "Studio rent",
      tag: "negative:rent",
    });
  for (const m of eachMonth(DEMO_PERIOD.start, DEMO_PERIOD.end)) {
    const split = splits[m];
    if (split) {
      const [first, day1, day2] = split;
      pay(`${m}-${String(day1).padStart(2, "0")}`, first);
      pay(`${m}-${String(day2).padStart(2, "0")}`, RENT - first);
    } else {
      // Late in March (the month after the SF trip).
      const day = m === "2026-03" ? 9 : rng.int(1, 5);
      pay(`${m}-${String(day).padStart(2, "0")}`, RENT);
    }
  }
  return out;
}

/** Co-working day passes on irregular workdays, more often in busy months. */
function coworkingPasses(rng: Rng, days: readonly string[], skip: ReadonlySet<string>): Draft[] {
  const busyMonths = new Set([1, 2, 5, 6, 10]);
  const out: Draft[] = [];
  let last: string | null = null;
  for (const date of days) {
    if (isWeekend(date) || skip.has(date)) continue;
    if (last && daysBetween(last, date) < 4) continue;
    if (!rng.chance(busyMonths.has(month(date)) ? 0.22 : 0.06)) continue;
    out.push({
      date,
      descriptor: DEMO_COWORKING_DESCRIPTOR,
      amount: 29,
      category: "Office/Supplies",
      subcategory: "Co-working",
      tag: "negative:coworking",
    });
    last = date;
  }
  return out;
}

/** Hand-placed events: trips, campaigns, equipment and the planted leaks. */
function scheduledRows(): Draft[] {
  const row = (
    date: string,
    descriptor: string,
    amount: number,
    category: Category,
    subcategory: string,
    tag: string | null = null,
  ): Draft => ({ date, descriptor, amount, category, subcategory, tag });

  const [dup] = DEMO_PLANTED.duplicates;
  const unusual = DEMO_PLANTED.unusual;

  return [
    // Holiday trip to Chicago.
    row("2025-11-18", "UNITED      0162398765432 HOUSTON TX", 286.4, "Travel/Transport", "Flights"),
    row("2025-12-22", "JFK AIRTRAIN JAMAICA NY", 8.5, "Travel/Transport", "Airport transfer"),
    row("2025-12-28", "CHICAGO O'HARE CONCESS CHICAGO IL", 14.62, "Food/Dining", "Airport food"),

    // Equipment and supplies.
    row("2025-12-08", "B&H PHOTO 800-606-6969 NY", 349, "Office/Supplies", "Equipment"),
    row("2026-04-02", "B&H PHOTO 800-606-6969 NY", 89.95, "Office/Supplies", "Equipment"),
    row("2026-01-20", "MOO PRINT INC 401-519-5100 RI", 64, "Marketing/Ads", "Business cards"),
    row("2026-06-11", "MOO PRINT INC 401-519-5100 RI", 38, "Marketing/Ads", "Business cards"),

    // Spring paid social campaign for a portfolio launch, billed as spend accrues.
    row("2026-03-02", "FACEBK *ADS 4KQ2JX8L92 FB.ME/ADS CA", 41.27, "Marketing/Ads", "Social ads"),
    row("2026-03-16", "FACEBK *ADS 7HT3PZ1M48 FB.ME/ADS CA", 63.8, "Marketing/Ads", "Social ads"),
    row("2026-03-30", "FACEBK *ADS 2WR8QN5D13 FB.ME/ADS CA", 58.15, "Marketing/Ads", "Social ads"),
    row("2026-04-13", "FACEBK *ADS 9LM4VB7C66 FB.ME/ADS CA", 72.4, "Marketing/Ads", "Social ads"),
    row("2026-09-08", "FACEBK *ADS 3PX6KD2R71 FB.ME/ADS CA", 48.9, "Marketing/Ads", "Social ads"),
    row("2026-09-29", "FACEBK *ADS 6NB1TQ9W24 FB.ME/ADS CA", 66.35, "Marketing/Ads", "Social ads"),
    row("2026-10-05", "GOOGLE *ADS8823417765 CC@GOOGLE.COM CA", 35.12, "Marketing/Ads", "Search ads"),

    // San Francisco client workshop, 9 to 12 March.
    row("2026-02-17", "JETBLUE     2792187654321 SALT LAKE CTY UT", 412.3, "Travel/Transport", "Flights"),
    row("2026-03-09", "JFK AIRTRAIN JAMAICA NY", 8.5, "Travel/Transport", "Airport transfer"),
    row("2026-03-09", "LYFT   *RIDE MON 6PM 855-865-9553 CA", 41.18, "Travel/Transport", "Rideshare"),
    row("2026-03-10", "SQ *RITUAL COFFEE ROASTERS SAN FRANCISCO CA", 6.97, "Food/Dining", "Coffee"),
    row("2026-03-10", "TST* TARTINE MANUFACTORY SAN FRANCISCO CA", 34.62, "Food/Dining", "Restaurants"),
    row("2026-03-10", "LYFT   *RIDE TUE 8AM 855-865-9553 CA", 18.44, "Travel/Transport", "Rideshare"),
    row("2026-03-11", "SQ *RITUAL COFFEE ROASTERS SAN FRANCISCO CA", 11.86, "Food/Dining", "Coffee"),
    row("2026-03-11", "SQ *SOUVLA SAN FRANCISCO CA", 24.18, "Food/Dining", "Restaurants"),
    row("2026-03-11", "LYFT   *RIDE WED 7PM 855-865-9553 CA", 22.71, "Travel/Transport", "Rideshare"),
    row("2026-03-12", "HOTEL VIA SAN FRANCISCO CA", 687.45, "Accommodation", "Hotel"),
    row("2026-03-12", "LYFT   *RIDE THU 5AM 855-865-9553 CA", 38.9, "Travel/Transport", "Rideshare"),
    row("2026-03-12", "SFO HUDSON NEWS 4412 SAN FRANCISCO CA", 9.48, "Food/Dining", "Airport food"),

    // Day trip to a client in Boston.
    row("2026-05-06", "AMTRAK .CO2690512398765 WASHINGTON DC", 149, "Travel/Transport", "Train"),
    row("2026-05-20", "SQ *TATTE BAKERY BOSTON MA", 16.33, "Food/Dining", "Lunch"),

    // Design conference in Philadelphia, 14 to 16 September.
    row("2026-08-20", "AMTRAK .CO2690598765432 WASHINGTON DC", 98, "Travel/Transport", "Train"),
    row("2026-08-21", "AIRBNB * HMQX4K2T5B 415-800-5959 CA", 356.8, "Accommodation", "Short-term rental"),
    row("2026-09-14", "SEPTA KEY TVM PHILADELPHIA PA", 5, "Travel/Transport", "Transit"),
    row("2026-09-14", "READING TERMINAL MKT PHILADELPHIA PA", 18.4, "Food/Dining", "Lunch"),
    row("2026-09-15", "SQ *LA COLOMBE FISHTOWN PHILADELPHIA PA", 5.66, "Food/Dining", "Coffee"),
    row("2026-09-15", "TST* SOUTH PHILLY BARBACOA PHILADELPHIA PA", 31.75, "Food/Dining", "Restaurants"),

    // A few one-off tickets and games.
    row("2025-12-13", "TICKETMASTER 800-653-8000 CA", 148.3, "Entertainment", "Concerts"),
    row("2026-04-25", "TICKETMASTER 800-653-8000 CA", 96.5, "Entertainment", "Concerts"),
    row("2026-07-11", "SQ *SMORGASBURG BROOKLYN NY", 27.5, "Food/Dining", "Market"),
    row("2025-12-26", "STEAMGAMES.COM 4259522985 WA", 29.99, "Entertainment", "Games"),
    row("2026-08-01", "STEAMGAMES.COM 4259522985 WA", 19.99, "Entertainment", "Games"),

    // Planted duplicate: one dinner charged twice.
    ...dup.dates.map((date) =>
      row(date, dup.descriptor, dup.amount, dup.category, "Restaurants", `duplicate:${dup.id}`),
    ),

    // Planted unusual charges.
    ...unusual.map((u) =>
      row(u.date, u.descriptor, u.amount, u.category, u.subcategory, `unusual:${u.id}`),
    ),
  ];
}

/** Haircuts every five to nine weeks, tip included. */
function haircuts(rng: Rng): Draft[] {
  const out: Draft[] = [];
  for (let d = addDays(DEMO_PERIOD.start, rng.int(3, 20)); d <= DEMO_PERIOD.end; d = addDays(d, rng.int(35, 63))) {
    out.push({
      date: d,
      descriptor: "SQ *FADE & FOLD BARBERS BROOKLYN NY",
      amount: cents(38 + rng.int(7, 14)),
      category: "Misc",
      subcategory: "Personal care",
      tag: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const DUPLICATE_WINDOW_DAYS = 3;
const MAX_REROLLS = 6;

/**
 * Drops or re-prices unplanted rows that would look like a duplicate of
 * another row (same merchant and amount within 3 days). Planted rows are
 * registered first and never changed.
 */
function removeAccidentalDuplicates(drafts: Draft[]): Draft[] {
  const seen = new Map<string, string[]>();
  const keyOf = (d: Draft, amount: number) => `${vendorKey(d.descriptor)}|${Math.round(amount * 100)}`;
  const collides = (d: Draft, amount: number) =>
    (seen.get(keyOf(d, amount)) ?? []).some(
      (other) => Math.abs(daysBetween(other, d.date)) <= DUPLICATE_WINDOW_DAYS,
    );
  const register = (d: Draft) => {
    const key = keyOf(d, d.amount);
    seen.set(key, [...(seen.get(key) ?? []), d.date]);
  };

  const planted = drafts.filter((d) => d.tag !== null);
  const everyday = drafts.filter((d) => d.tag === null);
  planted.forEach(register);

  const kept: Draft[] = [...planted];
  for (const draft of everyday) {
    let amount = draft.amount;
    for (let i = 0; i < MAX_REROLLS && collides(draft, amount) && draft.reroll; i++) {
      amount = draft.reroll();
    }
    if (collides(draft, amount)) continue;
    const accepted = { ...draft, amount };
    register(accepted);
    kept.push(accepted);
  }
  return kept;
}

// Code-unit comparison, not localeCompare: ids must not depend on the
// runtime's locale (Node in tests, any browser in the demo).
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function byDateThenDescriptor(a: Draft, b: Draft): number {
  return compare(a.date, b.date) || compare(a.descriptor, b.descriptor) || a.amount - b.amount;
}

/** Generates the full demo dataset. Same seed, same rows, byte for byte. */
export function generateDemoRows(seed: number = DEMO_SEED): DemoRow[] {
  const rng = createRng(seed);
  const days = eachDay(DEMO_PERIOD.start, DEMO_PERIOD.end);
  // Away in San Francisco: no Brooklyn coffee, groceries or co-working.
  const away = new Set(eachDay("2026-03-09", "2026-03-12"));

  const drafts: Draft[] = [
    ...DEMO_SUBSCRIPTIONS.flatMap(subscriptionCharges),
    ...rentPayments(rng),
    ...coworkingPasses(rng, days, away),
    ...scheduledRows(),
    ...haircuts(rng),
    ...habitRows(rng, days, away),
  ].filter((d) => d.date >= DEMO_PERIOD.start && d.date <= DEMO_PERIOD.end);

  return removeAccidentalDuplicates(drafts)
    .sort(byDateThenDescriptor)
    .map((d, i) => ({
      id: `demo-${String(i + 1).padStart(4, "0")}`,
      date: d.date,
      descriptor: d.descriptor,
      amount: d.amount,
      category: d.category,
      subcategory: d.subcategory,
      tag: d.tag,
    }));
}
