// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEMO_TODAY, demoTxns } from "@/lib/demo";
import { buildLeakReport } from "@/lib/expense-intel/leaks";
import { PRESET_QUESTIONS } from "@/lib/expense-intel/ask";
import BudgetsView from "../BudgetsView";
import AskView from "../AskView";
import type { ViewProps } from "../types";

// Vitest cannot load the project's PostCSS (Tailwind) config, so CSS modules
// are stubbed: each class name maps to itself.
vi.mock("../budgets-ask.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));

const txns = demoTxns();
const report = buildLeakReport(txns, DEMO_TODAY);

function demoProps(): ViewProps {
  return { demo: true, report, txns, today: DEMO_TODAY };
}

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BudgetsView (demo)", () => {
  it("shows seeded budgets with spent and limit amounts for the latest month", () => {
    render(<BudgetsView {...demoProps()} />);

    // Opens on October 2026, the month of the latest demo expense.
    expect((screen.getByLabelText("Month") as HTMLSelectElement).value).toBe("2026-10");

    const list = screen.getByRole("list", { name: "Budgets" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(5);

    const food = rows.find((r) => r.textContent?.includes("Food / Dining"));
    expect(food?.textContent).toMatch(/\$\d[\d,]*\.\d{2} of \$800\.00/);

    // October software spend in the demo is over its $300 limit.
    const software = rows.find((r) => r.textContent?.includes("Software / SaaS"));
    expect(software?.textContent).toMatch(/Over by \$\d/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("edits a budget with inline validation and adds a new one", async () => {
    const user = userEvent.setup();
    render(<BudgetsView {...demoProps()} />);

    await user.click(screen.getByRole("button", { name: "Edit Software / SaaS budget" }));
    const input = screen.getByLabelText("Monthly limit for Software / SaaS");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toMatch(/more than zero/);

    await user.clear(input);
    await user.type(input, "1,000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const list = screen.getByRole("list", { name: "Budgets" });
    expect(within(list).getByText("$1,000.00")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Category"), "Misc");
    await user.type(screen.getByLabelText("Monthly limit"), "1500");
    await user.click(screen.getByRole("button", { name: "Add budget" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("$1,500.00")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove Misc budget" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AskView (demo)", () => {
  it("answers a preset question in the browser with a computed dollar figure", async () => {
    const user = userEvent.setup();
    render(<AskView {...demoProps()} />);

    expect((screen.getByLabelText("Your question") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Free-form questions need an account/)).toBeTruthy();

    const preset = PRESET_QUESTIONS.find((p) => p.id === "software-last-month")!;
    await user.click(screen.getByRole("button", { name: preset.question }));

    const answer = await screen.findByRole("article", { name: "Answer" });
    expect(answer.textContent).toMatch(/You spent \$\d[\d,]*\.\d{2}/);
    expect(within(answer).getByText("How this was computed")).toBeTruthy();
    expect(within(answer).getByText("Software/SaaS", { selector: "dd" })).toBeTruthy();
    expect(within(answer).getByText(/Oct 1, 2026 to Oct 31, 2026/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows grouped results as a ranked list", async () => {
    const user = userEvent.setup();
    render(<AskView {...demoProps()} />);
    const preset = PRESET_QUESTIONS.find((p) => p.id === "top-vendors-this-year")!;
    await user.click(screen.getByRole("button", { name: preset.question }));
    const answer = await screen.findByRole("article", { name: "Answer" });
    const items = within(answer).getAllByRole("listitem");
    expect(items.length).toBe(5);
    expect(items[0].textContent).toMatch(/\$\d/);
  });
});

describe("AskView (signed in)", () => {
  function signedInProps(): ViewProps {
    return { demo: false, report, txns: null, today: "2026-11-19" };
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("posts the question and shows the server's rate-limit message", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: "Too many questions. Wait a minute and try again." }, 429),
    );
    const user = userEvent.setup();
    render(<AskView {...signedInProps()} />);
    await user.type(screen.getByLabelText("Your question"), "How much on food?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many questions/);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/expense-intel/ask",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ question: "How much on food?" }) }),
    );
  });

  it("shows a declined answer politely", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        kind: "declined",
        reason: "advice",
        answer: { text: "I can only report what's in your uploaded expenses.", source: "template" },
      }),
    );
    const user = userEvent.setup();
    render(<AskView {...signedInProps()} />);
    await user.type(screen.getByLabelText("Your question"), "Should I buy stocks?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/I can only report/)).toBeTruthy();
  });
});
