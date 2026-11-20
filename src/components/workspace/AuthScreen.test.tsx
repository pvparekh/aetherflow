// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));
const replace = vi.hoisted(() => vi.fn());
vi.mock("../../../utils/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...p }: React.ComponentProps<"a">) => <a {...p}>{children}</a>,
}));

import AuthScreen, { authMessage, safeNext } from "./AuthScreen";

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => cleanup());

async function fill(user: ReturnType<typeof userEvent.setup>, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) await user.type(screen.getByLabelText(label), value);
}

describe("auth helpers", () => {
  it("only follows same-site next paths", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("//evil.example")).toBe("/expense-intel");
    expect(safeNext("https://evil.example")).toBe("/expense-intel");
    expect(safeNext(null)).toBe("/expense-intel");
  });
  it("explains the errors people hit", () => {
    expect(authMessage({ code: "invalid_credentials" })).toMatch(/don't match/);
    expect(authMessage({ message: "Email not confirmed" })).toMatch(/Confirm your email/);
    expect(authMessage({ status: 429 })).toMatch(/Too many emails/);
  });
});

describe("sign in and sign up", () => {
  it("rejects a wrong password and stays on the page", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", message: "Invalid login credentials" } });
    const user = userEvent.setup();
    render(<AuthScreen />);
    await fill(user, { "Email address": "a@example.com", Password: "wrong" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That email and password don't match an account.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks a new user to confirm their email and offers a resend", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    auth.resend.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<AuthScreen signup />);
    await fill(user, { "Full name": "Ada", "Email address": "ada@example.com", Password: "longenough" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/sent a confirmation link to ada@example.com/)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmation email again/ }));
    expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "ada@example.com" }));
  });

  it("says when an email already has an account", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const user = userEvent.setup();
    render(<AuthScreen signup />);
    await fill(user, { "Full name": "Ada", "Email address": "ada@example.com", Password: "longenough" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already uses this email/);
  });

  it("sends a password reset link back to the reset page", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<AuthScreen />);
    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await fill(user, { "Email address": "ada@example.com" });
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/a link to set a new password is on its way/)).toBeTruthy();
    const [, options] = auth.resetPasswordForEmail.mock.calls[0];
    expect(decodeURIComponent(options.redirectTo)).toContain("/auth/callback?next=/reset-password");
  });

  it("signs in and continues to the workspace", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<AuthScreen />);
    await fill(user, { "Email address": "a@example.com", Password: "right" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/expense-intel"));
  });
});
