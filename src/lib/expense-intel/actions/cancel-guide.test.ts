import { describe, expect, it } from "vitest";
import { vendorKey } from "../normalize";
import { CANCEL_GUIDE, findGuideEntry } from "./cancel-guide";

describe("findGuideEntry", () => {
  it.each([
    ["NETFLIX.COM 866-579-7172 CA", "netflix"],
    ["SPOTIFY USA", "spotify"],
    ["APPLE.COM/BILL 866-712-7753", "apple"],
    ["HBO MAX", "hbo-max"],
    ["GOOGLE *YouTubePremium", "youtube"],
    ["GOOGLE *Google One", "google-one"],
    ["Google Workspace", "google-workspace"],
    ["MSFT *MICROSOFT 365", "microsoft-365"],
    ["ADOBE *CREATIVE CLOUD", "adobe"],
    ["FIGMA MONTHLY", "figma"],
    ["OPENAI *CHATGPT SUBSCR", "openai"],
    ["ANTHROPIC CLAUDE.AI", "claude"],
    ["SQ *SQUARESPACE", "squarespace"],
    ["1PASSWORD", "1password"],
  ])("matches %s", (raw, id) => {
    expect(findGuideEntry(vendorKey(raw))?.id).toBe(id);
  });

  it.each(["WHOLE FOODS MARKET", "CLAUDE'S BISTRO", "MAXWELL HARDWARE", "PINEAPPLE CAFE", ""])(
    "does not match %s",
    (raw) => {
      expect(findGuideEntry(vendorKey(raw))).toBeNull();
    },
  );
});

describe("CANCEL_GUIDE data", () => {
  it("covers about 40 vendors with unique ids and names", () => {
    expect(CANCEL_GUIDE.length).toBeGreaterThanOrEqual(38);
    expect(new Set(CANCEL_GUIDE.map((e) => e.id)).size).toBe(CANCEL_GUIDE.length);
    expect(new Set(CANCEL_GUIDE.map((e) => e.name)).size).toBe(CANCEL_GUIDE.length);
  });

  it("records a check date and plain steps for every entry", () => {
    for (const e of CANCEL_GUIDE) {
      expect(e.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.steps.length).toBeGreaterThanOrEqual(2);
      expect(e.patterns.length).toBeGreaterThan(0);
    }
  });

  it("links only to https pages on the vendor's own domains", () => {
    const aggregators = /justuseapp|donotpay|rocketmoney|truebill|wikihow|howtocancel|cancel(?:lation)?guide/i;
    for (const e of CANCEL_GUIDE) {
      if (e.cancelUrl === null) continue;
      const url = new URL(e.cancelUrl);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).not.toMatch(aggregators);
    }
  });
});
