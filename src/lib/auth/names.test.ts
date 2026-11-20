import { describe, expect, it } from "vitest";
import { firstName, lastName, nameMetadata } from "./names";

describe("names", () => {
  it("prefers the saved first name, then Google's, then the full name, then the email", () => {
    expect(firstName({ user_metadata: { first_name: "Ada", full_name: "Augusta Ada King" } })).toBe("Ada");
    expect(firstName({ user_metadata: { given_name: "Grace" } })).toBe("Grace");
    expect(firstName({ user_metadata: { full_name: "Alan Turing" } })).toBe("Alan");
    expect(firstName({ email: "katherine@example.com", user_metadata: {} })).toBe("katherine");
  });
  it("derives a last name and saves both with a full name", () => {
    expect(lastName({ user_metadata: { full_name: "Ada Lovelace" } })).toBe("Lovelace");
    expect(nameMetadata("  Ada ", " Lovelace ")).toEqual({ first_name: "Ada", last_name: "Lovelace", full_name: "Ada Lovelace" });
  });
});
