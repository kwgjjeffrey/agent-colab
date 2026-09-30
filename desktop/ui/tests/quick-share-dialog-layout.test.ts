import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/features/transfers/QuickShareDialog.tsx", import.meta.url),
  "utf8",
);

describe("Quick Share dialog layout", () => {
  it("keeps the shadcn footer outside the independently scrolling result body", () => {
    const resultView = source.slice(source.indexOf("function ResultView"));

    expect(resultView).toContain('<ScrollArea className="min-h-0 flex-1">');
    expect(resultView).not.toContain("<DialogFooter");
    expect(source.indexOf("<DialogFooter>")).toBeLessThan(source.indexOf("function ResultView"));
  });
});
