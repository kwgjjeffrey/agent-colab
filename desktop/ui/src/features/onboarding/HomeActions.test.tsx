// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeActions, workspaceSetupPrompt } from "./HomeActions";
afterEach(cleanup);
it("orders guidance rows and dispatches each real creation kind", async () => {
  const onAdd = vi.fn();
  render(<HomeActions channel={{id:"ch",name:"Team"}} onAdd={onAdd} quickShare={<button>Quick Share</button>} defaultAgent="codex" installedAgents={{}} onError={vi.fn()} />);
  const region = screen.getByRole("region", {name:"Channel actions"});
  expect(within(region).getAllByRole("button").map(button => button.textContent)).toEqual(["Call my Agent", "Share my Session", "Share my Files", "Share my Skills", "Add a Canvas", "Catalog", "Quick Share"]);
  for (const label of ["Share my Session", "Share my Files", "Share my Skills", "Add a Canvas", "Catalog"]) await userEvent.click(screen.getByRole("button", {name:label}));
  expect(onAdd.mock.calls.map(call => call[0])).toEqual(["session","files","skill","canvas","catalog"]);
  expect(screen.getByRole("button", {name:"Call my Agent"}).className).toContain("bg-agent");
});
it("locates the selected Agent Skill and exact Channel, without inventing mutations", () => {
  const prompt = workspaceSetupPrompt("claude", {id:"channel-id",name:"Team's workspace"});
  expect(prompt).toContain("~/.claude/skills/agent-colab/SKILL.md");
  expect(prompt).toContain("colab-explorer open --ref 'colab://channel/channel-id'");
  expect(prompt).toContain("ask what I want to accomplish");
  expect(prompt).toContain("confirm sharing scope");
});
