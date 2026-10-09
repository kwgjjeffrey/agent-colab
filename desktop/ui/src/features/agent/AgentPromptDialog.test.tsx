// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentPromptDialog } from "./AgentPromptDialog";

afterEach(cleanup);

describe("Agent prompt handoff", () => {
  it("opens during preparation, disables handoff, then reveals the prompt without losing the query", () => {
    const props={open:true,title:"Give Canvas to Agent",description:"Prepare",defaultAgent:"codex" as const,installedAgents:{codex:{installed:true}},promptFor:()=>"Ready prompt",onClose:vi.fn(),onError:vi.fn()};
    const {rerender}=render(<AgentPromptDialog {...props} loading />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Preparing Agent prompt…")).toBeTruthy();
    expect((screen.getByRole("button",{name:"Copy prompt"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Ready prompt")).toBeNull();
    fireEvent.change(screen.getByLabelText("User query"),{target:{value:"Keep my instruction"}});
    rerender(<AgentPromptDialog {...props} loading={false} />);
    expect(screen.getByText(/Ready prompt/)).toBeTruthy();
    expect((screen.getByLabelText("User query") as HTMLTextAreaElement).value).toBe("Keep my instruction");
    expect((screen.getByRole("button",{name:"Copy prompt"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("keeps preparation failures inside the open dialog with retry", () => {
    const retry=vi.fn();
    render(<AgentPromptDialog open preparationError="Preparation failed" onRetry={retry} title="Give Files to Agent" description="Prepare" defaultAgent="codex" installedAgents={{}} promptFor={()=>""} onClose={vi.fn()} onError={vi.fn()}/>);
    expect(screen.getByRole("alert").textContent).toBe("Preparation failed");
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));expect(retry).toHaveBeenCalledOnce();
  });
  it("preserves the additional query when forwarding", async () => {
    const onForward = vi.fn();
    render(<AgentPromptDialog open title="Use Sessions" description="Review" defaultAgent="codex" installedAgents={{}} promptFor={() => "Read selected sources"} onClose={vi.fn()} onError={vi.fn()} onForward={onForward} />);
    fireEvent.change(screen.getByLabelText("User query"), { target: { value: "  Focus on blockers  " } });
    fireEvent.click(screen.getByRole("button", { name: "Forward to collaborators’ agent" }));
    expect(onForward).toHaveBeenCalledWith("Focus on blockers");
  });
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
