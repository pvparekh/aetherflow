// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import latest from "../../../evals/results/latest.json";
import { buildScoreboard } from "./scoreboard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/how-it-works",
}));
// Vite's CSS pipeline cannot load the Tailwind PostCSS config under Vitest;
// class names do not matter to these assertions.
vi.mock("./how-it-works.module.css", () => ({ default: {} }));
vi.mock("next/link", () => ({
  default: ({ children, ...p }: React.ComponentProps<"a">) => <a {...p}>{children}</a>,
}));

import HowItWorks, { metadata } from "./page";

afterEach(() => cleanup());

const run = latest.runs[latest.runs.length - 1];
const accuracy = `${(run.categorisation.accuracy * 100).toFixed(1)}%`;

describe("how it works page", () => {
  it("shows the accuracy and model from evals/results/latest.json", () => {
    render(<HowItWorks />);
    const tile = screen.getByText("Accuracy").closest("div") as HTMLElement;
    expect(within(tile).getByText(accuracy)).toBeTruthy();
    expect(screen.getAllByText(run.model).length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(
      Object.keys(run.categorisation.perCategory).length + 1,
    );
  });

  it("exports page metadata", () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });
});

describe("scoreboard derivation", () => {
  it("reconstructs missed and extra rows that balance against accuracy", () => {
    const board = buildScoreboard();
    const missed = board.categories.reduce((n, r) => n + r.missed, 0);
    const extra = board.categories.reduce((n, r) => n + r.extra, 0);
    expect(missed).toBe(board.datasetRows - board.correct);
    expect(extra).toBe(missed);
  });
});
