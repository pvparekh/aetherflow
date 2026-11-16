import { describe, expect, it } from "vitest";
import { displayVendor, vendorKey } from "./index";

describe("vendor normalisation baseline", () => {
  it.each([
    ["SQ *BLUE BOTTLE 0423 SAN FRANCISCO CA", "Blue Bottle San Francisco"],
    ["AMZN Mktp US*2K4AB91", "Amazon"],
    ["NETFLIX.COM 866-579-7172 CA", "Netflix"],
    ["PAYPAL *SPOTIFY", "Spotify"],
    ["UBER *EATS PENDING", "Uber Eats"],
    ["Figma", "Figma"],
  ])("%s -> %s", (raw, expected) => {
    expect(displayVendor(raw)).toBe(expected);
  });

  it("gives the same key to variants of one merchant", () => {
    expect(vendorKey("GOOGLE *CLOUD 4H7KQ")).toBe(vendorKey("Google Cloud"));
    expect(vendorKey("TST* JOE'S PIZZA #12")).toBe(vendorKey("Joe's Pizza"));
  });

  it("keeps different merchants apart", () => {
    expect(vendorKey("Uber Eats")).not.toBe(vendorKey("Uber"));
  });
});
