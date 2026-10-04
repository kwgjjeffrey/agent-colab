// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForwardToAgentDialog } from "./ForwardToAgentDialog";
import type { Blueprint } from "@/features/messages/types";
afterEach(cleanup);
it("choosing an Agent does not send; explicit Send includes the typed instruction", async () => {
  const send = vi.fn(async () => {}),
    close = vi.fn(),
    agent = { id: "agent", name: "Builder", ownerName: "Alice" } as Blueprint;
  render(
    <ForwardToAgentDialog
      open
      agents={[agent]}
      contextLabel="Design"
      onClose={close}
      onSend={send}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Builder/ }));
  expect(send).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText("Your instruction"),
    "Review, do not implement.",
  );
  await user.click(screen.getByRole("button", { name: "Send to Agent" }));
  expect(send).toHaveBeenCalledWith(agent, "Review, do not implement.");
  expect(close).toHaveBeenCalledOnce();
});
