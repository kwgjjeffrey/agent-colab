import { expect, it } from "vitest";
import { avatarBackground, avatarPalette } from "./avatar-palette";
it("uses deterministic identity colours with legible white initials", () => {
  expect(avatarBackground(" ZY ")).toBe(avatarBackground("zy"));
  expect(avatarBackground("ZY")).toBe(avatarBackground("Z"));
  expect(new Set(["ZY", "JY", "CH", "AB", "MD"].map(avatarBackground)).size).toBeGreaterThan(2);
  for (const colour of avatarPalette) {
    const channels = colour.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    expect(1.05 / (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
