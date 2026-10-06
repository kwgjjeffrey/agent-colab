// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDevices } from "./AccountDevices";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("last-credential rejection is explained and never reported as a successful unlink", async () => {
  const onError = vi.fn(), onChanged = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([
    { id: "device", name: "My Mac", current: true, boundAt: "2026-10-06T00:00:00Z" },
  ]))).mockResolvedValueOnce(new Response("last_credential", { status: 409 })));
  render(<AccountDevices onError={onError} onChanged={onChanged} />);
  await userEvent.click(await screen.findByRole("button", { name: "Unlink" }));
  const dialog = screen.getByRole("alertdialog");
  expect(dialog.textContent).toContain("Unlink My Mac?");
  await userEvent.click(screen.getAllByRole("button", { name: "Unlink" }).at(-1)!);
  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("Link Google or another device")));
  expect(onChanged).not.toHaveBeenCalled();
});
