// Hand-written queries for the demo's suggested questions. Isomorphic.
//
// The demo runs these through `runQuery` in the browser with no model, using
// the demo data's last date as `today`. They are written in the same query
// language the translator emits, so they double as translation examples.
import type { AskFilters, PresetQuestion } from "./types";

const ALL: AskFilters = {
  categories: [],
  vendorText: null,
  period: "all_time",
  dateFrom: null,
  dateTo: null,
  minAmount: null,
  maxAmount: null,
  recurringOnly: false,
};

export const PRESET_QUESTIONS: readonly PresetQuestion[] = [
  {
    id: "software-last-month",
    question: "How much did I spend on software last month?",
    query: {
      metric: "sum",
      groupBy: "none",
      filters: { ...ALL, categories: ["Software/SaaS"], period: "last_month" },
      sort: "value_desc",
      limit: 1,
    },
  },
  {
    id: "top-vendors-this-year",
    question: "Who were my top 5 vendors this year?",
    query: {
      metric: "sum",
      groupBy: "vendor",
      filters: { ...ALL, period: "this_year" },
      sort: "value_desc",
      limit: 5,
    },
  },
  {
    id: "monthly-trend",
    question: "How has my spending changed month by month over the past year?",
    query: {
      metric: "sum",
      groupBy: "month",
      filters: { ...ALL, period: "last_12_months" },
      sort: "oldest",
      limit: 12,
    },
  },
  {
    id: "recurring-by-vendor",
    question: "Which recurring charges have cost me the most?",
    query: {
      metric: "sum",
      groupBy: "vendor",
      filters: { ...ALL, recurringOnly: true },
      sort: "value_desc",
      limit: 10,
    },
  },
  {
    id: "biggest-recent",
    question: "What was my biggest single expense in the last 90 days?",
    query: {
      metric: "max",
      groupBy: "none",
      filters: { ...ALL, period: "last_90_days" },
      sort: "value_desc",
      limit: 1,
    },
  },
  {
    id: "travel-over-200",
    question: "Show my travel expenses over $200 this year.",
    query: {
      metric: "list",
      groupBy: "none",
      filters: { ...ALL, categories: ["Travel/Transport"], minAmount: 200, period: "this_year" },
      sort: "newest",
      limit: 20,
    },
  },
];
