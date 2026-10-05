// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageAgentIdentity } from "./MessageAgentIdentity";
import type { Blueprint, AgentRequestStatus } from "./types";
afterEach(cleanup);
it("opens on click and closes on a second click", async () => {
  const user = userEvent.setup();
  render(<MessageAgentIdentity agent={{id:"agent",name:"Researcher",ownerName:"Alice"} as Blueprint} name="Researcher" requests={[]} showWork={vi.fn()} />);
  const trigger = screen.getByRole("button", {name:"About Researcher"});
  await user.click(trigger);
  await screen.findByText("Alice's Agent");
  expect(screen.queryByText("Alice's Agent")).not.toBeNull();
  await user.click(trigger);
  await waitFor(() => expect(screen.queryByText("Alice's Agent")).toBeNull());
});
it("opens the shared identity card on click and routes the selected task", async () => {
  const user = userEvent.setup(), showWork = vi.fn();
  const task = { id: "task", targetBlueprintId: "agent", state: "succeeded", summary: "Read document" } as AgentRequestStatus;
  render(<MessageAgentIdentity agent={{id:"agent",name:"Researcher",ownerName:"Alice"} as Blueprint} name="Researcher" requests={[task]} showWork={showWork} />);
  await user.click(screen.getByRole("button", {name:"About Researcher"}));
  const trigger = screen.getByRole("button", {name:"About Researcher"});
  expect(trigger.className).toContain("inline-flex");
  expect(trigger.firstElementChild?.className).toContain("inline-flex");
  expect(await screen.findByText("Alice's Agent")).not.toBeNull();
  await user.click(screen.getByRole("button", {name:/Read document/}));
  expect(showWork).toHaveBeenCalledWith(task);
  await waitFor(() => expect(screen.queryByText("Alice's Agent")).toBeNull());
});
