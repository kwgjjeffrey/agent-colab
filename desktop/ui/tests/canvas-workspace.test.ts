import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const view = readFileSync(new URL("../src/features/canvas/CanvasView.tsx", import.meta.url), "utf8");
const tree = readFileSync(new URL("../src/features/canvas/CanvasResourceTree.tsx", import.meta.url), "utf8");
const mention = readFileSync(new URL("../src/features/canvas/CanvasMention.tsx", import.meta.url), "utf8");

describe("Canvas workspace actions", () => {
  it("creates documents and folders through real Local Core routes", () => {
    expect(tree).toContain("canvas-folders");
    expect(tree).toContain('create("document")');
    expect(tree).toContain('create("folder")');
    expect(tree).toContain("parentFolderId: parentId");
    expect(tree).toContain("folderId: parentId");
  });

  it("offers a child create action on every folder", () => {
    expect(tree).toContain("Create document in ${folder.name}");
    expect(tree).toContain('create("document", folder.id)');
  });

  it("renders null-rooted server resources and renames them inline", () => {
    expect(tree).toContain("(folder.parentFolderId ?? null) === parentId");
    expect(tree).toContain("(document.folderId ?? null) === parentId");
    expect(tree).toContain("onDoubleClick");
    expect(tree).toContain('method: "PATCH"');
  });

  it("uses the shared Agent handoff dialog with complete Canvas commands", () => {
    expect(view).toContain("<AgentPromptDialog");
    expect(view).toContain("colab-canvas");
    expect(view).toContain("list --channel");
    expect(view).toContain("read --ref");
    expect(view).toContain("apply-patch --ref");
    expect(view.indexOf("read --ref")).toBeLessThan(view.indexOf("apply-patch --ref"));
    expect(view.indexOf("apply-patch --ref")).toBeLessThan(view.indexOf("list --channel"));
    expect(view).not.toContain("physical document.md");
  });

  it("shows task-scoped command history for the selected Agent while keeping send reusable", () => {
    expect(view).toContain("agent_requests.invalidated");
    expect(mention).toContain("value.targetBlueprintId === id");
    expect(view).toContain("<AgentWorkDrawer");
    expect(mention).toContain("<AgentIdentityCard");
    expect(mention).toContain('"Send to Agent"');
    expect(view).not.toContain("agent-colab:canvas-activity:");
    expect(view).not.toContain('activity.state==="succeeded"');
  });

  it("uses standard HoverCard on the editor atom, not manually positioned mouse handlers", () => {
    expect(view).toContain("ReactNodeViewRenderer(CanvasMention)");
    expect(mention).toMatch(/<HoverCard(?:\s|>)/);
    expect(mention).toContain("<HoverCardTrigger");
    expect(mention).toContain("<HoverCardContent");
    expect(view).not.toContain("cardPosition");
    expect(view).toContain("sectionMarkdown(position)");
  });

  it("opens block formatting from a paragraph hover handle", () => {
    expect(view).toContain('aria-label="Change block type"');
    expect(view).toContain("GripVerticalIcon");
    expect(view).toContain("setHeading");
    expect(view).toContain("toggleBulletList");
    expect(view).toContain("toggleBlockquote");
    expect(view).not.toContain("sticky top-0");
    expect(view).toContain("mx-auto min-h-full w-full max-w-4xl px-12");
  });
});
