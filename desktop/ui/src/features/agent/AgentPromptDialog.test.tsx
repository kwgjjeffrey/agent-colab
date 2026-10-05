// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentPromptDialog } from "./AgentPromptDialog";

afterEach(cleanup);

describe("Agent prompt handoff", () => {
  it("shows the assembled prompt, keeps the query separate, and sends that query", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<AgentPromptDialog open title="Give a very long Canvas title to Agent" description="Review before sending" defaultAgent="codex" installedAgents={{ codex: { installed: true } }} promptFor={() => "Read this Canvas first"} onClose={vi.fn()} onError={vi.fn()} onSend={onSend} />);
    expect(screen.getByText("Read this Canvas first")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("User query"), { target: { value: "Append a summary" } });
    expect(screen.getByText(/User query:\s*Append a summary/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send to Agent" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Append a summary"));
  });
});
