// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountProfile, needsAccountSetup, type AccountProfileData } from "./AccountProfile";
vi.mock("./avatar-upload", () => ({ prepareAvatar: vi.fn(async () => "data:image/jpeg;base64,/9j//9k=") }));
const device: AccountProfileData = { id: "device-owner", email: "private@device.invalid", displayName: "My device", nameCustomized: false, googleLinked: false };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("uploads and resets the current account avatar with explicit success", async () => {
  const onSaved = vi.fn(), fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...device, avatarUrl: "data:image/jpeg;base64,/9j//9k=" }) });
  vi.stubGlobal("fetch", fetch);
  const view = render(<AccountProfile profile={{...device, avatarUrl: "https://example.test/photo.jpg"}} onSaved={onSaved} linking={false} onLinkGoogle={vi.fn()} googleDismissed onDismissGoogle={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Upload avatar"), {target: {files: [new File(["image"], "photo.png", {type: "image/png"})]}});
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({avatarUrl: "data:image/jpeg;base64,/9j//9k="});
  expect(screen.getByText("Avatar saved.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Use initials"}));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({resetAvatar: true});
  view.unmount();
});
it("reminds device accounts, not established Google accounts, and respects optional Google dismissal", () => {
  expect(needsAccountSetup(device, false)).toBe(true);
  expect(needsAccountSetup(device, true)).toBe(true);
  expect(needsAccountSetup({ ...device, nameCustomized: true }, true)).toBe(false);
  expect(needsAccountSetup({ ...device, googleLinked: true }, false)).toBe(false);
});
it("saves an existing account name through the real API contract and hides internal email", async () => {
  const onSaved = vi.fn(), fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...device, displayName: "Teammate", nameCustomized: true }) });
  vi.stubGlobal("fetch", fetch);
  render(<AccountProfile profile={device} onSaved={onSaved} linking={false} onLinkGoogle={vi.fn()} googleDismissed={false} onDismissGoogle={vi.fn()} />);
  expect(screen.queryByText(device.email)).toBeNull();
  expect(screen.getByText(/created with this device/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " Teammate " } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ displayName: "Teammate" });
});
it("keeps Google linking available after reminder dismissal and exposes failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const link = vi.fn();
  render(<AccountProfile profile={device} onSaved={vi.fn()} linking={false} onLinkGoogle={link} googleDismissed onDismissGoogle={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Link Google account" })); expect(link).toHaveBeenCalled();
  expect(screen.queryByText("Don’t remind me about Google")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not save"));
});
it("enterprise profiles are read only and omit public identity linking", () => {
  render(<AccountProfile profile={device} publicAuth={false} onSaved={vi.fn()} onLinkGoogle={vi.fn()} linking={false} onDismissGoogle={vi.fn()} googleDismissed={false} />);
  expect(screen.queryByRole("button", { name: "Save name" })).toBeNull();
  expect(screen.queryByLabelText("Upload avatar")).toBeNull();
  expect(screen.queryByText("Google account")).toBeNull();
  expect(screen.queryByRole("button", { name: "Link Google account" })).toBeNull();
  expect(needsAccountSetup(device, false, false)).toBe(false);
  expect(needsAccountSetup(device, false)).toBe(true);
});

it("honors server-managed profiles even in a public client", () => {
  render(<AccountProfile profile={{...device, profileManaged: true}} onSaved={vi.fn()} onLinkGoogle={vi.fn()} linking={false} onDismissGoogle={vi.fn()} googleDismissed={false} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(needsAccountSetup({...device, profileManaged: true}, false)).toBe(false);
});
