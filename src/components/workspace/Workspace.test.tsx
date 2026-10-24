// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleData } from "./model";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/imports/http", () => ({ api: request }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/expense-intel",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...p }: React.ComponentProps<"a">) => (
    <a {...p}>{children}</a>
  ),
}));
vi.mock("@/components/expense-intel/AllTimeView", () => ({
  default: () => <div>All-time data</div>,
}));
import Workspace from "./Workspace";
beforeEach(() => {
  request.mockReset();
});
afterEach(() => cleanup());
describe("connected workspace interactions", () => {
  it("keeps the demo isolated, filters totals, opens source details and records a reversible review choice", async () => {
    const user = userEvent.setup();
    render(<Workspace demo />);
    expect(screen.getByText(/Synthetic sample data/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Transactions" }));
    await user.type(
      screen.getByPlaceholderText("Vendor or description"),
      "Figma",
    );
    expect(screen.getAllByText("$45.00").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Adobe ↗/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Figma ↗" }));
    expect(screen.getByText("2026-09-03,Figma,45.00")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Review (2)" }));
    await user.click(screen.getAllByRole("button", { name: "Expected" })[0]);
    expect(screen.getByRole("tab", { name: "Review (1)" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("tab", { name: "Review (2)" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });
  it("distinguishes an empty account from a failed load and opens real import controls", async () => {
    request.mockImplementation(async (url: string) =>
      url === "/api/imports" ? { drafts: [] } : { uploads: [] },
    );
    const user = userEvent.setup();
    render(<Workspace />);
    await screen.findByText("Your first clear picture.");
    await user.click(
      screen.getAllByRole("button", { name: /Import expenses/ })[0],
    );
    expect(await screen.findByLabelText("Choose expense file")).toBeTruthy();
    expect(request.mock.calls[0][0]).toBe("/api/expense-intel/uploads");
  });
  it("shows fetch failure without calling it a clean report", async () => {
    request.mockRejectedValue(new Error("Authentication required"));
    render(<Workspace />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No review signals in this scope")).toBeNull();
  });
  it("rolls back failed review resolution and preserves computed results after failed narrative", async () => {
    const d = sampleData();
    request.mockImplementation(async (url: string) => {
      if (url.endsWith("/uploads")) return { uploads: [d.upload] };
      if (url.includes("/dashboard/")) return d;
      throw new Error("Provider unavailable");
    });
    const user = userEvent.setup();
    render(<Workspace />);
    await screen.findByText("Rolling category context");
    await user.click(
      screen.getByRole("button", { name: /Generate interpretation/ }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Rolling category context")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Review (2)" }));
    await user.click(screen.getAllByRole("button", { name: "Expected" })[0]);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Review (2)" })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });
  it("prefers a completed report over a newer interrupted upload", async () => {
    const ready = sampleData();
    const interrupted = {
      ...ready.upload,
      id: "interrupted-upload",
      filename: "interrupted.csv",
      pass1_status: "error",
    };
    request.mockImplementation(async (url: string) => {
      if (url === "/api/expense-intel/uploads")
        return { uploads: [interrupted, ready.upload] };
      if (url === `/api/expense-intel/dashboard/${ready.upload.id}`)
        return ready;
      throw new Error(`Unexpected API request: ${url}`);
    });
    render(<Workspace />);
    expect(await screen.findByText("Rolling category context")).toBeTruthy();
    expect(screen.queryByText("Your report needs to finish processing.")).toBeNull();
    expect(request.mock.calls.some(([url]) => url === "/api/expense-intel/dashboard/interrupted-upload")).toBe(false);
  });
  it("keeps imports accessible when a saved-review request fails", async () => {
    request.mockImplementation(async (url: string) => {
      if (url === "/api/expense-intel/uploads") return { uploads: [] };
      if (url === "/api/imports") throw new Error("Saved reviews unavailable");
      throw new Error(`Unexpected API request: ${url}`);
    });
    const user = userEvent.setup();
    render(<Workspace />);
    await screen.findByText("Your first clear picture.");
    await user.click(screen.getAllByRole("button", { name: /Import expenses/ })[0]);
    expect(await screen.findByLabelText("Choose expense file")).toBeTruthy();
    expect(await screen.findByText(/Saved reviews are temporarily unavailable/)).toBeTruthy();
    expect(screen.queryByText("Your first clear picture.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not render partial statistics as a completed analysis", async () => {
    const d = sampleData();
    d.upload.pass1_status = "processing";
    request.mockImplementation(async (url: string) =>
      url.endsWith("/uploads") ? { uploads: [d.upload] } : d,
    );
    render(<Workspace />);
    expect(
      await screen.findByText("Your report needs to finish processing."),
    ).toBeTruthy();
    expect(screen.queryByText("Rolling category context")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Retry computed analysis" }),
    ).toBeTruthy();
  });
});
