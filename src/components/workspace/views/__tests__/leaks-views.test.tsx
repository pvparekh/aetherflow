// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLeakReport } from "@/lib/expense-intel/leaks";
import { formatUsd } from "@/lib/expense-intel/ai/format";
import type { LeakReport } from "@/lib/expense-intel/contracts";
import { demoTxns, DEMO_PLANTED, DEMO_TODAY } from "@/lib/demo";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/imports/http", () => ({ api: request }));
// The project's PostCSS config is for Next (Tailwind) and cannot run under
// Vite, so the CSS module is replaced by its class names.
vi.mock("../leaks.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === "string" ? key : undefined) }),
}));

import LeaksView from "../LeaksView";
import SubscriptionsView from "../SubscriptionsView";
import type { ViewProps } from "../types";

const txns = demoTxns();
const report = buildLeakReport(txns, DEMO_TODAY);
const adobeChange = DEMO_PLANTED.priceChanges[0];
const duplicate = DEMO_PLANTED.duplicates[0];

function props(overrides: Partial<ViewProps> = {}): ViewProps {
  return { demo: true, report, txns, today: DEMO_TODAY, ...overrides };
}

const fetchSpy = vi.fn();
beforeEach(() => {
  request.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeaksView", () => {
  it("leads with the yearly amount found and explains what it is made of", () => {
    render(<LeaksView {...props()} />);
    const headline = screen.getByRole("heading", { level: 2, name: /We found/ });
    expect(headline.textContent).toBe(`We found ${formatUsd(report.totals.foundAnnual)} a year`);
    expect(report.totals.foundAnnual).toBeGreaterThan(0);
    expect(screen.getAllByText(formatUsd(report.totals.priceIncreasesAnnual)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatUsd(report.totals.duplicatesTotal)).length).toBeGreaterThan(0);
  });

  it("lists Adobe's price increase, the duplicate charge and the unusual charges", () => {
    render(<LeaksView {...props()} />);
    const increases = screen.getByRole("region", { name: "Price increases" });
    expect(within(increases).getByText("Adobe")).toBeTruthy();
    expect(within(increases).getByText(formatUsd(adobeChange.previousAmount))).toBeTruthy();
    expect(within(increases).getByText(new RegExp(formatUsd(adobeChange.newAmount).replace("$", "\\$")))).toBeTruthy();

    const duplicates = screen.getByRole("region", { name: "Duplicate charges" });
    expect(within(duplicates).getByText(/Robertas/)).toBeTruthy();
    expect(within(duplicates).getByText(new RegExp(`${formatUsd(duplicate.amount).replace("$", "\\$")} charged 2 times`))).toBeTruthy();

    const unusual = screen.getByRole("region", { name: "Unusual charges" });
    for (const u of report.unusual) expect(within(unusual).getByText(u.reason)).toBeTruthy();
    expect(unusual.textContent).not.toMatch(/z-score|baseline|standard deviation/i);
  });

  it("links summary cards to the subscriptions view", async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(<LeaksView {...props({ navigate })} />);
    await user.click(screen.getByRole("button", { name: /^Subscriptions: 12\./ }));
    expect(navigate).toHaveBeenCalledWith("subscriptions");
    expect(screen.getByRole("button", { name: /^Possibly cancelled: 1\. Hulu/ })).toBeTruthy();
  });

  it("shows an empty state when nothing is found", () => {
    const empty: LeakReport = buildLeakReport([], DEMO_TODAY);
    render(<LeaksView {...props({ report: empty, txns: [] })} />);
    expect(screen.getByRole("heading", { name: "No leaks found yet" })).toBeTruthy();
  });
});

describe("SubscriptionsView", () => {
  it("lists subscriptions by yearly cost with the yearly total", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsView {...props()} />);
    expect(screen.getAllByText(formatUsd(report.totals.subscriptionsAnnual)).length).toBeGreaterThan(0);
    const list = screen.getByRole("list", { name: "Subscriptions" });
    const names = () => within(list).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(names()[0]).toBe("Verizon");
    expect(names().at(-1)).toBe("Hulu");
    expect(within(list).getByText("Price went up")).toBeTruthy();
    expect(within(list).getByText("Possibly cancelled")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Sort by"), "cost-asc");
    expect(names()[0]).toBe("Apple");
  });

  it("offers an .ics calendar export and shows upcoming charges", () => {
    render(<SubscriptionsView {...props()} />);
    expect(screen.getByRole("button", { name: /Add to calendar \(\.ics\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "This week" })).toBeTruthy();
  });

  it("links to the calendar route when signed in", () => {
    render(<SubscriptionsView {...props({ demo: false, txns: null })} />);
    const link = screen.getByRole("link", { name: /Add to calendar/ });
    expect(link.getAttribute("href")).toBe("/api/expense-intel/calendar");
  });

  it("opens a cancellation draft in demo mode without any network call, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsView {...props()} />);
    const trigger = screen.getByRole("button", { name: "Draft cancellation for Adobe" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Cancel Adobe" });
    expect(within(dialog).getByText(/Please cancel my Adobe subscription/)).toBeTruthy();
    expect(within(dialog).getByText("Subject: Cancel my Adobe subscription")).toBeTruthy();
    expect(within(dialog).getByText("Cost per year")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Copy message/ })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shows the official cancel link and steps from the cancel guide when one exists", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsView {...props()} />);
    await user.click(screen.getByRole("button", { name: "Draft cancellation for Netflix" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel Netflix" });
    expect(within(dialog).getByRole("link", { name: /Official cancellation page/ }).getAttribute("href")).toMatch(
      /^https:\/\/help\.netflix\.com\//,
    );
    expect(within(dialog).getByText(/Select Cancel, then Finish Cancellation/)).toBeTruthy();
  });

  it("offers a negotiation draft only where the price went up", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsView {...props()} />);
    expect(screen.getAllByRole("button", { name: /Draft negotiation/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Draft negotiation for Adobe" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Adobe for a better price" });
    expect(within(dialog).getByText(/My price went up from \$59\.99 to \$69\.99/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Close draft" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks the drafts route when signed in", async () => {
    request.mockResolvedValue({
      kind: "cancel",
      vendor: "Adobe",
      channel: "email",
      subject: "Cancel my Adobe subscription",
      body: "Hello from the server",
      cancelUrl: null,
      steps: [],
      facts: [],
      source: "model",
    });
    const user = userEvent.setup();
    render(<SubscriptionsView {...props({ demo: false, txns: null })} />);
    await user.click(screen.getByRole("button", { name: "Draft cancellation for Adobe" }));
    expect(await screen.findByText("Hello from the server")).toBeTruthy();
    expect(request).toHaveBeenCalledWith(
      "/api/expense-intel/drafts",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "cancel", streamKey: "adobe:monthly" }) }),
    );
  });
});
