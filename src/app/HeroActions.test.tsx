// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const user = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/components/useAuthUser", () => ({ useAuthUser: () => user.current }));
vi.mock("./home.module.css", () => ({ default: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock("next/link", () => ({
  default: ({ children, ...p }: React.ComponentProps<"a">) => <a {...p}>{children}</a>,
}));
import HeroActions from "./HeroActions";

afterEach(() => cleanup());

describe("landing calls to action", () => {
  it("offers the demo and sign-up to visitors", () => {
    user.current = null;
    render(<HeroActions />);
    expect(screen.getByRole("link", { name: /Try the demo/ }).getAttribute("href")).toBe("/demo");
    expect(screen.getByRole("link", { name: /Sign up/ })).toBeTruthy();
  });

  it("greets a signed-in person by name and drops the sign-up buttons", () => {
    user.current = { email: "john@example.com", user_metadata: { first_name: "John" } };
    render(<HeroActions />);
    expect(screen.getByText("Ready to check your expenses, John?")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open your workspace/ }).getAttribute("href")).toBe("/expense-intel");
    expect(screen.queryByRole("link", { name: /Try the demo/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Sign up/ })).toBeNull();
  });

  it("hides the buttons until the session is known", () => {
    user.current = undefined;
    const { container } = render(<HeroActions />);
    expect((container.firstChild as HTMLElement).style.visibility).toBe("hidden");
  });
});
