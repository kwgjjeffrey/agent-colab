import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesViewSource = readFileSync(
  new URL("../src/features/files/FilesView.tsx", import.meta.url),
  "utf8",
);
const quickShareSource = readFileSync(
  new URL("../src/features/transfers/QuickShareDialog.tsx", import.meta.url),
  "utf8",
);

describe("Files source selection", () => {
  it("keeps one visible picker action in Channel Files", () => {
    expect(filesViewSource).toContain('data-icon="inline-start" />Share files');
    expect(filesViewSource).not.toContain("Choose a file</DropdownMenuItem>");
    expect(filesViewSource).not.toContain("Choose a folder</DropdownMenuItem>");
  });

  it("keeps one visible picker action in Quick Share", () => {
    expect(quickShareSource).toContain('"Choose Files"');
    expect(quickShareSource).not.toContain("Choose a file</DropdownMenuItem>");
    expect(quickShareSource).not.toContain("Choose a folder</DropdownMenuItem>");
  });
});
